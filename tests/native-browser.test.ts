import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserConfig, BrowserWindow } from "../src/browsers/types";
import type { Window } from "../src/windows";
import createLoader from "./load-ts.ts";

for (const engine of ["chromium", "webkit", "firefox"] as const) {
  test(`${engine} focuses a known tab without waiting for unrelated application discovery`, async () => {
    let release!: (windows: Window[]) => void;
    const unrelatedDiscovery = new Promise<Window[]>((resolve) => {
      release = resolve;
    });
    const calls: string[][] = [];
    const { focusBrowserTab } = createLoader({
      "../windows": { queryWindows: () => unrelatedDiscovery },
      "../helpers/browser-helper": {
        runBrowserHelper: async (_name, args) => {
          calls.push(args);
          return "ok";
        },
      },
    })("src/browsers/client.ts");
    const tab = { id: "10:ax:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Known tab", url: "" };
    const focus = focusBrowserTab({ id: engine, appName: "Browser", engine }, { id: "10", tabs: [tab] }, tab);
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      assert.equal(calls.length, 1, "an unrelated app must not delay sending the exact tab to its browser helper");
      assert.deepEqual(calls[0].slice(0, 5), ["focus", "Browser", "10", tab.id, tab.title]);
    } finally {
      release([]);
      await focus;
    }
  });

  if (engine === "firefox") continue;

  test(`${engine} list and focus share native targets while preserving the engine's window policy`, async () => {
    const browser: BrowserConfig = { id: engine, appName: "Browser", engine };
    const native = [
      { id: 10, pid: 20, app: "Browser", title: "Standard", subrole: "AXStandardWindow", space: 2 },
      { id: 11, pid: 20, app: "Browser", title: "Dialog", subrole: "AXDialog", space: 3 },
      { id: 12, pid: 20, app: "Browser", title: "System", subrole: "AXSystemDialog", space: 4 },
      { id: 13, pid: 30, app: "Other", title: "Other", subrole: "AXStandardWindow" },
      { id: 0, pid: 20, app: "Browser", title: "Invalid" },
    ] as Window[];
    const calls: { name: string; args: string[] }[] = [];
    const { getBrowserWindows, focusBrowserTab, getBrowserSummary } = createLoader({
      "../windows": { queryWindows: async () => native },
      "../helpers/browser-helper": {
        runBrowserHelper: async (name, args) => {
          calls.push({ name, args });
          if (args[0] === "focus") return "";
          return JSON.stringify(
            JSON.parse(args[2]).map((window: { id: number; title: string; space: number }) => ({
              id: String(window.id),
              title: window.title,
              space: window.space,
              tabs: [
                {
                  id: `${window.id}:ax:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
                  title: "Same title",
                  url: "https://example.com/known",
                },
                { id: `${window.id}:ax:bbbbbbbb-cccc-dddd-eeee-ffffffffffff`, title: "Same title", url: "" },
              ],
            })),
          );
        },
      },
    })("src/browsers/client.ts");
    const windows: BrowserWindow[] = await getBrowserWindows(browser, native);
    assert.deepEqual(windows.map((window) => window.id).sort(), engine === "webkit" ? ["10", "11", "12"] : ["10"]);
    assert.equal(calls[0].name, `${engine}-ax`);
    assert.equal(windows[0].tabs[0].url, "https://example.com/known");
    assert.equal(windows[0].tabs[1].url, "");
    const target = windows.find((window) => window.id === "10");
    assert(target);
    await focusBrowserTab(browser, target, target.tabs[1]);
    assert.deepEqual(calls.at(-1), {
      name: `${engine}-ax`,
      args: ["focus", "Browser", "10", "10:ax:bbbbbbbb-cccc-dddd-eeee-ffffffffffff", "Same title"],
    });
    const before = calls.length;
    await assert.rejects(focusBrowserTab(browser, target, { ...target.tabs[0], id: "bad-target" }), /Invalid/);
    assert.equal(calls.length, before, "malformed targets must never reach the helper");
    assert.deepEqual(await getBrowserSummary(browser, [native[0]]), { windows: 1, tabs: 2 });
    const countBefore = calls.length;
    assert.deepEqual(await getBrowserSummary(browser, [native[0], { ...native[0], id: 14 }]), { windows: 2 });
    assert.equal(calls.length, countBefore, "known multiple windows avoid an extra helper request");
  });

  test(`${engine} rejects malformed helper output and propagates expired tab errors`, async () => {
    let output = "null";
    const browser = { id: engine, appName: "Browser", engine };
    const { getBrowserWindows, focusBrowserTab } = createLoader({
      "../windows": { queryWindows: async () => [] },
      "../helpers/browser-helper": {
        runBrowserHelper: async (_name, args) => {
          if (args[0] === "focus") throw new Error("Tab list expired. Refresh the list.");
          return output;
        },
      },
    })("src/browsers/client.ts");
    for (const invalid of [
      "null",
      '[{"id":10,"tabs":[]}]',
      '[{"id":"10","tabs":[{"id":"10:0","title":4,"url":""}]}]',
    ]) {
      output = invalid;
      await assert.rejects(getBrowserWindows(browser, []), /Invalid/);
    }
    await assert.rejects(
      focusBrowserTab(browser, { id: "10" }, { id: "10:ax:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Old" }),
      /expired/,
    );
  });
}
