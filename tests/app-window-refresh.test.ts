import assert from "node:assert/strict";
import test from "node:test";
import { findAll } from "./render-ui.ts";
import { appWindowsHarness } from "./window-search-harness.ts";
import type { MockValue } from "./load-ts.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));

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
    const harness = appWindowsHarness(name, {
      "./windows": {
        queryWindows: (signal?: AbortSignal) => start(signal),
        queryAXWindows: (_pid: number, signal?: AbortSignal) => start(signal),
      },
      "@raycast/api": {
        showToast: async (options: unknown) => {
          toasts.push(options);
        },
      },
    });
    const props = {
      app,
      windows: [{ pid: 20, index: 1, title: "Initial", subrole: "AXStandardWindow" }],
      onFocus: async () => {},
      onRefresh: () => {
        refreshes++;
      },
    };
    const view = { ...harness, render: () => harness.render(props) };
    const refresh = () => {
      const result = findAll(view.render(), (node) => node.props.title === "Refresh List")[0].props.onAction();
      view.render();
      return result;
    };
    const titles = () =>
      findAll(view.render(), (node) => node.type === view.ui.List.Item).map((row) => row.props.title);
    const result = (title: string) => [
      { id: 10, pid: 20, app: "Editor", index: 1, title, subrole: "AXStandardWindow" },
    ];
    return { view, app, requests, toasts, refresh, titles, result, refreshes: () => refreshes };
  }

  test(`${name} defers reads until Refresh and shows progress with the real Raycast promise hook`, async () => {
    const f = fixture();
    assert.equal(f.view.render().props.isLoading, false);
    assert.equal(f.requests.length, 0, "Entering a seeded window page must not start a duplicate scan");
    const refresh = f.refresh();
    assert.equal(f.view.render().props.isLoading, true);
    assert.equal(f.requests.length, 1);
    f.requests[0].pending.resolve(f.result("New"));
    await refresh;
    await tick();
    assert.equal(f.view.render().props.isLoading, false);
    assert.deepEqual(f.titles(), ["New"]);
    f.view.unmount();
  });

  test(`${name} keeps the newest refresh when an obsolete response arrives last`, async () => {
    const f = fixture();
    const old = f.refresh();
    const latest = f.refresh();
    f.requests[1].pending.resolve(f.result("New"));
    await latest;
    assert.deepEqual(f.titles(), ["New"]);
    f.requests[0].pending.resolve(f.result("Old"));
    await old;
    await tick();
    assert.deepEqual(f.titles(), ["New"], "An older result must not replace the latest windows");
    assert.equal(f.refreshes(), 1, "Only the current request may refresh the root");
    assert.equal(f.requests[0].signal?.aborted, true);
    f.view.unmount();
  });

  test(`${name} cancels a different application's refresh without automatically scanning its replacement`, async () => {
    const f = fixture();
    f.refresh();
    f.app.id = "another-editor";
    f.view.render();
    assert.equal(f.requests[0].signal?.aborted, true);
    assert.equal(f.view.render().props.isLoading, false);
    assert.equal(f.requests.length, 1);
    f.requests[0].pending.resolve(f.result("Obsolete"));
    await tick();
    assert.equal(f.refreshes(), 0);
    f.refresh();
    assert.equal(f.requests.length, 2);
    assert.equal(f.view.render().props.isLoading, true);
    f.requests[1].pending.resolve(f.result("Current"));
    await tick();
    assert.deepEqual(f.titles(), ["Current"]);
    assert.equal(f.view.render().props.isLoading, false);
    f.view.unmount();
  });

  test(`${name} cancels on Back and suppresses obsolete errors and root refreshes`, async () => {
    const f = fixture();
    const refresh = f.refresh();
    f.view.unmount();
    f.requests[0].pending.reject(new Error("Late failure"));
    await refresh;
    await tick();
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
    await tick();
    assert.equal(f.view.render().props.isLoading, true);
    assert.deepEqual(f.toasts, []);
    f.requests[1].pending.resolve(f.result("New"));
    await latest;
    assert.equal(f.view.render().props.isLoading, false);
    assert.equal(f.refreshes(), 1);
    f.view.unmount();
  });
}
