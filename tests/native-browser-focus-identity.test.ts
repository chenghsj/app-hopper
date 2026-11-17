import assert from "node:assert/strict";
import test from "node:test";
import { readAsset, runSwiftHarness, swiftFunction } from "./swift-harness.ts";

test("native window identity requires stable focus and the same process generation across discovery", () => {
  const source = readAsset("firefox-ax.swift");
  const typeStart = source.indexOf("struct NativeWindowInput");
  const types = source.slice(typeStart, source.indexOf("\nfunc ", typeStart));
  const ownerSource = readAsset("browser-process.swift");
  const output = runSwiftHarness(
    [
      "import Foundation\ntypealias AXUIElement = Int\ntypealias CGWindowID = UInt32",
      ownerSource.slice(0, ownerSource.indexOf("func browserProcessIdentity")),
      types,
      `var scenario = "stable"
    var focusReads = 0
    var ownerReads = 0
    func AXIsProcessTrusted() -> Bool { true }
    func focusedWindowId(pid: Int32) -> CGWindowID? {
      focusReads += 1
      return scenario == "changed" && focusReads > 1 ? 156 : 155
    }
    func browserProcessIdentity(_ pid: Int32) -> BrowserProcessIdentity? {
      ownerReads += 1
      return BrowserProcessIdentity(pid: pid, launchedAt: scenario == "restart" && ownerReads > 1 ? 2000 : 1000)
    }
    func findBrowserPIDs(appName: String, nativeWindows: [NativeWindowInput]) -> [Int32] { [123] }
    func discoverAXWindows(pid: Int32, expectedWindowIds: Set<CGWindowID>, maxElementId: UInt64) -> [CGWindowID: AXUIElement] { [155: 155, 156: 156] }
    func buildWindowOutput(wid: CGWindowID, axWindow: AXUIElement?, fallbackTitle: String?, space: Int?) -> BrowserWindowOutput? {
      BrowserWindowOutput(id: String(wid), title: "Same", tabs: [], space: space, tabListUnavailable: true)
    }`,
      swiftFunction(source, "handleList"),
      `let input = String(data: try! JSONSerialization.data(withJSONObject: [
      ["id": 155, "pid": 123, "title": "Same", "space": 1],
      ["id": 156, "pid": 123, "title": "Same", "space": 2]
    ]), encoding: .utf8)!
    for mode in ["stable", "changed", "restart"] {
      scenario = mode
      focusReads = 0
      ownerReads = 0
      try handleList(args: ["Zen", input])
    }`,
    ].join("\n"),
  );
  type Row = { isLastFocused?: boolean; browserProcess?: { pid: number; launchedAt: number } };
  const [stable, changed, restarted] = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Row[]);
  assert.deepEqual(
    stable.map((window) => window.isLastFocused),
    [true, false],
  );
  assert(stable.every((window) => window.browserProcess?.pid === 123 && window.browserProcess.launchedAt === 1000));
  assert(changed.every((window) => window.isLastFocused === undefined));
  assert(restarted.every((window) => window.browserProcess === undefined && window.isLastFocused === undefined));
});
