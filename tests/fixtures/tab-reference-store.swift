import Foundation
import CoreFoundation

typealias CGWindowID = UInt32
enum AXError { case success }
var comparisons = 0
var launchDate = Date(timeIntervalSince1970: 1)

final class Element: NSObject {
  let key: Int
  let collision: Bool
  init(_ key: Int, collision: Bool = false) { self.key = key; self.collision = collision }
  override var hash: Int { collision ? 1 : key }
  override func isEqual(_ object: Any?) -> Bool {
    comparisons += 1
    return (object as? Element)?.key == key
  }
}
typealias AXUIElement = Element
func AXUIElementGetPid(_ element: AXUIElement, _ pid: UnsafeMutablePointer<Int32>) -> AXError {
  pid.pointee = 20
  return .success
}
struct NSRunningApplication {
  let launchDate: Date?
  init?(processIdentifier: Int32) { self.launchDate = currentLaunchDate() }
}
func currentLaunchDate() -> Date { launchDate }
