import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { MockValue } from "./load-ts.ts";

const source = ts.transpileModule(fs.readFileSync("companion/background.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None },
}).outputText;

function fixture(
  getLastFocused: () => Promise<{ id: number }> = async () => ({ id: 2 }),
  getAll: () => Promise<MockValue[]> = async () =>
    [1, 2].map((id) => ({
      id,
      tabs: [{ id: id + 10, title: "Same", url: "https://example.com", active: true }],
    })),
) {
  let onFocus!: (id: number) => void;
  const context: MockValue = {
    browser: {
      windows: {
        onFocusChanged: {
          addListener: (listener: typeof onFocus) => {
            onFocus = listener;
          },
        },
        getLastFocused,
        getAll,
        update: () => assert.fail("Identity collection must not focus, move or resize any window"),
      },
      runtime: {
        getManifest: () => ({ version: "1.0.2" }),
        getBrowserInfo: async () => ({ name: "Firefox" }),
        connectNative: () => ({
          onMessage: { addListener() {} },
          onDisconnect: { addListener() {} },
          postMessage() {},
        }),
      },
      browserAction: { setBadgeText() {}, onClicked: { addListener() {} } },
    },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source + "\nglobalThis.command = handleCommand;", context);
  return {
    command: context.command as (request: { command: string }) => Promise<MockValue>,
    focus: (id: number) => onFocus(id),
  };
}

test("companion reports last-focused identity independently of identical titles, URLs and geometry", async () => {
  const f = fixture();
  const windows = await f.command({ command: "list" });
  assert.deepEqual(
    Array.from(windows, (window: MockValue) => [window.id, window.isLastFocused, window.focusRevision]),
    [
      [1, false, 0],
      [2, true, 0],
    ],
  );
  f.focus(-1);
  const status = await f.command({ command: "status" });
  assert.equal(status.lastFocusedWindowId, 2, "The browser's last window remains known while Raycast is active");
  assert.equal(status.focusRevision, 1);
});

test("companion drops focus evidence when focus changes while its identity query is pending", async () => {
  let resolve!: (value: { id: number }) => void;
  const f = fixture(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const loading = f.command({ command: "list" });
  await new Promise((done) => setImmediate(done));
  f.focus(1);
  resolve({ id: 2 });
  const windows = await loading;
  assert(windows.every((window: MockValue) => window.isLastFocused === undefined));
});

test("unavailable focus metadata leaves companion tabs available", async () => {
  const f = fixture(async () => {
    throw new Error("Private window unavailable");
  });
  const windows = await f.command({ command: "list" });
  assert.equal(windows.length, 2);
  assert(windows.every((window: MockValue) => window.tabs.length === 1 && window.isLastFocused === undefined));
});

test("companion reports the active tab URL independently of duplicate titles and tab order", async () => {
  for (const url of ["https://example.com/#active", ""]) {
    const f = fixture(undefined, async () => [
      {
        id: 1,
        tabs: [
          { id: 11, title: "Same", url: "https://example.com/#background", active: false },
          { id: 12, title: "Same", url, pendingUrl: "https://example.com/#pending", active: true },
        ],
      },
    ]);
    const [window] = await f.command({ command: "list" });
    assert.equal(window.activeTabUrl, url || "https://example.com/#pending");
    assert.equal(window.tabs.length, 2);
    assert.equal(window.tabs[0].url, "https://example.com/#background");
  }
});

test("companion does not label the first tab as active when active selection is unavailable", async () => {
  const f = fixture(undefined, async () => [
    { id: 1, tabs: [{ id: 11, title: "Same", url: "https://example.com/#background" }] },
  ]);
  const [window] = await f.command({ command: "list" });
  assert.equal(window.activeTabUrl, undefined);
  assert.equal(window.tabs.length, 1);
});
