import type { MockValue, MockModules } from "./load-ts.ts";
import type { TestNode } from "./render-ui.ts";
import assert from "node:assert/strict";
import test from "node:test";
import createLoader from "./load-ts.ts";
import { renderer, findAll } from "./render-ui.ts";

const native = (pid: number, app: string, extra = {}) => ({
  id: pid * 10,
  pid,
  app,
  localizedName: app,
  bundlePath: `/Applications/${app}.app`,
  title: `${app} window`,
  space: 1,
  frame: { x: 0, y: 0, w: 800, h: 600 },
  "has-ax-reference": true,
  ...extra,
});
const snapshot = (windows: ReturnType<typeof native>[], extra = {}) => ({
  windows,
  applications: [],
  applicationOrder: [],
  metadataByPid: {},
  browserCounts: {},
  browserTabs: {},
  axWindowsByPid: {},
  ...extra,
});
const items = (view: ReturnType<typeof renderer>, tree: TestNode) =>
  findAll(tree, (node) => node.type === view.ui.List.Item);
const action = (view: ReturnType<typeof renderer>, row: TestNode, title: string) =>
  findAll(row, (node) => node.type === view.ui.Action && node.props.title === title)[0];

test("root apps share one MRU list across browser, minimized, hidden, and windowless states", () => {
  const view = renderer(
    snapshot(
      [
        native(1, "Google Chrome", { frontOrder: 0 }),
        native(2, "Editor", { space: 0, isMinimized: true, frontOrder: 8 }),
        native(3, "Mail", { space: 0, isHidden: true, frontOrder: 4 }),
      ],
      {
        applicationOrder: [2, 4, 1, 3],
        applications: [{ pid: 4, localizedName: "Notes", bundlePath: "/Applications/Notes.app", isHidden: false }],
        axWindowsByPid: { 4: [] },
      },
    ),
  );
  const tree = view.render();
  assert.equal(findAll(tree, (node) => node.type === view.ui.List.Section).length, 0);
  const rows = items(view, tree);
  assert.deepEqual(
    rows.map((row) => row.props.title),
    ["Editor", "Notes", "Google Chrome", "Mail"],
  );
  assert.equal(rows[0].props.accessories, undefined);
  assert.equal(rows[3].props.accessories, undefined);
  assert.equal(rows[1].props.subtitle, "");
  assert(action(view, rows[1], "Show Application"));
  assert.equal(action(view, rows[0], "Activate Application").props.title, "Activate Application");
});

test("content search exposes focusable windows with MRU ordering for equal relevance", () => {
  const view = renderer(
    snapshot(
      [
        native(1, "Google Chrome", { title: "Project docs" }),
        native(2, "Editor", { title: "Project source" }),
        native(2, "Editor", { id: 21, title: "Project notes" }),
      ],
      { applicationOrder: [2, 1] },
    ),
  );
  view.render().props.onSearchTextChange("project");
  const rows = items(view, view.render());
  assert.deepEqual(
    rows.map((row) => row.props.title),
    ["Project source", "Project notes", "Project docs"],
  );
  assert.equal(rows[0].props.subtitle, "Editor");
  assert(action(view, rows[0], "Focus Window"));
  assert(findAll(rows[0], (node) => node.type === view.ui.Action.Push && node.props.title === "Show Windows")[0]);
  assert(
    findAll(
      rows[2],
      (node) => node.type === view.ui.Action.Push && node.props.title === "Show Browser Tabs and Windows",
    )[0],
  );
});

