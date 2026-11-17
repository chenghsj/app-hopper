import test from "node:test";
import { readAsset, runSwiftHarness } from "./swift-harness.ts";

test("native browser process identity rejects other apps, terminated owners and reused PIDs", () => {
  const source = readAsset("browser-process.swift").replaceAll("AppKit.NSRunningApplication(", "FixtureApplication(");
  runSwiftHarness(
    [
      source,
      `var bundle = "app.zen-browser.zen"
    var terminated = false
    var launch: Date? = Date(timeIntervalSince1970: 1000)
    struct FixtureApplication {
      init?(processIdentifier: Int32) {}
      var bundleIdentifier: String? { bundle }
      var isTerminated: Bool { terminated }
      var launchDate: Date? { launch }
    }
    let original = browserProcessIdentity(123)
    precondition(original == BrowserProcessIdentity(pid: 123, launchedAt: 1000))
    precondition(browserProcessIdentity(0) == nil)
    bundle = "org.other.browser"
    precondition(browserProcessIdentity(123) == nil)
    bundle = "org.mozilla.firefox"
    terminated = true
    precondition(browserProcessIdentity(123) == nil)
    terminated = false
    launch = nil
    precondition(browserProcessIdentity(123) == nil)
    launch = Date(timeIntervalSince1970: 2000)
    precondition(browserProcessIdentity(123) != original, "PID reuse must not preserve an old owner identity")`,
    ].join("\n"),
  );
});
