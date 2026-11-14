import assert from "node:assert/strict";
import test from "node:test";
import createLoader from "./load-ts.ts";

test("native package discovery shares in-flight calls and retries a failed runtime lookup", async () => {
  let calls = 0;
  let fail = true;
  const { getNativeExecutable } = createLoader({
    "swift:../../swift/app-hopper-native": {
      helperExecutablePath: async () => {
        calls++;
        if (fail) throw new Error("Package unavailable");
        return "/assets/compiled_raycast_swift/app-hopper-native";
      },
    },
  })("src/helpers/swift-package.ts");
  await assert.rejects(getNativeExecutable(), /Package unavailable/);
  fail = false;
  const [one, two] = await Promise.all([getNativeExecutable(), getNativeExecutable()]);
  assert.equal(one, two);
  assert.equal(calls, 2);
  assert.equal(await getNativeExecutable(), one);
  assert.equal(calls, 2);
});

test("native commands use the Store-built package with encoded arguments and preserve errors", async () => {
  const calls: unknown[] = [];
  const helpers = createLoader({
    "swift:../../swift/app-hopper-native": { helperExecutablePath: async () => "/built/helper with spaces" },
    "node:child_process": {
      execFile: (binary, args, options, callback) => {
        calls.push([binary, args, options.timeout]);
        if (JSON.parse(args[2])[0] === "fail") callback(new Error("Window closed"), "", "Window closed");
        else callback(null, "ok\n", "");
      },
    },
  })("src/helpers/native-helper.ts");
  const args = ["focus", "quoted ' value", "\n"];
  assert.equal(await helpers.runNativeHelper("macos-windows", args), "ok");
  assert.deepEqual(calls[0], [
    "/built/helper with spaces",
    ["runHelper", '"macos-windows"', JSON.stringify(args)],
    10000,
  ]);
  await assert.rejects(helpers.runNativeHelper("macos-windows", ["fail"]), /Window closed/);
});
