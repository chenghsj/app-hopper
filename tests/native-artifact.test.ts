import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import createLoader from "./load-ts.ts";

test("native package failures preserve plain stderr without appending RPC output", () => {
  const binary = path.resolve("assets/compiled_raycast_swift/app-hopper-native");
  const result = childProcess.spawnSync(binary, ["runHelper", JSON.stringify("unknown-helper"), "[]"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Unknown native helper\n");
});

test("Store-built native package starts with an empty support directory and compiler commands disabled", async (t) => {
  const binary = path.resolve("assets/compiled_raycast_swift/app-hopper-native");
  const supportPath = await fs.mkdtemp(path.join(os.tmpdir(), "app-hopper-clean-support-"));
  t.after(() => fs.rm(supportPath, { recursive: true, force: true }));
  const calls: string[] = [];
  const load = createLoader({
    "swift:../../swift/app-hopper-native": {
      helperExecutablePath: async () =>
        JSON.parse(childProcess.execFileSync(binary, ["helperExecutablePath"], { encoding: "utf8" })),
    },
    "@raycast/utils": {},
    "node:child_process": {
      execFile: (file, args, options, callback) => {
        calls.push(file);
        assert(!["/usr/bin/swiftc", "/usr/bin/xcrun", "/usr/bin/xcode-select"].includes(file));
        childProcess.execFile(file, args, options, callback);
      },
    },
  });
  const result = await load("src/runtime-environment.ts").checkRuntimeEnvironment();
  assert(["ready", "accessibility"].includes(result.kind), `Unexpected startup result: ${result.kind}`);
  assert.deepEqual(calls, ["/usr/bin/sw_vers", binary]);
  assert.deepEqual(await fs.readdir(supportPath), []);
});
