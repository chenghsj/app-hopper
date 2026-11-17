import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import createLoader, { type MockValue } from "./load-ts.ts";

for (const appName of ["Firefox", "Zen"]) {
  test(`${appName} cancellation closes bridge reads and skips the AX fallback`, async () => {
    const controller = new AbortController();
    let destroyed = false;
    let reads = 0;
    const { getFirefoxWindows } = createLoader({
      "./firefox-integration": { FIREFOX_DIRECTORY: "/firefox", ZEN_DIRECTORY: "/zen" },
      "node:fs/promises": { readdir: async () => ["abcdef1234567890.sock"] },
      "node:net": {
        createConnection: () => {
          const socket: MockValue = new EventEmitter();
          socket.setTimeout = () => {};
          socket.destroy = () => {
            destroyed = true;
          };
          socket.write = () => {
            reads++;
          };
          queueMicrotask(() => socket.emit("connect"));
          return socket;
        },
      },
      "../helpers/browser-helper": {
        runBrowserHelper: async () => assert.fail("Cancelled reads must not start AX discovery"),
      },
    })("src/browsers/firefox.ts");
    const query = getFirefoxWindows({ appName, id: appName.toLowerCase(), engine: "firefox" }, [], controller.signal);
    const cancelled = assert.rejects(query, { name: "AbortError" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(reads, 1);
    controller.abort();
    await cancelled;
    assert.equal(destroyed, true);
  });
}
