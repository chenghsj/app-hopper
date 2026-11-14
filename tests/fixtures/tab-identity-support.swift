import Foundation
import CoreFoundation

typealias CGWindowID = UInt32
final class Element: NSObject {
  let key: String
  init(_ key: String) { self.key = key }
}
typealias AXUIElement = Element
enum AXError: Int { case success = 0, failure = -1 }

let kAXTitleAttribute = "AXTitle", kAXDocumentAttribute = "AXDocument", kAXSubroleAttribute = "AXSubrole"
let kAXMinimizedAttribute = "AXMinimized", kAXPressAction = "AXPress", kAXRaiseAction = "AXRaise", kAXMainAttribute = "AXMain"
let first = Element("first"), second = Element("second"), window = Element("window")
var currentTabs = [first, second]
var pressed: [String] = []
var pressSucceeds = true
var aeSelections = 0
var pageTitle = "Same"
var windowSubrole = "AXStandardWindow"
var focusVerified = true
func activateVivaldiTab(pid: Int32, tab: AXUIElement) throws { preconditionFailure("Not a Vivaldi fixture") }

var focusRequests: [(unhide: Bool, setFocused: Bool)] = []
func focusWindow(_ window: AXUIElement, pid: Int32, windowId: CGWindowID, unhide: Bool = true, setFocused: Bool = false) throws {
  focusRequests.append((unhide, setFocused))
  if !focusVerified {
    throw NSError(domain: "WindowFocus", code: 1, userInfo: [NSLocalizedDescriptionKey: "Window did not become focused"])
  }
}

func AXIsProcessTrusted() -> Bool { true }
func AXUIElementGetPid(_ element: AXUIElement, _ pid: UnsafeMutablePointer<Int32>) -> AXError {
  pid.pointee = 20
  return .success
}
func AXUIElementPerformAction(_ element: AXUIElement, _ action: CFString) -> AXError {
  if action as String == kAXPressAction {
    if !pressSucceeds { return .failure }
    pressed.append(element.key)
  }
  return .success
}
func AXUIElementSetAttributeValue(_ element: AXUIElement, _ attribute: CFString, _ value: CFTypeRef) -> AXError { .success }

struct NSRunningApplication {
  let launchDate: Date? = Date(timeIntervalSince1970: 1)
  init?(processIdentifier: Int32) {}
  func unhide() {}
  func activate() {}
  func activate(options: ActivationOptions) {}
  struct ActivationOptions: OptionSet {
    let rawValue: Int
    static let activateIgnoringOtherApps = ActivationOptions(rawValue: 1)
  }
}

func findBrowserPIDs(appName: String, nativeWindows: [NativeWindowInput]) -> [Int32] { [20] }
func discoverAXWindows(
  pid: Int32, expectedWindowIds: Set<CGWindowID>, maxElementId: UInt64 = 500, enhancedUI: Bool = false
) -> [CGWindowID: AXUIElement] { [10: window] }
func stringAttr(_ element: AXUIElement, _ attr: String) -> String {
  if attr == kAXSubroleAttribute { return windowSubrole }
  return attr == kAXDocumentAttribute ? "https://example.com/same" : "Same"
}
func boolAttr(_ element: AXUIElement, _ attr: String) -> Bool { false }
