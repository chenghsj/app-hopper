import test from "node:test";
import { assetPath, fixturePath, readAsset, readFixture, swiftFunction, runSwiftHarness } from "./swift-harness.ts";

for (const engine of ["chromium", "webkit", "firefox"]) {
  test(`${engine} switches the exact identical tab after reorder and rejects closed or foreign references`, () => {
    const source = readAsset(`${engine}-ax.swift`);
    const types = source.slice(source.indexOf("struct NativeWindowInput"), source.indexOf("func copyAttr"));
    const functions = ["buildWindowOutput", "handleFocus"];
    if (engine === "chromium") functions.unshift("matchUrlsByTitle");
    if (engine === "webkit") functions.push("focusTabViaAppleEvent", "matchedTabURL");

    // Exercise production list/focus functions and the shared reference store; only OS calls are stubbed.
    const main = [
      "import Foundation",
      types,
      "private let tabReferences = TabReferenceStore()",
      ...functions.map((name) => swiftFunction(source, name).split("\nprivate let tabReferences")[0]),
      readFixture("tab-identity-scenarios.swift"),
      engine === "webkit" ? "assertNonBrowserDialogIsExcluded(); assertWebKitURLsFollowTabs()" : "",
      engine === "firefox" ? "assertHiddenTabsAreUnavailable()" : "",
    ].join("\n");
    runSwiftHarness(main, [
      assetPath("browser-tab-references.swift"),
      fixturePath("tab-identity-support.swift"),
      fixturePath(`tab-identity-${engine}.swift`),
    ]);
  });
}