test("one browser window skips the window layer, while multiple windows remain selectable", () => {
  const browser = {
    id: "chrome",
    appName: "Google Chrome",
    appPath: "/Applications/Google Chrome.app",
    engine: "chromium",
  };
  const windows = [{ id: "10", title: "Work", tabs: [{ id: "10:0", title: "Docs", url: "https://example.com" }] }];
  const single = renderer({ browserWindows: windows }, {}, "src/browser-windows.tsx", "BrowserWindowsView", {
    browser,
  });
  assert.deepEqual(
    items(single, single.render()).map((row) => row.props.title),
    ["Docs"],
  );
  const multiple = renderer(
    { browserWindows: [...windows, { id: "20", title: "Other", tabs: [] }] },
    {},
    "src/browser-windows.tsx",
    "BrowserWindowsView",
    { browser },
  );
  assert.deepEqual(
    items(multiple, multiple.render()).map((row) => row.props.title),
    ["Work", "Other"],
  );
});

test("same-bundle processes merge once and unranked apps fall back to front order rather than Space", () => {
  const { groupApplications } = createLoader({})("src/app-groups.ts");
  const windows = [native(1, "One", { frontOrder: 8, space: 0 }), native(2, "Two", { frontOrder: 1, space: 4 })];
  assert.deepEqual(
    groupApplications(windows, {}).map((app: { name: string }) => app.name),
    ["Two", "One"],
  );
  const groups = groupApplications(
    [native(1, "One", { bundlePath: undefined })],
    {},
    [2, 1],
    [
      { pid: 1, localizedName: "One", bundlePath: "/Applications/One.app" },
      { pid: 2, localizedName: "One", bundlePath: "/Applications/One.app" },
    ],
  );
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].pids, [1, 2]);
  assert.equal(groups[0].windows.length, 1);
});

test("Space zero stays unlabeled unless an actual state is known", () => {
  const { getWindowAccessories } = createLoader({ "@raycast/api": { Icon: { Minus: "minus" } } })(
    "src/helpers/window-presentation.ts",
  );
  assert.deepEqual(getWindowAccessories({ space: 0 }), []);
  assert.deepEqual(getWindowAccessories({ space: 2, isMinimized: true, isHidden: true }), [
    { icon: "minus", tooltip: "Minimized" },
    { text: "Space 2" },
  ]);
});

test("macOS app ordering batches PID lookups and skips missing or duplicate entries", async () => {
  const calls: MockValue[] = [];
  const { getApplicationOrder } = createLoader({
    "./applescript": {
      execBinary: async (binary, args) => {
        calls.push({ binary, args });
        return {
          stdout:
            calls.length === 1
              ? "ASN:0x0-0x123: ASN:0x0-0x456: ASN:0x0-0x789:"
              : "pid = 42\n[ NULL ]\npid = 7\npid = 42\n",
        };
      },
    },
  })("src/helpers/app-order.ts");
  assert.deepEqual(await getApplicationOrder(), [42, 7]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args, [
    "info",
    "-only",
    "pid",
    "ASN:0x0-0x123:",
    "info",
    "-only",
    "pid",
    "ASN:0x0-0x456:",
    "info",
    "-only",
    "pid",
    "ASN:0x0-0x789:",
  ]);
});

test("windowless apps verify the live process and successful AX query before reopening", async () => {
  const { activateApplication } = createLoader({})("src/window-focus.ts");
  const app = { id: "notes", name: "Notes", bundlePath: "/Applications/Notes.app", pids: [4], windows: [] };
  const calls: MockValue[] = [];
  const ops = {
    getRunningApplications: async () => [{ pid: 4, bundlePath: app.bundlePath }],
    queryAXWindows: async () => [],
    requestApplicationWindow: async () => {
      calls.push("reopen");
    },
  };
  assert.equal(await activateApplication(app, ops), "focused");
  assert.deepEqual(calls, ["reopen"]);
  calls.length = 0;
  await assert.rejects(
    activateApplication(app, {
      ...ops,
      queryAXWindows: async () => {
        throw new Error("Permission denied");
      },
    }),
    /Permission denied/,
  );
  assert.equal(
    await activateApplication(app, {
      ...ops,
      getRunningApplications: async () => [{ pid: 4, bundlePath: "/Applications/Other.app" }],
    }),
    "missing",
  );
  assert.deepEqual(calls, []);
});

