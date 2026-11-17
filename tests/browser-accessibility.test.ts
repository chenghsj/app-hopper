import test from "node:test";
import { readAsset, readFixture, swiftFunction, runSwiftHarness } from "./swift-harness.ts";

function discoveryHarness(main: string) {
  const source = readAsset("browser-accessibility.swift");
  return runSwiftHarness(
    [
      readFixture("native-window-discovery.swift"),
      "func AXUIElementSetAttributeValue(_ element: AXUIElement, _ attr: CFString, _ value: CFTypeRef) {}",
      swiftFunction(source, "windowId"),
      swiftFunction(source, "discoverAXWindows").replaceAll("ProcessInfo.processInfo.systemUptime", "fixtureTime"),
      main,
    ].join("\n"),
  );
}

test("browser discovery bounds the first AX query on direct, main, focused and remote window references", () => {
  discoveryHarness(`
    for currentRoute in ["windows", "main", "focused", "remote"] {
      route = currentRoute
      queriedElements = []
      let found = discoverAXWindows(pid: 20, expectedWindowIds: [10])
      precondition(found[10] != nil, "Keep the discovered browser window")
      precondition(queriedElements == [1], "Do not probe after finding the expected window")
    }
  `);
});

test("browser discovery stops slow token scanning while retaining responsive windows", () => {
  discoveryHarness(`
    route = "slow"
    requireElementTimeout = false
    let found = discoverAXWindows(pid: 20, expectedWindowIds: [10, 11], maxElementId: 5000)
    precondition(found[10] != nil, "Retain the responsive window")
    precondition(found[11] == nil)
    precondition(fixtureTime < 2, "Stop probing well before the command's ten-second deadline")
    precondition(queriedElements.count < 20, "Bound Firefox/Zen's 5,000-token fallback by elapsed time")
  `);
});
