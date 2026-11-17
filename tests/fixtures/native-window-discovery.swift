import Foundation
import CoreFoundation

typealias CGWindowID = UInt32

final class AXUIElement {
  let id: Int
  var timeout: Double = 0
  init(_ id: Int) { self.id = id }
}

enum AXError { case success, cannotComplete }

let kAXWindowsAttribute = "windows"
let kAXMainWindowAttribute = "main"
let kAXFocusedWindowAttribute = "focused"
let kAXRoleAttribute = "role"
var route = "windows"
var requireElementTimeout = true
var fixtureTime: TimeInterval = 0
var queriedElements: [Int] = []

func AXUIElementCreateApplication(_ pid: Int32) -> AXUIElement { AXUIElement(0) }
func AXUIElementSetMessagingTimeout(_ element: AXUIElement, _ timeout: Double) {
  element.timeout = timeout
}
func copyAttr(_ element: AXUIElement, _ attribute: String) -> Any? {
  if attribute == kAXWindowsAttribute { return ["windows", "slow"].contains(route) ? [AXUIElement(1)] : [] }
  if attribute == kAXMainWindowAttribute && route == "main" { return AXUIElement(1) }
  if attribute == kAXFocusedWindowAttribute && route == "focused" { return AXUIElement(1) }
  return nil
}
func stringAttr(_ element: AXUIElement, _ attribute: String) -> String {
  if requireElementTimeout {
    precondition(element.timeout > 0, "Bound each Accessibility object before querying it")
  }
  return "AXWindow"
}
func _AXUIElementGetWindow(_ element: AXUIElement, _ wid: UnsafeMutablePointer<CGWindowID>) -> AXError {
  if requireElementTimeout {
    precondition(element.timeout > 0 && element.timeout <= 0.25,
      "A timeout on the application object does not bound a window object's first query")
  }
  queriedElements.append(element.id)
  if route == "slow" && element.id != 1 {
    fixtureTime += 0.15
    return .cannotComplete
  }
  wid.pointee = 10
  return .success
}
func _AXUIElementCreateWithRemoteToken(_ token: CFData) -> Unmanaged<AXUIElement>? {
  let data = Data(bytes: CFDataGetBytePtr(token)!, count: CFDataGetLength(token))
  let id = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 12, as: UInt64.self) }
  return .passRetained(AXUIElement(route == "slow" ? Int(id) + 1 : 1))
}
