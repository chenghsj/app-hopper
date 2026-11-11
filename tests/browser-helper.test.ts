import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { spawn } from "node:child_process";
import createLoader from "./load-ts.ts";

test("browser helper preserves one native session, serializes requests, and rejects expired identities", async (t) => {
  const fixture = path.join(__dirname, "fixtures", "browser-helper.ts");
  const children: ReturnType<typeof spawn>[] = [];
  t.after(() => {
    children.forEach((child) => child.kill());
  });
  const load = createLoader({
    "./applescript": { ensureSwiftHelper: async () => "/fixture/browser-helper", OSA_TIMEOUT_MS: 1000 },
    "node:child_process": {
      spawn: () => {
        const child = spawn(process.execPath, ["--import", "tsx", fixture]);
        children.push(child);
        return child;
      },
    },
  });
  const { runBrowserHelper } = load("src/helpers/browser-helper.ts");
  const request = (args: string[]) => runBrowserHelper("test.swift", "test", "/fixture", args);
  const identity = "10:ax:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  await assert.rejects(request(["focus", "Browser", "10", identity]), /expired/);
  assert.equal(children.length, 0);
  const [first, second] = await Promise.all([request(["list", "one"]), request(["list", "two"])]);
  assert.equal(JSON.parse(first).count, 1);
  assert.equal(JSON.parse(second).count, 2);
  assert.equal(children.length, 1);
  await assert.rejects(request(["fail"]), /Tab changed/);
  assert.equal(JSON.parse(await request(["focus", "Browser", "10", identity])).count, 3);
  await assert.rejects(request(["exit"]), /session ended/);
  await assert.rejects(request(["focus", "Browser", "10", identity]), /expired/);
  assert.equal(children.length, 1);
  assert.equal(JSON.parse(await request(["list"])).count, 1);
  assert.equal(children.length, 2);
});
