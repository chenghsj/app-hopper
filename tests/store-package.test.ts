import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareStore } from "../scripts/store-package.ts";

test("Store export preserves current source and executable helpers while excluding agent and local files", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "app-hopper-store-export-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(file: string, content: string, mode = 0o644) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content, { mode });
  }
  write(".gitignore", "dist/\nnode_modules/\n");
  write(".prettierrc", "{}");
  write("tsconfig.json", "{}");
  write("eslint.config.ts", "export default [];");
  write("scripts/build-native.ts", "// Native build");
  write("scripts/native-helpers.ts", "// Native source/hash verification");
  write("scripts/verify-native.ts", "// Verify prepared native helpers");
  write("docs/native-helpers.md", "[Setup](firefox-integration.md#user-setup) [Usage](../README.md)");
  const manifest = {
    name: "store-fixture",
    version: "1.0.0",
    license: "MIT",
    devDependencies: { "web-ext": "1.0.0", "@types/firefox-webext-browser": "1.0.0" },
    scripts: {
      "build:native": "node --import tsx scripts/build-native.ts",
      "verify:native": "node --import tsx scripts/verify-native.ts",
      prebuild: "npm run build:native",
      build: "ray build",
      typecheck: "tsc --noEmit && tsc --noEmit -p tsconfig.companion.json",
      test: "node --import tsx --test tests/*.test.ts",
      "package:companion": "node --import tsx scripts/package-companion.ts",
      "prepare:store": "node --import tsx scripts/prepare-store.ts",
      publish: "npm run prepare:store && cd dist/store && npx @raycast/api@latest publish",
    },
  };
  const lock = {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: manifest.name, version: manifest.version, devDependencies: manifest.devDependencies },
      "node_modules/web-ext": { version: "1.0.0", dev: true },
      "node_modules/@types/firefox-webext-browser": { version: "1.0.0", dev: true },
    },
  };
  const sourceManifest = JSON.stringify(manifest);
  const sourceLock = JSON.stringify(lock);
  write("package.json", sourceManifest);
  write("package-lock.json", sourceLock);
  write("CHANGELOG.md", "# Changes");
  write("AGENTS.md", "Keep in source only");
  write(".github/workflows/ci.yml", "Source CI");
  write("src/AGENTS.md", "Nested source guidance");
  write("src/app-hopper.tsx", "Original source");
  write("README.md", "[User setup](docs/firefox-integration.md#user-setup) [MIT](LICENSE)");
  write("LICENSE", "MIT License");
  write("docs/firefox-integration.md", "User guide with developer instructions");
  write("docs/development.md", "Source checkout instructions");
  write("docs/release-automation.md", "Signing/release instructions");
  write("companion/background.ts", "Companion source");
  write("scripts/package-companion.ts", "Signing archive generation");
  write("tests/native-artifact.test.ts", "Source regression");
  write("assets/native/helper", "Universal binary", 0o755);
  write("assets/removed.swift", "Deleted source");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["add", "."], { cwd: root });
  write("src/app-hopper.tsx", "Current source");
  rmSync(path.join(root, "assets/removed.swift"));
  write("local-notes.md", "Untracked draft");
  write("node_modules/local", "Dependency");
  write("dist/store/stale.txt", "Old export");
  const destination = prepareStore(root);
  assert.equal(readFileSync(path.join(destination, "src/app-hopper.tsx"), "utf8"), "Current source");
  assert.equal(
    readFileSync(path.join(destination, "README.md"), "utf8"),
    "[User setup](https://github.com/chenghsj/app-hopper/blob/main/docs/firefox-integration.md#user-setup) [MIT](https://github.com/chenghsj/app-hopper/blob/main/LICENSE)",
  );
  assert.equal(
    readFileSync(path.join(destination, "docs/native-helpers.md"), "utf8"),
    "[Setup](https://github.com/chenghsj/app-hopper/blob/main/docs/firefox-integration.md#user-setup) [Usage](../README.md)",
  );
  assert.equal(statSync(path.join(destination, "assets/native/helper")).mode & 0o777, 0o755);
  for (const file of [
    "AGENTS.md",
    "src/AGENTS.md",
    ".github",
    ".git",
    "node_modules",
    "dist",
    "stale.txt",
    "local-notes.md",
    "assets/removed.swift",
    "LICENSE",
    "docs/firefox-integration.md",
    "docs/development.md",
    "docs/release-automation.md",
    "companion",
    "tests",
    "scripts/package-companion.ts",
  ]) {
    assert.equal(existsSync(path.join(destination, file)), false, `Unexpected Store file: ${file}`);
  }
  const exported = JSON.parse(readFileSync(path.join(destination, "package.json"), "utf8"));
  assert.equal(exported.scripts.build, "ray build");
  assert.equal(exported.scripts.prebuild, "npm run build:native");
  assert.equal(exported.scripts.typecheck, "tsc --noEmit");
  assert.equal(exported.scripts.publish, "npx @raycast/api@latest publish");
  assert.equal(exported.scripts.test, undefined);
  assert.equal(exported.scripts["package:companion"], undefined);
  assert.equal(exported.scripts["prepare:store"], undefined);
  assert.deepEqual(exported.devDependencies, {});
  for (const script of Object.values(exported.scripts) as string[]) {
    for (const [file] of script.matchAll(/scripts\/[\w-]+\.ts/g)) {
      assert(existsSync(path.join(destination, file)), `Missing build dependency: ${file}`);
    }
  }
  const exportedLock = JSON.parse(readFileSync(path.join(destination, "package-lock.json"), "utf8"));
  assert.equal(exportedLock.packages["node_modules/web-ext"], undefined);
  assert.equal(exportedLock.packages["node_modules/@types/firefox-webext-browser"], undefined);
  assert.equal(readFileSync(path.join(root, "package.json"), "utf8"), sourceManifest);
  assert.equal(readFileSync(path.join(root, "package-lock.json"), "utf8"), sourceLock);
  assert.equal(readFileSync(path.join(root, "AGENTS.md"), "utf8"), "Keep in source only");
  execFileSync("git", ["rm", "--cached", "scripts/build-native.ts"], { cwd: root });
  assert.throws(() => prepareStore(root), /Missing tracked Store file: scripts\/build-native.ts/);
  assert(existsSync(path.join(destination, "src/app-hopper.tsx")), "Failed exports must preserve the last candidate");
});
