import type { Window as NativeWindow } from "../src/windows";
import assert from "node:assert/strict";
import test from "node:test";
import { fixturePath, readAsset, readFixture, swiftFunction, runSwiftHarness } from "./swift-harness.ts";

function discoveryHarness(main: string) {
  const source = readAsset("macos-windows.swift");
  return runSwiftHarness(
    [
      readFixture("native-window-discovery.swift"),
      swiftFunction(source, "windowId"),
      swiftFunction(source, "discoverAXWindowElements").replaceAll(
        "ProcessInfo.processInfo.systemUptime",
        "fixtureTime",
      ),
      main,
    ].join("\n"),
  );
}

for (const route of ["windows", "main", "focused", "remote"]) {
  test(`native discovery bounds the first window query from ${route} Accessibility references`, () => {
    discoveryHarness(`
      route = "${route}"
      let found = discoverAXWindowElements(pid: 20, expectedWindowIds: [10])
      precondition(found[10] != nil, "Keep the discovered window")
      precondition(queriedElements == [1], "Resolve the expected window without unnecessary scanning")
    `);
  });
}

test("native discovery stops slow token scanning and keeps windows already found", () => {
  discoveryHarness(`
    route = "slow"
    requireElementTimeout = false
    let found = discoverAXWindowElements(pid: 20, expectedWindowIds: [10, 11])
    precondition(found[10] != nil, "Retain the responsive window when another reference is unavailable")
    precondition(found[11] == nil)
    precondition(fixtureTime < 2, "Slow token queries must not exhaust the ten-second command timeout")
    precondition(queriedElements.count < 20, "Stop probing after the discovery budget expires")
  `);
});

test("native focus checks only the target window and rejects a closed or reused process identity", () => {
  const resolveOwner = swiftFunction(readAsset("macos-windows.swift"), "resolveOwnerPid").replaceAll(
    "CGWindowListCopyWindowInfo(",
    "fixtureWindowInfo(",
  );
  runSwiftHarness(
    [
      "import Foundation\nimport CoreGraphics",
      `var entries: [[String: Any]] = [[kCGWindowNumber as String: 10, kCGWindowOwnerPID as String: 20]]
      var lookups = 0
      func fixtureWindowInfo(_ options: CGWindowListOption, _ relative: CGWindowID) -> Any? {
        precondition(options == .optionIncludingWindow, "Focus must only inspect the selected window")
        precondition(relative == 10)
        lookups += 1
        return entries
      }`,
      resolveOwner,
      `precondition(resolveOwnerPid(for: 10, explicitPid: 20) == 20)
      precondition(lookups == 1, "Validate the supplied process instead of trusting a cached identity")
      entries = [[kCGWindowNumber as String: 10, kCGWindowOwnerPID as String: 99]]
      precondition(resolveOwnerPid(for: 10, explicitPid: 20) == nil, "Never focus a window reused by another process")
      precondition(resolveOwnerPid(for: 10, explicitPid: nil) == 99)
      entries = []
      precondition(resolveOwnerPid(for: 10, explicitPid: 20) == nil, "A closed window must fail before AX discovery")`,
    ].join("\n"),
  );
});

test("companion window focus rejects a reused ID owned by another application before AX discovery", () => {
  runSwiftHarness(
    [
      "import Foundation\nstruct NativeWindowInput {}",
      "var ownerPid: Int32? = 20; var discoveries = 0",
      "func resolveOwnerPid(for id: CGWindowID, explicitPid: Int32?) -> Int32? { ownerPid }",
      `func discoverAXWindowElements(pid: Int32, expectedWindowIds: Set<CGWindowID>, maxElementId: UInt64, verifyRoleForDirectCandidates: Bool) -> [CGWindowID: AXUIElement] {
        discoveries += 1
        return [10: window]
      }`,
      swiftFunction(readAsset("macos-windows.swift"), "handleFocus"),
      `try handleFocus(args: ["10", "", "Test Browser", "/Applications/Test Browser.app"])
      precondition(discoveries == 1 && focusRequests.count == 1)
      fixtureAppPath = "/Applications/Other.app"
      do {
        try handleFocus(args: ["10", "", "Test Browser", "/Applications/Test Browser.app"])
        fatalError("A reused window ID must not activate another browser bundle")
      } catch {}
      fixtureAppName = "Other"
      do {
        try handleFocus(args: ["10", "", "Test Browser"])
        fatalError("Without a bundle path, validate the live app name")
      } catch {}
      ownerPid = nil
      do {
        try handleFocus(args: ["10", "", "Test Browser"])
        fatalError("A closed window must fail")
      } catch {}
      precondition(discoveries == 1 && focusRequests.count == 1, "Reject changed owners before AX or activation")`,
    ].join("\n"),
    [fixturePath("tab-identity-support.swift")],
  );
});

