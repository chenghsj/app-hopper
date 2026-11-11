import type { MockValue } from "./load-ts.ts";
import type { TestNode } from "./render-ui.ts";
import assert from "node:assert/strict";
import test from "node:test";
import createLoader from "./load-ts.ts";
import { renderer, findAll } from "./render-ui.ts";

const safari = { id: "safari", appName: "Safari", appPath: "/Applications/Safari.app", engine: "webkit" };
const windows = [
  {
    id: "10",
    title: "Work",
    tabs: [
      { id: "10:ax:one", title: "GitHub project", url: "https://github.com/one" },
      { id: "10:ax:two", title: "Reference", url: "https://docs.example.com" },
    ],
  },
  {
    id: "11",
    title: "Personal",
    tabs: [
      { id: "11:ax:one", title: "VS Code docs", url: "https://code.example.com" },
      { id: "11:ax:two", title: "GitHub project", url: "https://github.com/two" },
    ],
  },
];
const native = (id: number, pid: number, app: string, title: string) => ({
  id,
  pid,
  app,
  localizedName: app,
  title,
  bundlePath: `/Applications/${app}.app`,
  "has-ax-reference": true,
  space: 1,
});
const snapshot = {
  windows: [native(10, 1, "Safari", "Work"), native(11, 1, "Safari", "Personal"), native(20, 2, "Code", "Editor")],
  metadataByPid: {},
  applicationOrder: [1, 2],
  browserCounts: { safari: { windows: 2 } },
  browserTabs: { safari: windows },
  axWindowsByPid: {},
};
const rows = (view: ReturnType<typeof renderer>, tree: TestNode) =>
  findAll(tree, (node) => node.type === view.ui.List.Item);
const push = (view: ReturnType<typeof renderer>, row: TestNode, title: string) =>
  findAll(row, (node) => node.type === view.ui.Action.Push && node.props.title === title)[0];
function search(view: ReturnType<typeof renderer>, query: string) {
  view.render().props.onSearchTextChange(query);
  return rows(view, view.render());
}
function tabsView(target: TestNode) {
  return renderer({}, {}, "src/browser-windows.tsx", "BrowserTabsView", target.props);
}

test("root multi-term search crosses app, window and tab fields and switches the exact duplicate-title tab", async () => {
  const focused: MockValue[][] = [],
    closed: boolean[] = [];
  const view = renderer(snapshot, {
    "./browsers/client": { focusBrowserTab: async (...args) => focused.push(args) },
  });
  view.ui.closeMainWindow = async () => closed.push(true);
  const hits = search(view, "safari personal github");
  assert.deepEqual(
    hits.map((row) => row.props.subtitle.value),
    ["github.com/two"],
  );
  const action = findAll(hits[0], (node) => node.type === view.ui.Action && node.props.title === "Switch to Tab")[0];
  await action.props.onAction();
  assert.equal(focused[0][1].id, "11");
  assert.equal(focused[0][2].id, "11:ax:two");
  assert.equal(closed.length, 1);
  assert.equal(search(view, "safari missing github").length, 0);
});

test("app-name matches retain matching content in other apps; titles still rank above URLs", () => {
  const view = renderer(snapshot);
  const hits = search(view, "code");
  assert.deepEqual(
    hits.map((row) => row.props.title),
    ["Code", "VS Code docs"],
  );
  const { rankSearch } = createLoader({})("src/helpers/search.ts");
  const { tabSearchFields } = createLoader({})("src/search-results.ts");
  const tabs = [
    { title: "Reference", url: "https://github.com", id: "url" },
    { title: "GitHub", url: "https://example.com", id: "title" },
  ];
  assert.deepEqual(
    rankSearch(tabs, "github", (tab: MockValue) => tabSearchFields(tab, "Safari", "Work")).map((t: MockValue) => t.id),
    ["title", "url"],
  );
});

