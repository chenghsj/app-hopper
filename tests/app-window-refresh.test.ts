import assert from "node:assert/strict";
import test from "node:test";
import { renderer, findAll } from "./render-ui.ts";
import type { MockValue } from "./load-ts.ts";

function deferred() {
  let resolve!: (value: MockValue[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<MockValue[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

for (const name of ["AppWindowsView", "AXWindowsView"]) {
  function fixture() {
    const requests: { pending: ReturnType<typeof deferred>; signal?: AbortSignal }[] = [];
    const toasts: unknown[] = [];
    let refreshes = 0;
    const app = {
      id: "editor",
      name: "Editor",
      pids: [20],
      windows: [{ id: 10, pid: 20, app: "Editor", title: "Initial" }],
    };
    const start = (signal?: AbortSignal) => {
      const pending = deferred();
      requests.push({ pending, signal });
      // Deliberately ignore cancellation: the view must also reject late results.
      return pending.promise;
    };
    const view = renderer(
      {},
      {
        "./windows": {
          queryWindows: (signal?: AbortSignal) => start(signal),
          queryAXWindows: (_pid: number, signal?: AbortSignal) => start(signal),
        },
        "@raycast/utils": {
          showFailureToast: async (error: unknown) => {
            toasts.push(error);
          },
        },
      },
      "src/app-windows.tsx",
      name,
      {
        app,
        windows: [{ pid: 20, index: 1, title: "Initial", subrole: "AXStandardWindow" }],
        onFocus: async () => {},
        onRefresh: () => {
          refreshes++;
        },
      },
    );
    const refresh = () => findAll(view.render(), (node) => node.props.title === "Refresh List")[0].props.onAction();
    const titles = () =>
      findAll(view.render(), (node) => node.type === view.ui.List.Item).map((row) => row.props.title);
    const result = (title: string) => [
      { id: 10, pid: 20, app: "Editor", index: 1, title, subrole: "AXStandardWindow" },
    ];
    return { view, requests, toasts, refresh, titles, result, refreshes: () => refreshes };
  }

  test(`${name} keeps the newest refresh when an obsolete response arrives last`, async () => {
    const f = fixture();
    const old = f.refresh();
    const latest = f.refresh();
    f.requests[1].pending.resolve(f.result("New"));
    await latest;
    assert.deepEqual(f.titles(), ["New"]);
    f.requests[0].pending.resolve(f.result("Old"));
    await old;
    assert.deepEqual(f.titles(), ["New"], "An older result must not replace the latest windows");
    assert.equal(f.refreshes(), 1, "Only the current request may refresh the root");
    assert.equal(f.requests[0].signal?.aborted, true);
    f.view.unmount();
  });

  test(`${name} cancels on Back and suppresses obsolete errors and root refreshes`, async () => {
    const f = fixture();
    const refresh = f.refresh();
    f.view.unmount();
    f.requests[0].pending.reject(new Error("Late failure"));
    await refresh;
    assert.equal(f.requests[0].signal?.aborted, true, "Leaving the page must stop the native query");
    assert.deepEqual(f.toasts, []);
    assert.equal(f.refreshes(), 0);
  });

  test(`${name} keeps loading the latest request when an obsolete request fails`, async () => {
    const f = fixture();
    const old = f.refresh();
    const latest = f.refresh();
    f.requests[0].pending.reject(new Error("Obsolete failure"));
    await old;
    assert.equal(f.view.render().props.isLoading, true);
    assert.deepEqual(f.toasts, []);
    f.requests[1].pending.resolve(f.result("New"));
    await latest;
    assert.equal(f.view.render().props.isLoading, false);
    assert.equal(f.refreshes(), 1);
    f.view.unmount();
  });
}
