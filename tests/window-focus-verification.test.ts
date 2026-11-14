import test from "node:test";
import { readAsset, runSwiftHarness, swiftFunction } from "./swift-harness.ts";

test("focus verification processes pending activation updates instead of timing out after a successful switch", () => {
  runSwiftHarness(`
import Foundation
typealias CGWindowID = UInt32
func isFocusedWindow(pid: Int32, windowId: CGWindowID) -> Bool { false }
${swiftFunction(readAsset("window-focus.swift"), "verifyFocusedWindow")}
var observedFocus = false
RunLoop.current.perform { observedFocus = true }
try verifyFocusedWindow(pid: 20, windowId: 10, timeout: 0.15,
  isFocused: { _, _ in observedFocus })
precondition(observedFocus, "A successful activation must be observed while waiting")
`);
});

test("focus verification requires the frontmost process, exact window, and a restored window", () => {
  const source = readAsset("window-focus.swift");
  runSwiftHarness(`
import Foundation
typealias CGWindowID = UInt32
typealias AXUIElement = Int
let kAXFocusedWindowAttribute = "focused"
let kAXMinimizedAttribute = "minimized"
struct Application { var processIdentifier: Int32 }
class NSWorkspace {
  static let shared = NSWorkspace()
  var frontmostApplication: Application? = Application(processIdentifier: 20)
}
var focusedWindow: AXUIElement? = 10
var minimized = false
func AXUIElementCreateApplication(_ pid: Int32) -> AXUIElement { Int(pid) }
func AXUIElementSetMessagingTimeout(_ application: AXUIElement, _ timeout: Double) {}
func copyAttr(_ element: AXUIElement, _ attribute: String) -> Any? { focusedWindow }
func windowId(of element: AXUIElement) -> CGWindowID { CGWindowID(element) }
func boolAttr(_ element: AXUIElement, _ attribute: String) -> Bool { minimized }
${swiftFunction(source, "isFocusedWindow")}
${swiftFunction(source, "verifyFocusedWindow")}
precondition(isFocusedWindow(pid: 20, windowId: 10))
precondition(!isFocusedWindow(pid: 21, windowId: 10))
precondition(!isFocusedWindow(pid: 20, windowId: 11))
NSWorkspace.shared.frontmostApplication = nil
precondition(!isFocusedWindow(pid: 20, windowId: 10))
NSWorkspace.shared.frontmostApplication = Application(processIdentifier: 20)
focusedWindow = nil
precondition(!isFocusedWindow(pid: 20, windowId: 10))
focusedWindow = 10
minimized = true
precondition(!isFocusedWindow(pid: 20, windowId: 10))

var clock: TimeInterval = 0
var checks = 0
try verifyFocusedWindow(pid: 20, windowId: 10, timeout: 0.1,
  isFocused: { pid, windowId in
    precondition(pid == 20 && windowId == 10)
    checks += 1
    return checks == 3
  }, now: { clock }, pause: { clock += $0 })
precondition(checks == 3 && clock == 0.05, "Wait for asynchronous activation")

clock = 0
do {
  try verifyFocusedWindow(pid: 20, windowId: 10, timeout: 0.1,
    isFocused: { _, _ in false }, now: { clock }, pause: { clock += $0 })
  fatalError("Focus timeout must fail")
} catch {
  precondition(error.localizedDescription.contains("did not become focused"))
  precondition(clock >= 0.1 && clock < 0.13, "Focus verification must stop at its deadline")
}
`);
});
