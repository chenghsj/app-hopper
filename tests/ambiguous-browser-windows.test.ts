import assert from "node:assert/strict";
import test from "node:test";
import createLoader from "./load-ts.ts";
import { renderer, findAll } from "./render-ui.ts";
import type { BrowserConfig, BrowserWindow } from "../src/browsers/types";

const browser: BrowserConfig = { id: "zen", appName: "Zen", engine: "firefox" };
const companion: BrowserWindow[] = [1, 2].map((id) => ({
  id: `abcdef1234567890:${id}`,
  title: "YouTube",
  tabs: [1, 2, 3].map((tab) => ({
    id: `abcdef1234567890:${id * 10 + tab}`,
    title: "YouTube",
    url: `https://www.youtube.com/watch?v=${id}-${tab}`,
  })),
}));
const native: BrowserWindow[] = [1, 2].map((id) => ({
  id: String(154 + id),
  title: "YouTube",
  tabs: [],
  space: id,
  tabListUnavailable: true,
}));
const nativeWindows = native.map((window) => ({
  id: Number(window.id),
  pid: 20,
  app: "Zen",
  title: window.title,
  space: window.space,
  frame: { x: 0, y: 0, w: 800, h: 600 },
  "has-ax-reference": true,
}));
const app = { id: "zen", name: "Zen", pids: [20], windows: nativeWindows };
const load = createLoader({ "@raycast/api": { Icon: {} } });
const { reconcileFirefoxWindows } = load("src/browsers/firefox-reconciliation.ts");
const { createBrowserSnapshot, summarizeBrowserWindows } = load("src/browsers/snapshot.ts");

function fixture() {
  const windows = reconcileFirefoxWindows(companion, native, 2) as BrowserWindow[];
  const view = renderer({}, {}, "src/browser-windows.tsx", "BrowserWindowsView", {
    browser,
    initialSnapshot: createBrowserSnapshot(browser, { windows, nativeWindows }),
  });
  const rows = () => findAll(view.render(), (node) => node.type === view.ui.List.Item);
  return { windows, view, rows };
}

test("same-title companion and unreadable native windows retain uncertainty without guessing Space", () => {
  const { windows } = fixture();
  assert.equal(windows.length, 4, "Keep both native observations reachable until their identities are known");
  assert(windows.slice(0, 2).every((window) => window.nativeWindowId === undefined && window.space === undefined));
  assert.deepEqual(
    windows.slice(2).map((window) => window.possibleDuplicateOf),
    [companion.map((window) => window.id), companion.map((window) => window.id)],
  );
});

test("ambiguous native observations are collapsed instead of appearing as two extra YouTube windows", async () => {
  const { view, rows } = fixture();
  assert.deepEqual(
    rows().map((row) => row.props.title),
    ["YouTube", "YouTube", "Other Detected Windows"],
  );
  const reveal = findAll(view.render(), (node) => node.props.title === "Show Other Detected Windows")[0];
  await reveal.props.onAction();
  const expanded = rows().filter((row) => row.props.subtitle === "Tab list unavailable");
  assert.equal(expanded.length, 2, "Possible extra windows must remain available for inspection");
  assert.deepEqual(
    expanded.map((row) => row.props.id),
    ["window:155", "window:156"],
  );
  assert(
    findAll(
      view.render(),
      (node) => node.props.title === "Other Detected Windows" && node.type === view.ui.List.Section,
    ).length,
  );
});

test("root summary does not count possible duplicate observations as four confirmed windows", () => {
  const { windows } = fixture();
  const summary = summarizeBrowserWindows(windows);
  assert.equal(summary.windowCountUncertain, true);
  assert.equal(summary.windows, 2);
  const { getAppRow } = load("src/app-row.ts");
  const row = getAppRow(app, { browserTabs: { zen: windows }, browserCounts: { zen: summary }, axWindowsByPid: {} });
  assert.equal(row.subtitle, "Multiple windows");
});

test("search replaces ambiguous native summaries only when matching companion tabs are already shown", () => {
  const { windows } = fixture();
  const { searchApplications } = load("src/search-results.ts");
  const results = searchApplications([app], "YouTube", { zen: windows }, {});
  assert.equal(results.filter((result: { kind: string }) => result.kind === "tab").length, 6);
  assert.equal(results.filter((result: { kind: string }) => result.kind === "window").length, 0);
});

test("a native-only window with no overlapping companion stays directly visible and searchable", () => {
  const extra = { ...native[0], id: "157", title: "Private page", space: 3 };
  const windows = reconcileFirefoxWindows(companion, [...native, extra], 3);
  assert.equal(windows.find((window: BrowserWindow) => window.id === "157").possibleDuplicateOf, undefined);
  const { searchBrowserWindows } = load("src/search-results.ts");
  assert.equal(searchBrowserWindows(windows, "Zen", "Private page")[0].window.id, "157");
});

test("a native-only window stays distinct when verified focus pairs its companion candidate with another window", () => {
  const browserProcess = { pid: 20, launchedAt: 1000 };
  const focused = {
    ...companion[0],
    browserProcess,
    isLastFocused: true,
    focusVerified: true,
  };
  // The companion cannot access the second, private window, which has identical page content.
  const observations = native.map((window, index) => ({
    ...window,
    browserProcess,
    isLastFocused: index === 0,
    activeTabUrl: companion[0].tabs[0].url,
  }));
  const windows = reconcileFirefoxWindows([focused], observations, 2) as BrowserWindow[];
  assert.equal(windows[0].nativeWindowId, "155");
  const privateWindow = windows.find((window) => window.id === "156");
  assert(privateWindow);
  assert.equal(privateWindow.possibleDuplicateOf, undefined, "An already paired companion cannot overlap this window");
  const summary = summarizeBrowserWindows(windows);
  assert.deepEqual(summary, { windows: 2, tabs: undefined });

  const view = renderer({}, {}, "src/browser-windows.tsx", "BrowserWindowsView", {
    browser,
    initialSnapshot: createBrowserSnapshot(browser, { windows, nativeWindows }),
  });
  const rows = findAll(view.render(), (node) => node.type === view.ui.List.Item);
  assert.deepEqual(
    rows.map((row) => row.props.id),
    [`window:${focused.id}`, "window:156"],
    "Both known windows must be visible without expanding possible duplicates",
  );
  const { getAppRow } = load("src/app-row.ts");
  const row = getAppRow(app, { browserTabs: { zen: windows }, browserCounts: { zen: summary }, axWindowsByPid: {} });
  assert.equal(row.subtitle, "2 windows");
});

test("native observations become primary again when their possible companion matches disappear", () => {
  const { windows } = fixture();
  const retained = windows.slice(2);
  const { primaryWindows, unmatchedWindows } = load("src/browsers/snapshot.ts").partitionBrowserWindows(retained);
  assert.equal(primaryWindows.length, 2);
  assert.equal(unmatchedWindows.length, 0);
  assert.deepEqual(summarizeBrowserWindows(retained), { windows: 2, tabs: undefined });
});
