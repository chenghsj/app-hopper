import assert from "node:assert/strict";
import test from "node:test";
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