test("root chatgpt search includes the app and every matching URL across browser windows", async () => {
  const focused: MockValue[][] = [];
  const view = renderer(
    {
      ...snapshot,
      windows: [...snapshot.windows, native(30, 3, "ChatGPT", "Conversation")],
      applicationOrder: [3, 1, 2],
      browserTabs: {
        safari: [
          {
            id: "10",
            title: "Work",
            tabs: [
              { id: "10:0", title: "Daily lesson", url: "https://chatgpt.com/c/one" },
              { id: "10:1", title: "Unrelated", url: "https://example.com" },
            ],
          },
          {
            id: "11",
            title: "Personal",
            tabs: [
              { id: "11:0", title: "Interview prep", url: "https://chatgpt.com/c/two" },
              { id: "11:1", title: "ChatGPT help", url: "https://help.example.com" },
            ],
          },
        ],
      },
    },
    { "./browsers/client": { focusBrowserTab: async (...args) => focused.push(args) } },
  );
  const hits = search(view, "chatgpt");
  assert.deepEqual(
    hits.map((row) => row.props.title),
    ["ChatGPT", "ChatGPT help", "Daily lesson", "Interview prep"],
  );
  assert.deepEqual(
    hits.slice(2).map((row) => row.props.subtitle.value),
    ["chatgpt.com/c/one", "chatgpt.com/c/two"],
  );
  const action = findAll(hits[3], (node) => node.type === view.ui.Action && node.props.title === "Switch to Tab")[0];
  await action.props.onAction();
  assert.equal(focused[0][1].id, "11");
  assert.equal(focused[0][2].id, "11:0");
});

test("window-title matches open all tabs and compound queries retain only unmatched context", () => {
  const view = renderer(snapshot);
  let hit = search(view, "work")[0];
  assert.equal(hit.props.title, "Work");
  let target = push(view, hit, "Show Tabs").props.target;
  assert.equal(target.props.initialSearchText, "");
  let child = tabsView(target);
  assert.deepEqual(
    rows(child, child.render()).map((row) => row.props.title),
    ["GitHub project", "Reference"],
  );
  hit = search(view, "safari work github")[0];
  target = push(view, hit, "Show Tabs").props.target;
  assert.equal(target.props.initialSearchText, "github");
  child = tabsView(target);
  assert.deepEqual(
    rows(child, child.render()).map((row) => row.props.title),
    ["GitHub project"],
  );
  const browserTarget = push(view, hit, "Show Browser Tabs and Windows").props.target;
  assert.equal(browserTarget.props.initialSearchText, "work github");
});

test("app-only search clears at the next level and parent query and selection survive navigation", () => {
  const view = renderer(snapshot);
  const hit = search(view, "Safari")[0];
  view.render().props.onSelectionChange(hit.props.id);
  const target = push(view, hit, "Show Browser Tabs and Windows").props.target;
  assert.equal(target.props.initialSearchText, "");
  const child = renderer(
    { browserWindows: windows },
    {},
    "src/browser-windows.tsx",
    "BrowserWindowsView",
    target.props,
  );
  assert.equal(rows(child, child.render()).length, 2);
  search(child, "github");
  const parent = view.render();
  assert.equal(parent.props.searchText, "Safari");
  assert.equal(parent.props.selectedItemId, hit.props.id);
  parent.props.onSearchTextChange("code");
  assert.equal(view.render().props.selectedItemId, undefined);
});

test("browser window search carries window-only matches into an unfiltered tab list", () => {
  const view = renderer({ browserWindows: windows }, {}, "src/browser-windows.tsx", "BrowserWindowsView", {
    browser: safari,
  });
  const hit = search(view, "work")[0];
  assert.equal(hit.props.title, "Work");
  const child = tabsView(push(view, hit, "Show Tabs").props.target);
  assert.equal(child.render().props.searchText, "");
  assert.equal(rows(child, child.render()).length, 2);
  assert.deepEqual(
    search(view, "work github").map((row) => row.props.subtitle.value),
    ["github.com/one"],
  );
  const single = renderer({ browserWindows: [windows[0]] }, {}, "src/browser-windows.tsx", "BrowserWindowsView", {
    browser: safari,
    initialSearchText: "safari work",
  });
  assert.equal(rows(single, single.render()).length, 2);
});

