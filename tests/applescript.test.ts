import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { once } from "node:events";
import createLoader from "./load-ts.ts";

test("official AppleScript runner retains JavaScript mode, timeout and caller output semantics", async () => {
  const calls: unknown[] = [];
  const { runAppleScript } = createLoader({
    "@raycast/utils": {
      runAppleScript: async (...args) => {
        calls.push(args);
        return "  value\u001fitem\u001e  \n";
      },
    },
    "node:child_process": { execFile: () => assert.fail("Use the shared Raycast AppleScript helper") },
  })("src/helpers/applescript.ts");
  const args = ['quoted " text', "line\nbreak", "雪\\path"];
  assert.equal(await runAppleScript("jxa", args, "JavaScript"), "  value\u001fitem\u001e");
  assert.equal(await runAppleScript("apple"), "  value\u001fitem\u001e");
  assert.deepEqual(calls, [
    ["jxa", args, { language: "JavaScript", timeout: 10000, humanReadableOutput: true }],
    ["apple", [], { language: "AppleScript", timeout: 10000, humanReadableOutput: true }],
  ]);
});

test("official AppleScript errors keep the Automation permission guidance", async () => {
  const { runAppleScript } = createLoader({
    "@raycast/utils": {
      runAppleScript: async () => {
        throw Object.assign(new Error("Command failed"), { stderr: "Not authorized (-1743)" });
      },
    },
    "node:child_process": { execFile: () => assert.fail("Use the shared Raycast AppleScript helper") },
  })("src/helpers/applescript.ts");
  await assert.rejects(runAppleScript("apple"), /Allow Raycast.*Automation/);
});

test("cancelling a binary query terminates its child process and preserves AbortError", async (t) => {
  let child!: ReturnType<typeof execFile>;
  const { execBinary } = createLoader({
    "node:child_process": {
      execFile: (...args: Parameters<typeof execFile>) => (child = execFile(...args)),
    },
  })("src/helpers/applescript.ts");
  t.after(() => child?.kill());
  const controller = new AbortController();
  const pending = execBinary(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { signal: controller.signal });
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  await once(child, "spawn");
  controller.abort();
  await cancelled;
  await exited;
  assert.equal(child.killed, true);
});

test("AppleScript cancellation reaches the official runner and retains the caller's abort reason", async () => {
  const controller = new AbortController();
  const { runAppleScript } = createLoader({
    "@raycast/utils": {
      runAppleScript: async (_script: string, _args: string[], options: { signal: AbortSignal }) => {
        assert.equal(options.signal, controller.signal);
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () => reject(new Error("Stopped")), { once: true }),
        );
      },
    },
  })("src/helpers/applescript.ts");
  const pending = runAppleScript("query", [], "AppleScript", controller.signal);
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  await cancelled;
});
