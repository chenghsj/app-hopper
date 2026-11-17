import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import createLoader from "./load-ts.ts";

const session = "abcdef1234567890";
const browserProcess = { pid: 123, launchedAt: 1000 };
const browser = { id: "zen", appName: "Zen", engine: "firefox" };

async function loadWindows(
  options: { changedFocus?: boolean; changedProcess?: boolean; foreignNative?: boolean } = {},
) {
  const bridge = [1, 2].map((id) => ({
    id,
    title: "YouTube",
    isLastFocused: id === 2,
    focusRevision: 4,
    tabs: [{ id: id + 10, title: "YouTube", url: "https://www.youtube.com/" }],
  }));
  // Reverse native order and use identical frames: content and position cannot distinguish these windows.
  const native = [2, 1].map((id) => ({
    id: String(154 + id),
    title: "YouTube",
    tabs: [],
    tabListUnavailable: true,
    activeTabUrl: "youtube.com",
    space: id,
    isLastFocused: id === 2,
    browserProcess: options.foreignNative ? { ...browserProcess, launchedAt: 2000 } : browserProcess,
  }));
  const { getFirefoxWindows } = createLoader({
    "node:fs/promises": { readdir: async () => [`${session}.sock`] },
    "node:net": {
      createConnection: () => {
        const socket = Object.assign(new EventEmitter(), {
          setTimeout() {},
          destroy() {},
          write(message: string) {
            const command = JSON.parse(message).command;
            const data =
              command === "status"
                ? {
                    version: "1.0.2",
                    lastFocusedWindowId: 2,
                    focusRevision: options.changedFocus ? 5 : 4,
                  }
                : bridge;
            const owner =
              command === "status" && options.changedProcess ? { ...browserProcess, launchedAt: 2000 } : browserProcess;
            queueMicrotask(() =>
              socket.emit("data", Buffer.from(JSON.stringify({ data, browserProcess: owner }) + "\n")),
            );
          },
        });
        queueMicrotask(() => socket.emit("connect"));
        return socket;
      },
    },
    "../helpers/browser-helper": { runBrowserHelper: async () => JSON.stringify(native) },
  })("src/browsers/firefox.ts");
  return getFirefoxWindows(
    browser,
    native.map((window) => ({
      ...window,
      id: Number(window.id),
      pid: 123,
      app: "Zen",
      frame: { x: 0, y: 30, w: 1920, h: 1050 },
    })),
  );
}

test("identical-title and identical-URL windows pair by a verified process and last-focused native identity", async () => {
  const windows = await loadWindows();
  assert.deepEqual(
    windows.map((window: { id: string; nativeWindowId?: string; space?: number }) => [
      window.id,
      window.nativeWindowId,
      window.space,
    ]),
    [
      [`${session}:1`, "155", 1],
      [`${session}:2`, "156", 2],
    ],
  );
});

for (const option of ["changedFocus", "changedProcess", "foreignNative"] as const) {
  test(`focus identity is not used when ${option} invalidates the scan`, async () => {
    const windows = await loadWindows({ [option]: true });
    assert.equal(windows.length, 4);
    assert(windows.slice(0, 2).every((window: { nativeWindowId?: string }) => window.nativeWindowId === undefined));
  });
}
