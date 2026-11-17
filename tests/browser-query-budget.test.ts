import test from "node:test";
import { readAsset, swiftFunction, runSwiftHarness } from "./swift-harness.ts";

const support = `
import Foundation
typealias FourCharCode = String
func fourCC(_ value: String) -> String { value }
var fixtureTime: TimeInterval = 0
var slow = true
var queries: [String] = []
${readAsset("browser-query-budget.swift").replaceAll("ProcessInfo.processInfo.systemUptime", "fixtureTime")}
func read<T>(_ label: String, timeout: TimeInterval, value: T) -> T? {
  guard timeout > 0 else { return nil }
  queries.append(label)
  let cost: TimeInterval = slow ? 5 : 0.01
  fixtureTime += min(cost, timeout)
  return cost < timeout ? value : nil
}
`;

for (const engine of ["chromium", "webkit"] as const) {
  test(`${engine} URL queries and their fallback share one elapsed-time budget`, () => {
    const source = readAsset(`${engine}-ax.swift`);
    const fetch = engine === "chromium" ? "fetchAppleEventTabUrlsByPid" : "fetchAppleEventWindowsByPid";
    const mocks =
      engine === "chromium"
        ? `
      ${swiftFunction(source, "chromiumBrowserPolicy")}
      func queryAppleEventNestedStrings(pid: Int32, prop: String, tabClass: String, timeout: TimeInterval = 2) -> [[String]]? {
        read(prop, timeout: timeout, value: [[prop == "URL " ? "https://example.com" : "Docs"]])
      }
      func fetchTabsViaAppleScript(appName: String, timeout: TimeInterval = 2) -> [(titles: [String], urls: [String])]? {
        read("fallback", timeout: timeout, value: [(titles: ["Docs"], urls: ["https://example.com"])])
      }
    `
        : `
      struct AEWindowCandidate { let windowId: Int?; let titles: [String]; let urls: [String] }
      func queryAppleEventWindowIds(pid: Int32, timeout: TimeInterval = 2) -> [Int]? {
        read("ids", timeout: timeout, value: [10])
      }
      func queryAppleEventNestedStrings(pid: Int32, tabClass: String, prop: String, timeout: TimeInterval = 2) -> [[String]]? {
        read(prop, timeout: timeout, value: [[prop == "pURL" || prop == "URL " ? "https://example.com" : "Docs"]])
      }
      func fetchWindowsViaAppleScript(appName: String, timeout: TimeInterval = 2) -> [AEWindowCandidate]? {
        read("fallback", timeout: timeout, value: [AEWindowCandidate(windowId: 10, titles: ["Docs"], urls: ["https://example.com"])])
      }
    `;
    runSwiftHarness(
      [
        support,
        mocks,
        swiftFunction(source, fetch),
        `let budget = BrowserQueryBudget()
      let unavailable = ${fetch}(pid: 20, appName: "Browser", budget: budget)
      precondition(unavailable == nil)
      precondition(fixtureTime <= 2.001, "Sequential timeouts must share a total budget")
      precondition(!queries.contains("fallback"), "An exhausted query must not start another fallback")
      let completedQueries = queries
      precondition(${fetch}(pid: 21, appName: "Browser", budget: budget) == nil)
      precondition(queries == completedQueries, "Another process must share the browser's exhausted budget")
      slow = false
      fixtureTime = 0
      queries = []
      let available = ${fetch}(pid: 20, appName: "Browser")!
      precondition(available.count == 1 && available[0].urls == ["https://example.com"])
      precondition(available[0].titles == ["Docs"])
      precondition(!queries.contains("fallback"))`,
      ].join("\n"),
    );
  });

  test(`${engine} script fallback compiles with the remaining whole-second timeout and skips exhausted budgets`, () => {
    const source = readAsset(`${engine}-ax.swift`);
    const name = engine === "chromium" ? "fetchTabsViaAppleScript" : "fetchWindowsViaAppleScript";
    runSwiftHarness(
      [
        "import AppKit",
        "struct AEWindowCandidate { let windowId: Int?; let titles: [String]; let urls: [String] }",
        `var executions = 0
      func fixtureExecute(_ script: NSAppleScript) -> NSAppleEventDescriptor {
        executions += 1
        precondition(script.source!.contains("with timeout of (my remainingSeconds("))
        precondition(script.source!.components(separatedBy: "with timeout").count == ${engine === "chromium" ? 3 : 4},
          "Every application command must recompute its remaining timeout")
        var error: NSDictionary?
        precondition(script.compileAndReturnError(&error), "Invalid bounded AppleScript: \\(String(describing: error))")
        let clockSource = script.source!.components(separatedBy: "tell application")[0]
        let future = ProcessInfo.processInfo.systemUptime + 5
        let clock = NSAppleScript(source: clockSource + "\\nreturn my remainingSeconds(\\(future))")!
        let seconds = clock.executeAndReturnError(&error).int32Value
        precondition(error == nil && seconds > 0 && seconds <= 5, "Use the same monotonic clock as Swift")
        let expired = NSAppleScript(source: clockSource + "\\nreturn my remainingSeconds(0)")!
        _ = expired.executeAndReturnError(&error)
        precondition(error?[NSAppleScript.errorNumber] as? Int == -1712, "Stop before a command after the shared deadline")
        return NSAppleEventDescriptor.list()
      }`,
        swiftFunction(source, name)
          .replace("script.executeAndReturnError(&errorInfo)", "fixtureExecute(script)")
          .replace("var errorInfo: NSDictionary?", "let errorInfo: NSDictionary? = nil"),
        `_ = ${name}(appName: "Safari", timeout: 0.5)
      precondition(executions == 0, "A sub-second remainder must not round up to another second")
      _ = ${name}(appName: "Safari", timeout: 1.9)
      precondition(executions == 1)`,
        readAsset("browser-query-budget.swift"),
      ].join("\n"),
    );
  });
}
