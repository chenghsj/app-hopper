import assert from "node:assert/strict";
import test from "node:test";
import createLoader from "./load-ts.ts";

for (const engine of ["chromium", "webkit", "firefox"]) {
  test(`${engine} browser refresh scopes native discovery before querying tabs`, async () => {
    const browser = { id: "test", appName: "Test Browser", appPath: "/Applications/Test Browser.app", engine };
    const calls: string[][] = [];
    const read = async () => [];
    const { getBrowserWindows } = createLoader({
      "./helpers/native-helper": {
        runNativeHelper: async (_helper: string, args: string[]) => {
          calls.push(args);
          return "[]";
        },
      },
      "./native": { getNativeBrowserWindows: read },
      "./firefox": { getFirefoxWindows: read },
    })("src/browsers/client.ts");
    await getBrowserWindows(browser);
    assert.deepEqual(
      calls,
      [["list", browser.appName, browser.appPath]],
      "A browser refresh must not AX-scan unrelated apps",
    );
  });

  test(`${engine} direct adapter discovery also keeps native queries scoped`, async () => {
    const browser = { id: "test", appName: "Test Browser", appPath: "/Applications/Test Browser.app", engine };
    const calls: string[][] = [];
    const load = createLoader({
      "./helpers/native-helper": {
        runNativeHelper: async (_helper: string, args: string[]) => {
          calls.push(args);
          return "[]";
        },
      },
      "../helpers/browser-helper": { runBrowserHelper: async () => "[]" },
      "node:fs/promises": { readdir: async () => [] },
    });
    if (engine === "firefox") await load("src/browsers/firefox.ts").getFirefoxWindows(browser);
    else await load("src/browsers/native.ts").getNativeBrowserWindows(browser);
    assert.deepEqual(calls, [["list", browser.appName, browser.appPath]]);
  });
}
