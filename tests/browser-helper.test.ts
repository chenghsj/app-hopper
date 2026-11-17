import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import createLoader from "./load-ts.ts";
import type { MockValue } from "./load-ts.ts";

test("browser helper preserves one native session, serializes requests, and rejects expired identities", async (t) => {
  const fixture = path.join(__dirname, "fixtures", "browser-helper.ts");
  const children: ReturnType<typeof spawn>[] = [];
  t.after(() => {
    children.forEach((child) => child.kill());
  });
  const load = createLoader({
    "./applescript": { OSA_TIMEOUT_MS: 1000 },
    "swift:../../swift/app-hopper-native": { helperExecutablePath: async () => "/fixture/browser-helper" },
    "node:child_process": {
      spawn: () => {
        const child = spawn(process.execPath, ["--import", "tsx", fixture]);
        children.push(child);
        return child;
      },
    },
  });
  const { runBrowserHelper } = load("src/helpers/browser-helper.ts");
  const request = (args: string[]) => runBrowserHelper("test", args);
  const identity = "10:ax:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  await assert.rejects(request(["focus", "Browser", "10", identity]), /expired/);
  assert.equal(children.length, 0);
  const [first, second] = await Promise.all([request(["list", "Browser", "one"]), request(["list", "Browser", "two"])]);
  assert.equal(JSON.parse(first).count, 1);
  assert.equal(JSON.parse(second).count, 2);
  assert.equal(children.length, 1);
  const separateEngine = await runBrowserHelper("another-engine", ["list", "Browser"]);
  assert.equal(JSON.parse(separateEngine).count, 1, "One package binary must retain separate engine sessions");
  assert.equal(children.length, 2);
  await assert.rejects(request(["fail", "Browser"]), /Tab changed/);
  assert.equal(JSON.parse(await request(["focus", "Browser", "10", identity])).count, 3);
  await assert.rejects(request(["exit", "Browser"]), /session ended/);
  await assert.rejects(request(["focus", "Browser", "10", identity]), /expired/);
  assert.equal(children.length, 2);
  assert.equal(JSON.parse(await request(["list", "Browser"])).count, 1);
  assert.equal(children.length, 3);
});

