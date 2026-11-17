import Foundation

func inspectBrowserWindow(_ window: AXUIElement) -> WindowAXContent {
  WindowAXContent(tabButtons: currentTabs, urlBarValue: "https://example.com/same")
}
func tabTitle(of tab: AXUIElement) -> String { pageTitle }
func readTabInfo(_ tab: AXUIElement) -> (title: String, selected: Bool) { (pageTitle, tab === first) }
func makeWindowOutput() -> BrowserWindowOutput {
  buildWindowOutput(wid: 10, axWindow: window, fallbackTitle: nil, space: nil)!
}

func assertHiddenTabsAreUnavailable() {
  currentTabs = []
  precondition(makeWindowOutput().tabListUnavailable)
  precondition(makeWindowOutput().tabs.isEmpty,
    "A hidden sidebar must not turn the active page into a fabricated single-tab list")
  let encoded = try! JSONEncoder().encode(makeWindowOutput())
  let fields = try! JSONSerialization.jsonObject(with: encoded) as! [String: Any]
  precondition(fields["activeTabUrl"] as? String == "https://example.com/same",
    "Retain the window URL as identity evidence when tab controls are hidden")
}
