import Foundation
import CoreFoundation

typealias CGWindowID = UInt32
final class Element {
  let id: CGWindowID
  var minimized = true
  init(_ id: CGWindowID) { self.id = id }
}
typealias AXUIElement = Element
enum AXError { case success }
let kAXMinimizedAttribute = "AXMinimized", kAXRaiseAction = "AXRaise", kAXMainAttribute = "AXMain"
let kAXFocusedAttribute = "AXFocused", kAXFocusedWindowAttribute = "AXFocusedWindow"
let targetWindow = Element(10)
var focusedWindow: Element? = Element(11)
var events: [String] = []
var raiseSucceeds = true

func boolAttr(_ element: Element, _ attribute: String) -> Bool { element.minimized }
func copyAttr(_ element: Element, _ attribute: String) -> Any? { focusedWindow }
func windowId(of element: Element) -> CGWindowID { element.id }
func AXUIElementCreateApplication(_ pid: Int32) -> Element { Element(CGWindowID(pid)) }
func AXUIElementSetMessagingTimeout(_ element: Element, _ timeout: Double) {}
func AXUIElementPerformAction(_ element: Element, _ action: CFString) -> AXError {
  events.append("raise")
  if raiseSucceeds { focusedWindow = element }
  return .success
}
func AXUIElementSetAttributeValue(_ element: Element, _ attribute: CFString, _ value: CFTypeRef) -> AXError {
  if attribute as String == kAXMinimizedAttribute {
    events.append("restore")
    element.minimized = false
  } else {
    events.append(attribute as String == kAXMainAttribute ? "main" : "focused")
  }
  return .success
}
struct NSRunningApplication {
  let processIdentifier: Int32
  init?(processIdentifier: Int32) { self.processIdentifier = processIdentifier }
  func unhide() { events.append("unhide") }
  func activate() {
    events.append("activate")
    focusedWindow = Element(11)
    // Frontmost application changes are delivered through the main run loop.
    RunLoop.current.perform { NSWorkspace.shared.frontmostApplication = self }
  }
  func activate(options: ActivationOptions) { activate() }
  struct ActivationOptions: OptionSet {
    let rawValue: Int
    static let activateIgnoringOtherApps = ActivationOptions(rawValue: 1)
  }
}
class NSWorkspace {
  static let shared = NSWorkspace()
  var frontmostApplication: NSRunningApplication?
}
