import assert from "node:assert/strict";
import test from "node:test";
import { assetPath, fixturePath, readAsset, swiftFunction, runSwiftHarness } from "./swift-harness.ts";

test("Vivaldi reads and focuses tabs inside its browser UI without collecting page controls", () => {
  const source = readAsset("chromium-ax.swift");
  const types = source.slice(source.indexOf("struct NativeWindowInput"), source.indexOf("\nfunc "));
  const output = runSwiftHarness(
    [
      "import Foundation",
      types,
      "private let tabReferences = TabReferenceStore()",
      ...[
        "chromiumBrowserPolicy",
        "collectChromiumTabs",
        "matchUrlsByTitle",
        "buildWindowOutput",
        "handleList",
        "handleFocus",
      ].map((name) => swiftFunction(source, name).split("\nprivate let tabReferences")[0]),
      `let uiURL = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/window.html"
      let fakeTab = Element("AXRadioButton", subrole: "AXTabButton", key: "page-control")
      let page = Element("AXWebArea", url: "https://example.com", children: [fakeTab])
      let nestedUI = Element("AXWebArea", url: uiURL, children: [fakeTab])
      var content = Element("AXGroup", children: [tabGroup, page, nestedUI])
      for _ in 0..<8 { content = Element("AXGroup", children: [content]) }
      var ui = Element("AXWebArea", url: uiURL, children: [content])
      for _ in 0..<5 { ui = Element("AXGroup", children: [ui]) }
      window.children = [ui, page]
      let payload = "[{\\\"id\\\":10,\\\"pid\\\":20,\\\"title\\\":\\\"Same\\\"}]"
      try handleList(args: ["Vivaldi", payload])
      let target = tabReferences.register(windowId: 10, element: operaTabs[1], fallbackIndex: 1)
      tabGroup.children = [operaTabs[2], operaTabs[0], operaTabs[1]]
      try handleFocus(args: ["Vivaldi", "10", target, "Same", "20"])
      precondition(pressed == ["target"], "Focus must retain the exact Vivaldi tab")
      pressSelects = false
      selectedTab = operaTabs[2]
      try handleFocus(args: ["Vivaldi", "10", target, "Same", "20"])
      precondition(selectedTab === operaTabs[1], "A no-op AXPress must activate the exact retained tab through scripting")
      precondition(scriptedTabs == ["target"])
      scriptSelects = false
      selectedTab = operaTabs[2]
      do {
        try handleFocus(args: ["Vivaldi", "10", target, "Same", "20"])
        fatalError("A successful AXPress without a selected tab must not report success")
      } catch {
        precondition(error.localizedDescription.contains("did not activate"))
      }
      try handleList(args: ["Google Chrome", payload])`,
    ].join("\n"),
    [assetPath("browser-tab-references.swift"), fixturePath("opera-native.swift")],
  );
  const [list, focused, fallback, chrome] = output.trim().split("\n");
  assert.equal(JSON.parse(list)[0].tabs.length, 3, "Read browser tabs and ignore both nested web areas");
  assert.equal(focused, "ok");
  assert.equal(fallback, "ok");
  assert.equal(JSON.parse(chrome)[0].tabs.length, 1, "Chrome must continue pruning all web areas");
});

