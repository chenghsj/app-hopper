import { appendFileSync, copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { companionReleasePlan, assertCompanionPackageContents } from "./companion-release-plan";

async function main() {
  const manifest = JSON.parse(readFileSync("companion/manifest.json", "utf8"));
  if (manifest.browser_specific_settings?.gecko?.id !== "app-hopper-firefox@chenghsj") {
    throw new Error("Unexpected shared companion identity");
  }
  const config = JSON.parse(readFileSync("assets/companion-integration.json", "utf8"));
  const dryRun = process.env.DRY_RUN === "true";
  const plan = companionReleasePlan(
    manifest.version,
    config.companion?.version,
    dryRun || process.argv[2] === "verify-download",
  );
  if (process.argv[2] === "verify-download") {
    const response = await fetch(plan.url);
    if (!response.ok) throw new Error(`Public download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== config.companion.sha256) throw new Error("Published XPI checksum differs from configured release");
    console.log("Anonymous public download matches the signed release checksum.");
    return;
  }
  if (process.argv[2] === "plan") {
    if (!dryRun) {
      const response = await fetch(`https://api.github.com/repos/chenghsj/app-hopper/releases/tags/${plan.tag}`);
      if (response.status !== 404) {
        throw new Error(
          response.ok
            ? "Release already exists; refusing to replace its assets"
            : `Release lookup failed: HTTP ${response.status}`,
        );
      }
    }
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(plan)
          .map(([key, value]) => `${key}=${value}\n`)
          .join(""),
      );
    }
    console.log(`${dryRun ? "Build-only validation" : "Release candidate"}: ${plan.tag}`);
    return;
  }
  if (process.argv[2] !== "prepare" || dryRun)
    throw new Error("Expected plan or prepare; prepare requires a signing run");
  const signedDirectory = "dist/companion/signed";
  const files = readdirSync(signedDirectory).filter((file) => file.endsWith(".xpi"));
  if (files.length !== 1) throw new Error("Expected exactly one Mozilla-signed XPI");
  const signed = path.join(signedDirectory, files[0]);
  const unzip = (file: string) => execFileSync("/usr/bin/unzip", ["-p", signed, file], { maxBuffer: 10 * 1024 * 1024 });
  const names = execFileSync("/usr/bin/unzip", ["-Z1", signed], { encoding: "utf8" }).trim().split("\n");
  assertCompanionPackageContents(
    JSON.parse(unzip("manifest.json").toString("utf8")),
    manifest,
    unzip("background.js"),
    readFileSync("dist/companion/extension/background.js"),
    names,
  );
  mkdirSync("dist/companion/release", { recursive: true });
  copyFileSync(signed, plan.signed);
  const sourceName = path.basename(plan.source);
  const sourceTarget = path.join("dist/companion/release", sourceName);
  copyFileSync(plan.source, sourceTarget);
  const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(
    "dist/companion/release/SHA256SUMS",
    [plan.signed, sourceTarget].map((file) => `${digest(file)}  ${path.basename(file)}\n`).join(""),
  );
  writeFileSync(
    "dist/companion/release/release-notes.md",
    `# App Hopper Companion ${plan.version}\n\nMozilla-signed companion shared by Firefox and Zen.\n\nInstall App Hopper, run the matching browser integration setup, and confirm installation of the signed XPI. Zen cross-workspace support additionally requires the separate local workspace bridge.\n\nSource, pinned build dependencies and rebuild instructions are included in the source ZIP. SHA256SUMS covers both downloadable packages.\n`,
  );
  writeFileSync(
    "assets/companion-integration.json",
    JSON.stringify({ companion: { version: plan.version, xpiUrl: plan.url, sha256: digest(plan.signed) } }, null, 2) +
      "\n",
  );
  console.log(`Prepared ${plan.tag}; XPI identity, contents and signature metadata match the release build.`);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
