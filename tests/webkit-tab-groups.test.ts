import assert from "node:assert/strict";
import test from "node:test";
import { readAsset, readFixture, swiftFunction, runSwiftHarness } from "./swift-harness.ts";

test("WebKit reads ordinary and pinned tab groups once each for both listing and focus", () => {
  const output = runSwiftHarness(
    [
      readFixture("webkit-tab-groups.swift"),
      swiftFunction(readAsset("webkit-ax.swift"), "inspectWebKitWindow"),
      `for collectUrl in [true, false] {
        let result = inspectWebKitWindow(window, collectUrl: collectUrl)
        print(result.tabButtons.map { $0.key }.joined(separator: ","))
      }
      let duplicated = Element("AXWindow", children: [ordinaryGroup, ordinaryGroup, pinnedGroup])
      print(inspectWebKitWindow(duplicated).tabButtons.map { $0.key }.joined(separator: ","))
      let direct = Element("AXWindow", children: [Element("AXTabGroup", children: [ordinary, pinned])])
      print(inspectWebKitWindow(direct).tabButtons.map { $0.key }.joined(separator: ","))`,
    ].join("\n"),
  );
  // These are separate AX objects with the same title, not duplicate tab rows.
  assert.deepEqual(output.trim().split("\n"), Array(4).fill("ordinary,pinned"));
});
