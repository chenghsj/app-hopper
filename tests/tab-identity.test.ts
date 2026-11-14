import test from "node:test";
import { assetPath, fixturePath, readAsset, readFixture, swiftFunction, runSwiftHarness } from "./swift-harness.ts";

for (const engine of ["chromium", "webkit", "firefox"]) {
  test(`${engine} switches the exact identical tab after reorder and rejects closed or foreign references`, () => {
    const source = readAsset(`${engine}-ax.swift`);
    const types = source.slice(
      source.indexOf("struct NativeWindowInput"),
      source.indexOf("\nfunc ", source.indexOf("struct NativeWindowInput")),
    );
    const functions = ["buildWindowOutput", "handleFocus"];
    if (engine === "chromium") functions.unshift("chromiumBrowserPolicy", "matchUrlsByTitle");
    if (engine === "webkit")
      functions.push(
        "focusTabViaAppleEvent",
        "matchedTabURL",
        "preferredWindowURL",
        "appleEventTabs",
        "buildWindowWithoutAX",
        "buildWindowWithoutTabControls",
      );

    // Exercise production list/focus functions and the shared reference store; only OS calls are stubbed.
    const main = [
      "import Foundation",
      types,
      "private let tabReferences = TabReferenceStore()",
      ...functions.map((name) => swiftFunction(source, name).split("\nprivate let tabReferences")[0]),
      readFixture("tab-identity-scenarios.swift"),
      engine === "webkit" ? "assertNonBrowserDialogIsExcluded(); assertWebKitURLsFollowTabs()" : "",
      engine === "firefox" ? "assertHiddenTabsAreUnavailable()" : "",
      `precondition(focusRequests.allSatisfy { $0.unhide == ${engine !== "firefox"} && !$0.setFocused })`,
    ].join("\n");
    runSwiftHarness(main, [
      assetPath("browser-tab-references.swift"),
      fixturePath("tab-identity-support.swift"),
      fixturePath(`tab-identity-${engine}.swift`),
    ]);
  });
}

test("native window focus reports failure when the target never becomes focused", () => {
  const focus = swiftFunction(readAsset("macos-windows.swift"), "handleFocus").split("\ndo {")[0];
  runSwiftHarness(
    [
      "import Foundation\nstruct NativeWindowInput {}",
      'let kAXFocusedAttribute = "AXFocused"',
      "func resolveOwnerPid(for id: CGWindowID, explicitPid: Int32?) -> Int32? { 20 }",
      "func discoverAXWindowElements(pid: Int32, expectedWindowIds: Set<CGWindowID>, maxElementId: UInt64, verifyRoleForDirectCandidates: Bool) -> [CGWindowID: AXUIElement] { [10: window] }",
      focus,
      `focusVerified = false
      do {
        try handleFocus(args: ["10", "20"])
        fatalError("Unverified window focus must not report success")
      } catch {}
      focusVerified = true
      try handleFocus(args: ["10", "20"])
      precondition(focusRequests.allSatisfy { $0.unhide && $0.setFocused })`,
    ].join("\n"),
    [fixturePath("tab-identity-support.swift")],
  );
});

test("WebKit fallback fills URLs only for a uniquely identified active AppleEvent tab", () => {
  const source = readAsset("webkit-ax.swift");
  const types = source.slice(
    source.indexOf("struct NativeWindowInput"),
    source.indexOf("\nfunc ", source.indexOf("struct NativeWindowInput")),
  );
  runSwiftHarness(
    [
      "import Foundation\ntypealias AXUIElement = Int",
      types,
      swiftFunction(source, "preferredWindowURL"),
      swiftFunction(readAsset("browser-tab-references.swift"), "uniqueTabTitleIndex"),
      swiftFunction(source, "appleEventTabs"),
      `let inspection = WindowAXInspection(webAreaUrl: "web", addressBarUrl: "address")
    precondition(preferredWindowURL(documentURL: "document", inspection: inspection, fallbackURL: "native") == "document")
    precondition(preferredWindowURL(documentURL: "", inspection: inspection, fallbackURL: "native") == "web")
    let addressOnly = WindowAXInspection(addressBarUrl: "address")
    precondition(preferredWindowURL(documentURL: "", inspection: addressOnly, fallbackURL: "native") == "native")
    precondition(preferredWindowURL(documentURL: "", inspection: addressOnly, fallbackURL: nil) == "address")
    let candidate = AEWindowCandidate(windowId: 10, titles: ["", "Other", "Known"], urls: ["", "", "known"])
    let tabs = appleEventTabs(candidate, windowId: "10", fallbackTitle: "Window", activeURL: "active")
    precondition(tabs.map { $0.title } == ["Window", "Other", "Known"])
    precondition(tabs.map { $0.url } == ["", "", "known"], "Unknown active identity cannot assign a URL to the first tab")
    precondition(appleEventTabs(candidate, windowId: "10").map { $0.url } == ["", "", "known"])
    let later = AEWindowCandidate(windowId: 10, titles: ["First", "Active"], urls: ["", ""])
    precondition(appleEventTabs(later, windowId: "10", fallbackTitle: "Active", activeURL: "active").map { $0.url } == ["", "active"])
    let duplicate = AEWindowCandidate(windowId: 10, titles: ["Same", "Same"], urls: ["", ""])
    precondition(appleEventTabs(duplicate, windowId: "10", fallbackTitle: "Same", activeURL: "active").map { $0.url } == ["", ""])
    let single = AEWindowCandidate(windowId: 10, titles: ["Only"], urls: [""])
    precondition(appleEventTabs(single, windowId: "10", activeURL: "active")[0].url == "active")`,
    ].join("\n"),
  );
});
