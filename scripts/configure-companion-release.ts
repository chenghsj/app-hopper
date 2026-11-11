import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

// Pin the release artifact. Firefox remains the cryptographic signature verifier.
function main() {
  const { values } = parseArgs({
    options: { xpi: { type: "string" }, url: { type: "string" }, browser: { type: "string", default: "firefox" } },
  });
  if (values.browser !== "firefox" && values.browser !== "zen") throw new Error("Unknown companion browser");
  if (!values.xpi || !values.url)
    throw new Error("Usage: npm run configure:firefox-release -- --xpi <signed.xpi> --url <https://.../signed.xpi>");
  const url = new URL(values.url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !url.pathname.endsWith(".xpi")) {
    throw new Error("Provide a direct HTTPS XPI download URL without credentials or fragments");
  }
  const file = path.resolve(values.xpi);
  const bytes = readFileSync(file);
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Companion XPI exceeds the download size limit");
  const manifest = JSON.parse(
    execFileSync("/usr/bin/unzip", ["-p", file, "manifest.json"], { encoding: "utf8", maxBuffer: 1024 * 1024 }),
  );
  const root = path.resolve(__dirname, "..");
  const expected = JSON.parse(readFileSync(path.join(root, "companion/manifest.json"), "utf8"));
  if (
    manifest.browser_specific_settings?.gecko?.id !== expected.browser_specific_settings.gecko.id ||
    manifest.version !== expected.version
  ) {
    throw new Error("The XPI identity and version must match companion/manifest.json");
  }
  const names = execFileSync("/usr/bin/unzip", ["-Z1", file], { encoding: "utf8", maxBuffer: 1024 * 1024 }).split("\n");
  if (!names.some((name) => /^META-INF\/(mozilla\.rsa|cose\.sig)$/i.test(name))) {
    throw new Error("Mozilla signature files are missing. Obtain an unlisted signed XPI first.");
  }
  const companion = {
    version: manifest.version,
    xpiUrl: url.href,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const output = path.join(root, "assets/companion-integration.json");
  const temp = `${output}.tmp`;
  writeFileSync(temp, JSON.stringify({ companion }, null, 2) + "\n");
  renameSync(temp, output);
  console.log(`Configured Firefox companion ${companion.version} with SHA-256 ${companion.sha256}`);
  console.log(
    "Firefox must still verify Mozilla's cryptographic signature during installation. Rebuild App Hopper after configuring the release.",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