test("a slow browser neither delays another browser nor expires its retained tab session", async (t) => {
  const children: MockValue[] = [];
  t.after(() => children.forEach((child) => child.kill()));
  const { runBrowserHelper } = createLoader({
    "./applescript": { OSA_TIMEOUT_MS: 50 },
    "swift:../../swift/app-hopper-native": { helperExecutablePath: async () => "/fixture/browser-helper" },
    "node:child_process": {
      spawn: () => {
        const child: MockValue = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = new Writable({
          write(chunk, _encoding, callback) {
            const args = JSON.parse(chunk.toString());
            if (args[1] !== "Slow") queueMicrotask(() => child.stdout.write(JSON.stringify({ args }) + "\n"));
            callback();
          },
        });
        child.kill = () => child.emit("exit");
        children.push(child);
        return child;
      },
    },
  })("src/helpers/browser-helper.ts");
  const slow = runBrowserHelper("engine", ["list", "Slow"]).catch((error: Error) => error.message);
  const fast = await runBrowserHelper("engine", ["list", "Fast"]);
  assert.equal(JSON.parse(fast).args[1], "Fast");
  assert.match(await slow, /timed out/);
  await runBrowserHelper("engine", ["focus", "Fast", "10", "10:ax:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]);
  assert.equal(children.length, 2, "the fast browser keeps its own helper after the slow browser times out");
});

test("focus keeps its native session and runs before scans that have not started", async (t) => {
  const children: MockValue[] = [];
  const commands: string[][] = [];
  let respond!: () => void;
  t.after(() => children.forEach((child) => child.kill()));
  const { runBrowserHelper } = createLoader({
    "./applescript": { OSA_TIMEOUT_MS: 1000 },
    "swift:../../swift/app-hopper-native": { helperExecutablePath: async () => "/fixture/browser-helper" },
    "node:child_process": {
      spawn: () => {
        const child: MockValue = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = new Writable({
          write(chunk, _encoding, callback) {
            const args = JSON.parse(chunk.toString());
            commands.push(args);
            const reply = () => child.stdout.write(JSON.stringify({ args }) + "\n");
            if (args[2] === "first") respond = reply;
            else queueMicrotask(reply);
            callback();
          },
        });
        child.kill = () => child.emit("exit");
        children.push(child);
        return child;
      },
    },
  })("src/helpers/browser-helper.ts");
  const request = (args: string[]) => runBrowserHelper("engine", args);
  const first = request(["list", "Browser", "first"]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const second = request(["list", "Browser", "second"]);
  const third = request(["list", "Browser", "third"]);
  const target = "10:ax:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const focus = request(["focus", "Browser", "10", target]);
  const nextFocus = request(["focus", "Browser", "11", "11:0", "Known title"]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(commands.length, 1, "Do not overlap requests while the active scan owns stdout");
  respond();
  await Promise.all([first, second, third, focus, nextFocus]);
  assert.deepEqual(
    commands.map((args) => [args[0], args[2]]),
    [
      ["list", "first"],
      ["focus", "10"],
      ["focus", "11"],
      ["list", "second"],
      ["list", "third"],
    ],
  );
  assert.equal(children.length, 1, "Keep retained tab identities in the original helper process");

  const active = request(["list", "Browser", "first"]);
  const queued = request(["list", "Browser", "queued"]);
  const queuedFocus = request(["focus", "Browser", "10", target]);
  const ending = Promise.allSettled([active, queued, queuedFocus]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  children[0].emit("exit");
  const results = await ending;
  assert(results.every((result) => result.status === "rejected" && /session ended/.test(result.reason.message)));
  assert.equal(children.length, 1, "An ended session rejects queued focus instead of sending it to another process");
});

test("cancelled scans leave the queue while an active response is drained without expiring retained tabs", async (t) => {
  const commands: string[][] = [];
  let child: MockValue;
  let killed = false;
  let respond!: () => void;
  t.after(() => child?.kill());
  const { runBrowserHelper } = createLoader({
    "./applescript": { OSA_TIMEOUT_MS: 1000 },
    "swift:../../swift/app-hopper-native": { helperExecutablePath: async () => "/fixture/browser-helper" },
    "node:child_process": {
      spawn: () => {
        assert.equal(child, undefined, "Cancellation must not restart the retained-tab session");
        child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = new Writable({
          write(chunk, _encoding, callback) {
            const args = JSON.parse(chunk.toString());
            commands.push(args);
            const reply = () => child.stdout.write(JSON.stringify({ args }) + "\n");
            if (args[2] === "active") respond = reply;
            else queueMicrotask(reply);
            callback();
          },
        });
        child.kill = () => {
          killed = true;
          child.emit("exit");
        };
        return child;
      },
    },
  })("src/helpers/browser-helper.ts");
  const request = (args: string[], signal?: AbortSignal) => runBrowserHelper("engine", args, signal);
  await request(["list", "Browser", "warmup"]);
  const activeAbort = new AbortController();
  const queuedAbort = new AbortController();
  const active = request(["list", "Browser", "active"], activeAbort.signal);
  const queued = request(["list", "Browser", "obsolete"], queuedAbort.signal);
  const activeCancelled = assert.rejects(active, { name: "AbortError" });
  const queuedCancelled = assert.rejects(queued, { name: "AbortError" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  queuedAbort.abort();
  activeAbort.abort();
  await Promise.all([activeCancelled, queuedCancelled]);
  assert.equal(killed, false, "Do not destroy retained tab identities when a scan's caller leaves");
  const focus = request(["focus", "Browser", "10", "10:ax:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]);
  respond();
  await focus;
  await request(["list", "Browser", "fresh"]);
  assert.deepEqual(
    commands.map((args) => args[2]),
    ["warmup", "active", "10", "fresh"],
  );
});
