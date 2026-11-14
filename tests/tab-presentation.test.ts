import type { MockValue } from "./load-ts.ts";
import assert from "node:assert/strict";
import test from "node:test";
import createLoader from "./load-ts.ts";
import { renderer, findAll } from "./render-ui.ts";
import { browsers } from "../src/browsers/registry";

const chrome = {
  id: "chrome",
  appName: "Google Chrome",
  appPath: "/Applications/Google Chrome.app",
  engine: "chromium",
};
const rawTitle = "Netflix - 屬於「dmk_prod」群組 - 已固定";
const rawUrl = "https://www.netflix.com/browse?profile=2#continue";
const tab = { id: "10:ax:one", title: rawTitle, url: rawUrl };
const first = { id: "10", title: "Work", space: 2, tabs: [tab] };
const second = { id: "11", title: "Personal", space: 4, tabs: [{ ...tab, id: "11:ax:one" }] };

test("every registered browser displays raw tab titles without adding pin or group accessories", () => {
  const { getBrowserTabProps } = createLoader({
    "@raycast/api": { Icon: { Globe: "globe", Tack: "tack", Minus: "minus" } },
  })("src/helpers/browser-tab-presentation.ts");
  const titles = [
    rawTitle,
    "Netflix - Part of group Work - Pinned",
    "Netflix - 已釘選",
    "Google - 已固定 - 記憶體用量 - 70.3 MB",
    "Pinned tabs - a guide",
    "Netflix - Angeheftet",
    "Page - 已固定教學",
    `Page - Part of group ${"🚀".repeat(40)}`,
  ];
  for (const browser of browsers) {
    for (const title of titles) {
      const target = { ...tab, title };
      const props = getBrowserTabProps(browser, first, target);
      assert.equal(props.title, title, `${browser.id} preserves the browser-reported title`);
      assert.deepEqual(props.accessories, [{ text: "Space 2" }]);
      assert.equal(target.title, title);
    }
    assert.equal(getBrowserTabProps(browser, first, { ...tab, title: "" }).title, "Untitled Tab");
  }
});

test("URL labels shorten web addresses without dropping ports, paths, queries or fragments", () => {
  const { formatTabUrl } = createLoader({ "@raycast/api": {} })("src/helpers/browser-tab-presentation.ts");
  assert.equal(formatTabUrl(rawUrl), "netflix.com/browse?profile=2#continue");
  assert.equal(formatTabUrl("http://www.example.com:8080/a%20b"), "example.com:8080/a%20b");
  assert.equal(formatTabUrl("https://www.example.com/"), "example.com");
  for (const url of ["", "https://", "about:blank", "file:///tmp/page.html", "chrome-extension://id/page.html"]) {
    assert.equal(formatTabUrl(url), url);
  }
});

test("root results distinguish duplicate tabs by Space and preserve raw search and focus targets", async () => {
  const focused: MockValue[][] = [];
  const view = renderer(
    {
      windows: [first, second].map((window) => ({
        ...window,
        id: Number(window.id),
        pid: 20,
        app: chrome.appName,
        localizedName: chrome.appName,
        bundlePath: chrome.appPath,
        "has-ax-reference": true,
      })),
      metadataByPid: {},
      applicationOrder: [20],
      browserCounts: { chrome: { windows: 2 } },
      browserTabs: { chrome: [first, second] },
      axWindowsByPid: {},
    },
    {
      "./browsers/client": { focusBrowserTab: async (...args) => focused.push(args) },
    },
  );
  // The raw group label and full URL remain searchable.
  view.render().props.onSearchTextChange("dmk_prod https://www.netflix.com/browse?profile=2#continue");
  const rows = findAll(view.render(), (node) => node.type === view.ui.List.Item);
  assert.equal(rows.length, 2);
  for (const [index, row] of rows.entries()) {
    assert.equal(row.props.title, rawTitle);
    assert.deepEqual(row.props.subtitle, { value: "netflix.com/browse?profile=2#continue", tooltip: rawUrl });
    assert.equal(row.props.icon.value.fileIcon, chrome.appPath);
    assert.match(row.props.icon.tooltip, /Google Chrome/);
    assert.deepEqual(row.props.accessories, [
      { text: "Google Chrome", tooltip: "Tab in Google Chrome" },
      { text: index === 0 ? "Space 2" : "Space 4" },
    ]);
  }
  const action = findAll(rows[1], (node) => node.props.title === "Switch to Tab")[0];
  await action.props.onAction();
  assert.equal(focused[0][1], second);
  assert.equal(focused[0][2], second.tabs[0]);
  assert.equal(focused[0][2].title, rawTitle);
});

test("every tab list shows Space on each row, including single-window and nested lists", () => {
  for (const exportName of ["BrowserWindowsView", "BrowserTabsView"]) {
    const view = renderer({ browserWindows: [first] }, {}, "src/browser-windows.tsx", exportName, {
      browser: chrome,
      window: first,
    });
    const tree = view.render();
    assert.doesNotMatch(tree.props.navigationTitle, /Space 2$/);
    const sections = findAll(tree, (node) => node.type === view.ui.List.Section);
    assert.equal(sections.length, 0);
    const rows = findAll(tree, (node) => node.type === view.ui.List.Item);
    assert.equal(rows[0].props.title, rawTitle);
    assert.equal(rows[0].props.accessories.at(-1).text, "Space 2");
  }
  const multi = renderer({ browserWindows: [first, second] }, {}, "src/browser-windows.tsx", "BrowserWindowsView", {
    browser: chrome,
    initialSearchText: "netflix",
  });
  const rows = findAll(multi.render(), (node) => node.type === multi.ui.List.Item);
  assert.deepEqual(
    rows.map((row) => row.props.accessories.at(-1).text),
    ["Space 2", "Space 4"],
  );
});

test("unknown Space stays hidden without changing the raw tab title", () => {
  const { getBrowserTabProps } = createLoader({
    "@raycast/api": { Icon: { Tack: "tack", Minus: "minus" } },
  })("src/helpers/browser-tab-presentation.ts");
  for (const space of [undefined, 0, -1, NaN, Infinity, 1.5]) {
    const window = { ...first, space };
    const props = getBrowserTabProps({ ...chrome, engine: "firefox" }, window, tab);
    assert.equal(props.title, rawTitle);
    assert.deepEqual(props.accessories, []);
  }
});
