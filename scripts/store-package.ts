import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const sourceURL = "https://github.com/chenghsj/app-hopper/blob/main/";
const packageFiles = new Set([
  ".gitignore",
  ".prettierrc",
  "README.md",
  "CHANGELOG.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.ts",
  "docs/native-helpers.md",
  "scripts/build-native.ts",
  "scripts/native-helpers.ts",
  "scripts/verify-native.ts",
]);

function storeFile(file: string): boolean {
  const parts = file.split("/");
  if (parts.some((part) => part.toUpperCase() === "AGENTS.MD")) return false;
  return packageFiles.has(file) || ["src", "assets", "metadata"].includes(parts[0]);
}

/** Retain local links to submitted files; link omitted guides to their canonical source. */
function storeMarkdown(content: string, file: string, files: Set<string>): string {
  return content.replace(/(\[[^\]\n]*\]\()([^\s)]+)(\))/g, (match, before, target: string, after) => {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(target)) return match;
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), target.split("#")[0]));
    return files.has(relative) ? match : `${before}${new URL(target, new URL(file, sourceURL)).href}${after}`;
  });
}

function prepareManifest(destination: string) {
  const file = path.join(destination, "package.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  const scripts: Record<string, string> = {};
  for (const name of [
    "build:native",
    "verify:native",
    "prebuild",
    "build",
    "predev",
    "dev",
    "lint",
    "fix-lint",
    "prepublishOnly",
  ]) {
    if (manifest.scripts?.[name]) scripts[name] = manifest.scripts[name];
  }
  scripts.typecheck = "tsc --noEmit";
  scripts.publish = "npx @raycast/api@latest publish";
  manifest.scripts = scripts;
  const companionDependencies = ["web-ext", "@types/firefox-webext-browser"];
  const pruneLock = companionDependencies.some((name) => name in (manifest.devDependencies ?? {}));
  for (const name of companionDependencies) delete manifest.devDependencies?.[name];
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  if (pruneLock) {
    const cache = mkdtempSync(path.join(os.tmpdir(), "app-hopper-store-npm-"));
    try {
      // Reuse locked versions without downloads, lifecycle scripts, or source-repository changes.
      execFileSync(
        "npm",
        [
          "install",
          "--package-lock-only",
          "--ignore-scripts",
          "--offline",
          "--no-audit",
          "--no-fund",
          "--cache",
          cache,
        ],
        {
          cwd: destination,
          stdio: "pipe",
          timeout: 60000,
        },
      );
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  }
}

/** Export the runtime, its build tools and native provenance, leaving development/release tooling in source. */
export function prepareStore(root: string): string {
  const destination = path.join(root, "dist", "store");
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--deduplicate"], { cwd: root })
    .toString()
    .split("\0")
    .filter((file) => file && storeFile(file) && existsSync(path.join(root, file)));
  const included = new Set(files);
  for (const file of packageFiles) {
    if (!included.has(file)) throw new Error(`Missing tracked Store file: ${file}. Add it to Git before preparing.`);
  }
  rmSync(destination, { recursive: true, force: true });
  for (const file of files) {
    const source = path.join(root, file);
    if (!lstatSync(source).isFile()) throw new Error(`Store source must be a regular file: ${file}`);
    const target = path.join(destination, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    if (file.endsWith(".md")) {
      writeFileSync(target, storeMarkdown(readFileSync(source, "utf8"), file, included));
    }
  }
  prepareManifest(destination);
  return destination;
}