test("native list retains minimized dialogs and off-space apps without exposing utility windows", () => {
  const source = readAsset("macos-windows.swift");
  const types = source.slice(source.indexOf("struct WindowFrame"), source.indexOf("func copyAttr"));
  // Replace only OS discovery calls; execute the production list pipeline and types.
  const list = swiftFunction(source, "handleList")
    .replaceAll("CGWindowListCopyWindowInfo(", "fixtureWindowInfo(")
    .replaceAll("NSRunningApplication(", "FixtureApplication(");
  const main = [
    "import AppKit\nimport ApplicationServices\nimport CoreGraphics\nimport Foundation",
    types,
    list,
    "try handleList()",
  ].join("\n");
  const windows: NativeWindow[] = JSON.parse(runSwiftHarness(main, [fixturePath("native-windows-support.swift")]));
  assert.deepEqual(
    windows.map((window) => window.id).sort((a, b) => a - b),
    [10, 11, 12, 17, 20, 22, 23, 25, 26],
    "minimized/hidden dialogs and off-space app records must survive; utility, transparent and tiny windows must not",
  );
  assert.equal(windows.find((window) => window.id === 10)!.space, 0);
  assert.equal(windows.find((window) => window.id === 12)!["has-ax-reference"], true);
  assert.equal(windows.find((window) => window.id === 17)!["has-ax-reference"], false);
  assert.equal(windows.find((window) => window.id === 20)!["has-ax-reference"], false);
  assert.equal(windows.find((window) => window.id === 22)!.subrole, "AXDialog");
  assert.equal(windows.find((window) => window.id === 25)!.space, 0);
  assert.equal(windows.find((window) => window.id === 25)!["has-ax-reference"], false);
  assert.equal(windows.find((window) => window.id === 10)!.isMinimized, true);
  assert.equal(windows.find((window) => window.id === 10)!.frontOrder, 0);
  assert.equal(windows.find((window) => window.id === 12)!.isHidden, true);
  assert.equal(windows.find((window) => window.id === 25)!.isMinimized, undefined);
});

test("application-scoped native discovery rejects unrelated owners before Accessibility queries", () => {
  const source = readAsset("macos-windows.swift");
  const types = source.slice(source.indexOf("struct WindowFrame"), source.indexOf("func copyAttr"));
  const list = swiftFunction(source, "handleList")
    .replaceAll("CGWindowListCopyWindowInfo(", "fixtureWindowInfo(")
    .replaceAll("NSRunningApplication(", "FixtureApplication(");
  const output = runSwiftHarness(
    [
      "import AppKit\nimport ApplicationServices\nimport CoreGraphics\nimport Foundation",
      types,
      list,
      "func handleApplications() throws {}\nfunc handleFocus(args: [String]) throws {}",
      swiftFunction(source, "run"),
      `try run(args: ["list", "Test", "/Applications/Target.app"])
    precondition(discoveredPids == [20], "Only the requested application's owners may receive AX queries")
    discoveredPids.removeAll()
    otherOwnerName = "Other"
    try run(args: ["list", "Test"])
    precondition(discoveredPids == [20], "Name-only browser configs must also skip unrelated owners")
    discoveredPids.removeAll()
    try run(args: ["list", "Test", "/Applications/Other.app"])
    precondition(discoveredPids.isEmpty, "A mismatched bundle path must fail before AX discovery")`,
    ].join("\n"),
    [fixturePath("native-windows-support.swift")],
  );
  const [windows, byName, mismatched] = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as NativeWindow[]);
  assert.deepEqual(
    windows.map((window) => window.id).sort((a, b) => a - b),
    [10, 11],
  );
  assert.deepEqual(byName, windows);
  assert.deepEqual(mismatched, []);
});
