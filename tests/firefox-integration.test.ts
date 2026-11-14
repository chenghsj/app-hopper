import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import createLoader from "./load-ts.ts";

test("Firefox setup installs text launchers atomically and repairs changed or missing files", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ah-setup-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const load = createLoader({
    "node:os": { homedir: () => home },
    "swift:../../swift/app-hopper-native": {
      helperExecutablePath: async () => "/built/native package's executable",
    },
  });
  const integration = load("src/browsers/firefox-integration.ts");
  assert.equal(await integration.isFirefoxHostInstalled(), false);
  assert.equal(await integration.hasFirefoxHostRegistration(), false);
  await Promise.all([integration.installFirefoxHost(), integration.installFirefoxHost()]);
  assert.equal(await integration.isFirefoxHostInstalled(), true);
  assert.equal(await integration.hasFirefoxHostRegistration(), true);
  const manifestPath = path.join(
    home,
    "Library/Application Support/Mozilla/NativeMessagingHosts/app_hopper.firefox.json",
  );
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.type, "stdio");
  assert.deepEqual(manifest.allowed_extensions, ["app-hopper-firefox@chenghsj"]);
  assert.equal(path.isAbsolute(manifest.path), true);
  const launcher = await fs.readFile(manifest.path, "utf8");
  assert.match(launcher, /^#!\/bin\/sh\nexec /);
  assert(launcher.includes("'\\''"), "Apostrophes in the compiled path must be shell-escaped");
  assert(launcher.includes("runHelper"));
  await fs.writeFile(manifest.path, "damaged launcher");
  assert.equal(await integration.isFirefoxHostInstalled(), false);
  await integration.installFirefoxHost();
  assert.equal(await fs.readFile(manifest.path, "utf8"), launcher);
  assert.equal((await fs.stat(manifestPath)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(manifest.path)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(integration.FIREFOX_DIRECTORY)).mode & 0o777, 0o700);
  await fs.writeFile(manifestPath, "broken manifest");
  assert.equal(await integration.isFirefoxHostInstalled(), false);
  assert.equal(
    await integration.hasFirefoxHostRegistration(),
    true,
    "damaged registrations still need a repair entry point",
  );
  await integration.installFirefoxHost();
  assert.equal(await integration.isFirefoxHostInstalled(), true);
  await fs.rm(manifest.path);
  assert.equal(await integration.isFirefoxHostInstalled(), false);
  await integration.installFirefoxHost();
  assert.equal(await integration.isFirefoxHostInstalled(), true);
});

test("failed launcher writes leave no manifest or partial launcher and can be retried", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ah-setup-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  let fail = true;
  const load = createLoader({
    "node:fs/promises": {
      ...fs,
      writeFile: async (file, data, options) => {
        await fs.writeFile(file, data, options);
        if (fail && String(file).endsWith(".tmp")) throw new Error("Write failed");
      },
    },
    "node:os": { homedir: () => home },
    "swift:../../swift/app-hopper-native": {
      helperExecutablePath: async () => "/built/native package's executable",
    },
  });
  const integration = load("src/browsers/firefox-integration.ts");
  await assert.rejects(integration.installFirefoxHost(), /Write failed/);
  assert.deepEqual(await fs.readdir(integration.FIREFOX_DIRECTORY), []);
  assert.equal(await integration.isFirefoxHostInstalled(), false);
  fail = false;
  await integration.installFirefoxHost();
  assert.equal(await integration.isFirefoxHostInstalled(), true);
});

test("removing Firefox integration stops helpers after unregistering and preserves AX and unrelated files", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ah-remove-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const load = createLoader({
    "node:os": { homedir: () => home },
    "swift:../../swift/app-hopper-native": {
      helperExecutablePath: async () => "/built/native package's executable",
    },
  });
  const integration = load("src/browsers/firefox-integration.ts");
  await integration.installFirefoxHost();
  const directory = integration.FIREFOX_DIRECTORY;
  const manifest = path.join(home, "Library/Application Support/Mozilla/NativeMessagingHosts/app_hopper.firefox.json");
  await fs.writeFile(path.join(directory, "firefox-ax-v1"), "preserve AX helper");
  await fs.writeFile(path.join(directory, "notes.txt"), "preserve unrelated file");
  await fs.mkdir(path.join(directory, "companion"));
  await fs.writeFile(path.join(directory, "companion/cached.xpi"), "download");
  await fs.mkdir(path.join(directory, "module-cache"));
  let stops = 0;
  await integration.removeFirefoxHost(async () => {
    stops++;
    await assert.rejects(fs.stat(manifest), { code: "ENOENT" });
    assert(
      (await fs.readdir(directory)).some((file) => file.startsWith("firefox-bridge-")),
      "do not remove running helpers before shutdown",
    );
  });
  assert.equal(stops, 1);
  assert.deepEqual((await fs.readdir(directory)).sort(), ["firefox-ax-v1", "notes.txt"]);
  assert.equal(await integration.isFirefoxHostInstalled(), false);
  await integration.removeFirefoxHost(async () => {});
  await fs.writeFile(manifest, JSON.stringify({ name: "unrelated-host", path: "/somewhere/else" }));
  await assert.rejects(
    integration.removeFirefoxHost(async () => {
      throw new Error("Must not stop foreign helpers");
    }),
    /not owned/,
  );
  assert.equal(JSON.parse(await fs.readFile(manifest, "utf8")).name, "unrelated-host");
});

test("Zen setup and removal keep Firefox manifests and helper files intact", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ah-zen-setup-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const integration = createLoader({
    "node:os": { homedir: () => home },
    "swift:../../swift/app-hopper-native": {
      helperExecutablePath: async () => "/built/native package's executable",
    },
  })("src/browsers/firefox-integration.ts");
  await Promise.all([integration.installFirefoxHost(), integration.installFirefoxHost("zen")]);
  const base = path.join(home, "Library/Application Support/Mozilla/NativeMessagingHosts");
  const firefox = JSON.parse(await fs.readFile(path.join(base, "app_hopper.firefox.json"), "utf8"));
  const zen = JSON.parse(await fs.readFile(path.join(base, "app_hopper.zen.json"), "utf8"));
  assert.deepEqual(zen.allowed_extensions, ["app-hopper-firefox@chenghsj"]);
  assert.deepEqual(firefox.allowed_extensions, ["app-hopper-firefox@chenghsj"]);
  assert.match(zen.path, /raycast-app-hopper-zen\/zen-bridge-[a-f0-9]{12}$/);
  assert.notEqual(path.dirname(zen.path), path.dirname(firefox.path));
  // The old Zen-only registration remains removable during migration.
  await fs.writeFile(
    path.join(base, "app_hopper.zen.json"),
    JSON.stringify({ ...zen, allowed_extensions: ["app-hopper-zen@chenghsj"] }),
  );
  await integration.removeFirefoxHost(async () => {}, "zen");
  assert.equal(await integration.isFirefoxHostInstalled("zen"), false);
  assert.equal(await integration.isFirefoxHostInstalled(), true);
});
