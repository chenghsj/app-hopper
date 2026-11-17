import assert from "node:assert/strict";
import test from "node:test";
import { browserSnapshotHarness, browserTabsHarness } from "./window-search-harness.ts";
import { findAll } from "./render-ui.ts";

const browser = { id: "chrome", appName: "Google Chrome", engine: "chromium" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("browser navigation cancels replaced and unmounted queries through Raycast's real promise lifecycle", async () => {
  const signals: AbortSignal[] = [];
  const values = new Map<string, string>();
  const harness = browserSnapshotHarness({
    "@raycast/api": {
      Cache: class {
        get(key: string) {
          return values.get(key);
        }
        set(key: string, value: string) {
          values.set(key, value);
        }
        subscribe() {
          return () => {};
        }
      },
    },
    "./browsers/client": {
      getBrowserWindows: (_browser, _windows, signal: AbortSignal) => {
        assert(signal, "Navigation must pass its request cancellation signal");
        signals.push(signal);
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        );
      },
    },
  });
  harness.render(browser);
  await tick();
  assert.equal(signals.length, 1);
  const refreshing = harness.render(browser).revalidate();
  await tick();
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  harness.unmount();
  await refreshing;
  assert.equal(signals[1].aborted, true);
});

test("nested tab navigation cancels replaced refreshes and releases its scan on Back", async (t) => {
  const requests: { signal?: AbortSignal; resolve: (windows: unknown[]) => void }[] = [];
  const values = new Map<string, string>();
  const harness = browserTabsHarness({
    "@raycast/api": {
      Cache: class {
        get(key: string) {
          return values.get(key);
        }
        set(key: string, value: string) {
          values.set(key, value);
        }
        subscribe() {
          return () => {};
        }
      },
    },
    "./browsers/client": {
      getBrowserWindows: (_browser, _windows, signal?: AbortSignal) =>
        new Promise((resolve, reject) => {
          requests.push({ signal, resolve });
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    },
  });
  t.after(() => {
    harness.unmount();
    requests.forEach((request) => request.resolve([]));
  });
  const window = { id: "155", title: "Window", tabs: [] };
  const render = () => harness.render(browser, window);
  const refresh = () => findAll(render(), (node) => node.props.title === "Refresh List")[0].props.onAction();
  render();
  await tick();
  assert.equal(requests.length, 1);
  assert(requests[0].signal, "Nested tab loads must receive Raycast's cancellation signal");
  const firstRefresh = refresh();
  await tick();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests[1].signal?.aborted, false);
  const secondRefresh = refresh();
  await tick();
  assert.equal(requests[1].signal?.aborted, true);
  assert.equal(requests[2].signal?.aborted, false);
  harness.unmount();
  await Promise.all([firstRefresh, secondRefresh]);
  assert.equal(requests[2].signal?.aborted, true, "Back must release the last nested scan consumer");
});