test("a browser with no tab windows offers the app action rather than an empty drill-down", () => {
  const view = renderer(snapshot([native(1, "Google Chrome")], { browserCounts: { chrome: { windows: 0 } } }));
  const row = items(view, view.render())[0];
  assert(action(view, row, "Show Application"));
  assert.equal(findAll(row, (node) => node.type === view.ui.Action.Push).length, 0);
});

test("application enrichment publishes independently and checks AX only for apps missing native windows", async () => {
  const { loadWindowData } = createLoader({})("src/window-data.ts");
  const snapshots: MockValue[] = [],
    queried: number[] = [];
  let finishApps!: (apps: { pid: number; localizedName: string }[]) => void;
  const pending = new Promise<{ pid: number; localizedName: string }[]>((resolve) => {
    finishApps = resolve;
  });
  const loading = loadWindowData((data: MockValue) => snapshots.push(data), {
    queryWindows: async () => [native(1, "Editor")],
    getRunningApplicationMetadata: async () => ({}),
    getRunningApplications: () => pending,
    getApplicationOrder: async () => [2, 1],
    getBrowserSummary: async () => {
      throw new Error("Unexpected browser");
    },
    queryAXWindows: async (pid: number) => {
      queried.push(pid);
      return [];
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots[0].windows.length, 1);
  assert.deepEqual(snapshots.at(-1).applicationOrder, [2, 1]);
  finishApps([
    { pid: 1, localizedName: "Editor" },
    { pid: 2, localizedName: "Notes" },
  ]);
  await loading;
  assert.deepEqual(queried, [2]);
  assert.equal(snapshots.at(-1).applications.length, 2);
  assert.deepEqual(snapshots.at(-1).axWindowsByPid[2], []);
});

test("AX window state is read explicitly and unknown state is preserved", async () => {
  const separator = "\x1f",
    end = "\x1e";
  let output = ["v2", "2", "AXStandardWindow", "true", "false", "Document"].join(separator) + end;
  const { queryAXWindows } = createLoader({ "./helpers/applescript": { runAppleScript: async () => output } })(
    "src/windows.ts",
  );
  const [window] = await queryAXWindows(20);
  assert.equal(window.index, 2);
  assert.equal(window.title, "Document");
  assert.equal(window.isMinimized, true);
  assert.equal(window.isHidden, false);
  output = ["v2", "2", "AXStandardWindow", "", "", "Unknown"].join(separator) + end;
  const [unknown] = await queryAXWindows(20);
  assert.equal(unknown.isMinimized, undefined);
  assert.equal(unknown.isHidden, undefined);
});

test("browser window state follows native window IDs and never guesses a bridge window by position", async () => {
  const windows = [
    { id: "20", title: "Second", tabs: [] },
    { id: "10", title: "First", tabs: [] },
    { id: "session:10", title: "Bridge", tabs: [] },
  ];
  const { getBrowserWindows } = createLoader({ "./webkit": { getWebKitWindows: async () => windows } })(
    "src/browsers/client.ts",
  );
  const result = await getBrowserWindows({ appName: "Test Browser", engine: "webkit" }, [
    native(1, "Test Browser", { id: 10, space: 2, isHidden: true, isMinimized: true }),
    native(1, "Test Browser", { id: 20, space: 3, isHidden: true, isMinimized: false }),
  ]);
  assert.equal(result[0].isMinimized, false);
  assert.equal(result[0].space, 3);
  assert.equal(result[1].isMinimized, true);
  assert.equal(result[1].space, 2);
  assert.equal(result[2].isMinimized, undefined);
  assert.equal(result[2].space, undefined);
  assert.equal(result[2].isHidden, true);
});

test("mixed browser windows show only the total count in the root list", () => {
  const view = renderer(
    snapshot(
      [
        native(1, "Safari", { id: 10, isMinimized: false }),
        native(1, "Safari", { id: 11, space: 0, isMinimized: true }),
      ],
      {
        browserCounts: { safari: { windows: 2 } },
        browserTabs: {
          safari: [
            { id: "10", title: "Start Page", space: 2, isMinimized: false, tabs: [] },
            { id: "11", title: "Work", isMinimized: true, tabs: [] },
          ],
        },
      },
    ),
  );
  const row = items(view, view.render())[0];
  assert.equal(row.props.subtitle, "2 windows");
  assert.equal(row.props.accessories, undefined);
});

test("app rows show known Space only when the resolved application has exactly one window", () => {
  const cases = [
    {
      name: "single native window",
      windows: [native(1, "Editor", { space: 2 })],
      expected: "Space 2",
    },
    {
      name: "single native window with unknown Space",
      windows: [native(1, "Editor", { space: 0 })],
    },
    {
      name: "multiple native windows in the same Space",
      windows: [native(1, "Editor", { id: 10, space: 2 }), native(1, "Editor", { id: 11, space: 2 })],
    },
    {
      name: "browser summary reveals multiple windows",
      windows: [native(1, "Safari", { space: 2 })],
      data: { browserCounts: { safari: { windows: 2 } } },
    },
    {
      name: "single resolved browser window",
      windows: [native(1, "Safari", { space: 0 })],
      data: {
        browserCounts: { safari: { windows: 1, tabs: 0 } },
        browserTabs: { safari: [{ id: "10", title: "Work", space: 3, tabs: [] }] },
      },
      expected: "Space 3",
    },
    {
      name: "bridge-only browser window does not borrow a native Space",
      windows: [native(1, "Firefox", { space: 2 })],
      data: {
        browserCounts: { firefox: { windows: 1, tabs: 0 } },
        browserTabs: { firefox: [{ id: "session:10", title: "Work", tabs: [] }] },
      },
    },
    {
      name: "AX fallback reveals multiple windows",
      windows: [native(1, "Editor", { space: 2, "has-ax-reference": false })],
      data: {
        axWindowsByPid: {
          1: [
            { pid: 1, index: 1, title: "One" },
            { pid: 1, index: 2, title: "Two" },
          ],
        },
      },
    },
    {
      name: "unresolved AX windows do not claim a single known Space",
      windows: [native(1, "Editor", { space: 2, "has-ax-reference": false })],
    },
    {
      name: "windowless app",
      windows: [],
      data: { applications: [{ pid: 1, localizedName: "Editor", bundlePath: "/Applications/Editor.app" }] },
    },
  ];
  for (const scenario of cases) {
    const view = renderer(snapshot(scenario.windows, scenario.data));
    const row = items(view, view.render())[0];
    const expected = scenario.expected ? [{ text: scenario.expected }] : undefined;
    assert.deepEqual(row.props.accessories, expected, scenario.name);
    view.render().props.onSearchTextChange(row.props.title);
    assert.deepEqual(items(view, view.render())[0].props.accessories, expected, `${scenario.name}: app-name search`);
  }
});

test("browser cache keys change with the window snapshot instead of reusing a stale single-window layout", () => {
  const requests: { args: MockValue[]; options: { keepPreviousData: boolean } }[] = [];
  const mocks: MockModules = {
    "@raycast/utils": {
      useCachedPromise: (_fn, args, options) => {
        requests.push({ args, options });
        return { data: [], isLoading: true, revalidate() {} };
      },
    },
  };
  const browser = { id: "safari", appName: "Safari", engine: "webkit" };
  for (const initialNativeWindows of [
    [native(1, "Safari")],
    [native(1, "Safari"), native(1, "Safari", { id: 11, isMinimized: true })],
  ]) {
    renderer({}, mocks, "src/browser-windows.tsx", "BrowserWindowsView", { browser, initialNativeWindows }).render();
  }
  assert.notEqual(requests[0].args[1], requests[1].args[1]);
  assert.equal(requests[1].options.keepPreviousData, false);
});
