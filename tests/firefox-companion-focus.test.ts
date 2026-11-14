import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import createLoader from "./load-ts.ts";

for (const appName of ["Firefox", "Zen"]) {
  test(`${appName} companion focuses ambiguous windows through its single running app without guessing a window`, async () => {
    const session = "abcdef1234567890";
    const appPath = `/Applications/${appName}.app`;
    const events: unknown[] = [];
    let apps = [{ pid: 99, localizedName: appName, bundlePath: appPath }];
    const native = [155, 156].map((id) => ({ id, pid: 99, app: appName, title: "Same" }));
    const firefox = createLoader({
      "./firefox-integration": { FIREFOX_DIRECTORY: "/firefox", ZEN_DIRECTORY: "/zen" },
      "node:fs/promises": { readdir: async () => [session + ".sock"] },
      "node:net": {
        createConnection: (socketPath: string) => {
          assert(socketPath.startsWith(appName === "Zen" ? "/zen/" : "/firefox/"));
          const socket = new EventEmitter() as EventEmitter & {
            setTimeout(): void;
            destroy(): void;
            write(data: string): void;
          };
          socket.setTimeout = () => {};
          socket.destroy = () => {};
          socket.write = (data) => {
            const command = JSON.parse(data);
            events.push(command.command);
            const response =
              command.command === "list"
                ? [1, 2].map((id) => ({ id, title: "Same", tabs: [{ id: id + 10, title: "Same", url: "" }] }))
                : true;
            queueMicrotask(() => socket.emit("data", Buffer.from(JSON.stringify({ data: response }) + "\n")));
          };
          queueMicrotask(() => socket.emit("connect"));
          return socket;
        },
      },
      "../helpers/browser-helper": {
        runBrowserHelper: async () =>
          JSON.stringify(
            native.map((window) => ({
              ...window,
              id: String(window.id),
              tabs: [{ title: "Same", id: `${window.id}:0`, url: "" }],
            })),
          ),
      },
      "../windows": {
        queryWindows: async () => native,
        getRunningApplications: async () => apps,
        activateRunningApplication: async (pid: number) => events.push(["activate", pid]),
        focusNativeWindowById: async () => assert.fail("Ambiguous windows must never be raised by a guessed ID"),
      },
    })("src/browsers/firefox.ts");
    const browser = { id: appName.toLowerCase(), appName, appPath, engine: "firefox" };
    const [window] = await firefox.getFirefoxWindows(browser);
    assert.equal(window.nativeWindowId, undefined);
    events.length = 0;
    await firefox.focusFirefoxTab(window.id, window.tabs[0].id, browser);
    assert.deepEqual(events, ["focus", "list", ["activate", 99]]);

    apps = [
      { pid: 100, localizedName: appName, bundlePath: `/other/${appName}.app` },
      { pid: 99, localizedName: appName, bundlePath: appPath },
    ];
    events.length = 0;
    await firefox.focusFirefoxTab(window.id, window.tabs[0].id, browser);
    assert.deepEqual(events.at(-1), ["activate", 99], "Use the configured browser bundle, not its name alone");

    apps.push({ pid: 101, localizedName: appName, bundlePath: appPath });
    events.length = 0;
    await assert.rejects(firefox.focusFirefoxTab(window.id, window.tabs[0].id, browser), /identify.*process/i);
    assert(!events.some((event) => Array.isArray(event)), "Do not guess between separate browser processes");
  });
}
