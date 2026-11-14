import Foundation
import CoreFoundation

final class Element: NSObject {
  let role: String
  let subrole: String
  let key: String
  let children: [Element]
  let tabs: [Element]?
  init(_ role: String, subrole: String = "", key: String = "", children: [Element] = [], tabs: [Element]? = nil) {
    self.role = role; self.subrole = subrole; self.key = key; self.children = children; self.tabs = tabs
  }
}
typealias AXUIElement = Element
struct WindowAXInspection {
  var tabButtons: [Element] = []
  var webAreaUrl = ""
  var addressBarUrl = ""
}
let kAXURLAttribute = "AXURL", kAXDocumentAttribute = "AXDocument", kAXValueAttribute = "AXValue"
let kAXChildrenAttribute = "AXChildren"
func roleAndSubrole(_ element: Element) -> (String, String) { (element.role, element.subrole) }
func copyAttr(_ element: Element, _ attribute: String) -> Any? {
  if attribute == "AXTabs" { return element.tabs }
  return attribute == kAXChildrenAttribute ? element.children : nil
}
func stringAttr(_ element: Element, _ attribute: String) -> String { "Same title" }
func urlAttr(_ element: Element, _ attribute: String) -> String { "" }

let ordinary = Element("AXRadioButton", subrole: "AXTabButton", key: "ordinary")
let pinned = Element("AXRadioButton", subrole: "AXTabButton", key: "pinned")
// Orion exposes separate tab groups whose collection children are skipped by the normal scan.
let ordinaryGroup = Element("AXTabGroup", children: [Element("AXList", children: [ordinary])], tabs: [ordinary])
let pinnedGroup = Element("AXTabGroup", children: [Element("AXList", children: [pinned])], tabs: [pinned])
let pageTab = Element("AXRadioButton", subrole: "AXTabButton", key: "page-control")
let window = Element("AXWindow", children: [ordinaryGroup, pinnedGroup, Element("AXWebArea", children: [pageTab])])
