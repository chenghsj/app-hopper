import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createHash } from "node:crypto";
import createLoader from "./load-ts.ts";

function helpers(contents: Record<string, string>, calls: { binary: string; args: string[] }[] = []) {
  const load = createLoader({
    "@raycast/api": { environment: { assetsPath: "/assets", supportPath: "/support" } },
    "node:fs": {
      readFileSync: (file) => contents[path.basename(file)],
      existsSync: () => false,
    },
    "node:fs/promises": { mkdir: async () => {}, rename: async () => {}, rm: async () => {} },
    "node:child_process": {
      execFile: (binary, args, _options, callback) => {
        calls.push({ binary, args });
        callback(null, "", "");
      },
    },
  });
  return load("src/helpers/applescript.ts");
}

test("shared Swift source changes invalidate the binary cache without changing single-file helper keys", async () => {
  const contents: Record<string, string> = {
    "entry.swift": "entry",
    "references.swift": "references",
    "runtime.swift": "runtime",
  };
  const first = helpers(contents);
  const originalSingleHash = createHash("sha256").update(contents["entry.swift"]).digest("hex").slice(0, 12);
  assert.equal(
    first.resolveHelperPaths("entry.swift", "single", "/fallback").binaryPath,
    `/support/single-${originalSingleHash}`,
  );

  const dependencies = ["references.swift", "runtime.swift"];
  const before = first.resolveHelperPaths("entry.swift", "browser", "/fallback", dependencies);
  for (const dependency of dependencies) {
    // A fresh loader represents the next Raycast host process after a source update.
    const changed = helpers({ ...contents, [dependency]: contents[dependency] + " changed" });
    const after = changed.resolveHelperPaths("entry.swift", "browser", "/fallback", dependencies);
    assert.notEqual(before.binaryPath, after.binaryPath, `${dependency} must be part of the cache key`);
  }

  const calls: { binary: string; args: string[] }[] = [];
  const compiler = helpers(contents, calls);
  const [one, two] = await Promise.all([
    compiler.ensureSwiftHelper("entry.swift", "browser", "/fallback", dependencies),
    compiler.ensureSwiftHelper("entry.swift", "browser", "/fallback", dependencies),
  ]);
  assert.equal(one, two);
  assert.equal(calls.length, 1, "Concurrent callers must share one compilation");
  assert.equal(calls[0].binary, "/usr/bin/swiftc");
  assert.deepEqual(calls[0].args.slice(0, -2), [
    "-O",
    "/assets/entry.swift",
    "/assets/references.swift",
    "/assets/runtime.swift",
  ]);
});