test("Vivaldi scripting selects the live tab ID after reordering and rejects missing or changed targets", () => {
  const source = readAsset("chromium-ax.swift");
  runSwiftHarness(
    [
      "import AppKit\nimport Carbon\ntypealias AXUIElement = String",
      ...[
        "fourCC",
        "everyElement",
        "propertySpec",
        "vivaldiTabID",
        "vivaldiScriptTarget",
        "vivaldiWindowSpec",
        "vivaldiStringValues",
        "activateVivaldiTab",
      ].map((name) => swiftFunction(source, name)),
      `func stringAttr(_ tab: String, _ attribute: String) -> String { tab }
      var windows = [(id: "11", tabs: ["1001", "1003"]), (id: "12", tabs: ["1002", "1004"])]
      var activated: [(String, Int)] = []
      var activeID = "1004"
      var changeDuringActivation = false
      func values(_ strings: [String]) -> NSAppleEventDescriptor {
        let result = NSAppleEventDescriptor.list()
        for (index, string) in strings.enumerated() {
          result.insert(string.isEmpty ? .null() : NSAppleEventDescriptor(string: string), at: index + 1)
        }
        return result
      }
      func ownerID(_ spec: NSAppleEventDescriptor) -> String {
        if spec.forKeyword( fourCC("want"))?.typeCodeValue == fourCC("cwin") {
          return spec.forKeyword( fourCC("seld"))?.stringValue ?? ""
        }
        return ownerID(spec.forKeyword( fourCC("from"))!)
      }
      func sendVivaldiAppleEvent(pid: Int32, command: String, target: NSAppleEventDescriptor,
        value: NSAppleEventDescriptor? = nil) throws -> NSAppleEventDescriptor {
        precondition(pid == 20, "Keep the target process scoped")
        let property = target.forKeyword( fourCC("seld"))!.typeCodeValue
        let container = target.forKeyword( fourCC("from"))!
        if command == "setd" {
          precondition(property == fourCC("acTI"), "Use Vivaldi's active tab index property")
          let id = ownerID(container), index = Int(value!.int32Value)
          activated.append((id, index))
          activeID = windows.first(where: { $0.id == id })!.tabs[index - 1]
          return .null()
        }
        precondition(command == "getd" && property == fourCC("ID  "))
        if container.forKeyword( fourCC("want"))?.typeCodeValue == fourCC("cwin"),
          container.forKeyword( fourCC("form"))?.enumCodeValue == fourCC("indx") {
          return values(windows.map { $0.id })
        }
        if container.forKeyword( fourCC("want"))?.typeCodeValue == fourCC("CrTb") {
          return values(windows.first(where: { $0.id == ownerID(container) })!.tabs)
        }
        precondition(container.forKeyword( fourCC("seld"))?.typeCodeValue == fourCC("acTa"))
        return NSAppleEventDescriptor(string: changeDuringActivation ? "1003" : activeID)
      }
      precondition(vivaldiTabID(domIdentifier: "tab-1002") == "1002")
      for invalid in ["1002", "tab-", "tab-0", "tab-1002-extra", "tab-１２"] {
        precondition(vivaldiTabID(domIdentifier: invalid) == nil)
      }
      try activateVivaldiTab(pid: 20, tab: "tab-1002")
      precondition(activated.last!.0 == "12" && activated.last!.1 == 1 && activeID == "1002")
      windows.reverse()
      windows[0].tabs.reverse()
      try activateVivaldiTab(pid: 20, tab: "tab-1002")
      precondition(activated.last!.0 == "12" && activated.last!.1 == 2 && activeID == "1002")
      windows = [(id: "12", tabs: ["", "1002"])]
      try activateVivaldiTab(pid: 20, tab: "tab-1002")
      precondition(activated.last!.1 == 2, "Unavailable IDs must not shift the target index")
      precondition(vivaldiScriptTarget(tabID: "1002", windows: [(id: "", tabs: ["1002"])]) == nil)
      let before = activated.count
      for invalidWindows in [
        [(id: "11", tabs: ["1001"])],
        [(id: "11", tabs: ["1002"]), (id: "12", tabs: ["1002"])],
      ] {
        windows = invalidWindows
        do { try activateVivaldiTab(pid: 20, tab: "tab-1002"); fatalError("Missing or ambiguous tab must fail") }
        catch { precondition(error.localizedDescription.contains("moved or closed")) }
        precondition(activated.count == before)
      }
      windows = [(id: "12", tabs: ["1002", "1003"])]
      changeDuringActivation = true
      do { try activateVivaldiTab(pid: 20, tab: "tab-1002"); fatalError("A different selected tab must fail") }
      catch { precondition(error.localizedDescription.contains("changed during activation")) }`,
    ].join("\n"),
  );
});