test("native and AX window drill-downs share multi-term filtering and consume the app context", () => {
  const app = {
    id: "editor",
    name: "Editor",
    pids: [3],
    windows: [native(30, 3, "Editor", "Project notes"), native(31, 3, "Editor", "Other")],
  };
  const ax = [
    { pid: 3, index: 1, title: "Project notes" },
    { pid: 3, index: 2, title: "Other" },
  ];
  for (const [exportName, windowList] of [
    ["AppWindowsView", app.windows],
    ["AXWindowsView", ax],
  ] as const) {
    const view = renderer({}, {}, "src/app-windows.tsx", exportName, {
      app,
      windows: windowList,
      initialSearchText: "editor notes project",
      onFocus() {},
      onRefresh() {},
    });
    assert.equal(view.render().props.searchText, "notes project");
    assert.deepEqual(
      rows(view, view.render()).map((row) => row.props.title),
      ["Project notes"],
    );
  }
  const root = renderer({
    ...snapshot,
    windows: [native(30, 3, "Editor", "Fallback")].map((w) => ({ ...w, "has-ax-reference": false })),
    axWindowsByPid: { 3: ax },
  });
  const hit = search(root, "editor project notes")[0];
  assert.equal(hit.props.title, "Project notes");
  const target = push(root, hit, "Show Windows").props.target;
  assert.equal(target.props.initialSearchText, "project notes");
});

test("search normalizes case and width, preserves remaining terms and does not require term order", () => {
  const { matchesSearch, remainingSearch } = createLoader({})("src/helpers/search.ts");
  assert.equal(matchesSearch("GitHub Project", "ＰＲＯＪＥＣＴ github"), true);
  assert.equal(matchesSearch("Project", "project missing"), false);
  assert.equal(remainingSearch("  SAFARI  Work GitHub  ", ["Safari", "Work"]), "GitHub");
});

test("Firefox name search includes matching tabs even when bridge IDs differ from native window IDs", () => {
  const view = renderer({
    ...snapshot,
    windows: [native(100, 4, "Firefox", "Runtime / this-firefox"), native(101, 4, "Firefox", "Mozilla Firefox")],
    browserCounts: { firefox: { windows: 2 } },
    browserTabs: {
      firefox: [
        {
          id: "session:1",
          title: "Runtime / this-firefox",
          tabs: [
            { id: "session:tab:1", title: "Firefox add-ons", url: "https://addons.mozilla.org" },
            { id: "session:tab:2", title: "Runtime / this-firefox", url: "about:debugging#/runtime/this-firefox" },
          ],
        },
      ],
    },
  });
  for (const query of ["fire", "Firefox", "ＦＩＲＥ"]) {
    const hits = search(view, query);
    assert.deepEqual(
      hits.map((row) => row.props.title),
      ["Firefox", "Firefox add-ons", "Runtime / this-firefox"],
    );
    assert.equal(hits[0].props.subtitle, "2 windows");
    assert(push(view, hits[0], "Show Browser Tabs and Windows"));
  }
  for (const query of ["firefox runtime", "runtime"]) {
    const hits = search(view, query);
    assert.deepEqual(
      hits.map((row) => row.props.title),
      ["Runtime / this-firefox"],
    );
    assert.equal(hits[0].props.subtitle.value, "about:debugging#/runtime/this-firefox");
  }
});

test("matching apps, native windows and AX windows remain available together", () => {
  const view = renderer({
    ...snapshot,
    windows: [
      native(30, 3, "Notes", "Notes about Safari"),
      { ...native(40, 4, "Notes Helper", "Fallback"), "has-ax-reference": false },
    ],
    axWindowsByPid: { 4: [{ pid: 4, index: 1, title: "Notes document" }] },
    applicationOrder: [4, 3],
  });
  assert.deepEqual(
    search(view, "notes").map((row) => row.props.title),
    ["Notes", "Notes Helper", "Notes about Safari", "Notes document"],
  );
  assert.deepEqual(
    search(view, "document").map((row) => row.props.title),
    ["Notes document"],
  );
});
