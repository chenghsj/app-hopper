import Accessibility
import AppKit
import ApplicationServices
import Carbon
import Foundation

@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ element: AXUIElement, _ wid: UnsafeMutablePointer<CGWindowID>) -> AXError

@_silgen_name("_AXUIElementCreateWithRemoteToken")
func _AXUIElementCreateWithRemoteToken(_ data: CFData) -> Unmanaged<AXUIElement>?

struct NativeWindowInput: Decodable {
  let id: Int
  let pid: Int32
  let space: Int?
  let title: String?
  let documentUrl: String?
}

struct BrowserTabOutput: Encodable {
  let id: String
  let title: String
  let url: String
}

struct BrowserWindowOutput: Encodable {
  let id: String
  let title: String
  let tabs: [BrowserTabOutput]
  let space: Int?
}

struct AEWindowCandidate {
  let windowId: Int?
  let titles: [String]
  let urls: [String]
}

struct WindowAXInspection {
  var tabButtons: [AXUIElement] = []
  var webAreaUrl: String = ""
  var addressBarUrl: String = ""
}

func copyAttr(_ element: AXUIElement, _ attribute: String) -> Any? {
  var value: CFTypeRef?
  let error = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
  return error == .success ? value : nil
}

func stringAttr(_ element: AXUIElement, _ attribute: String) -> String {
  if let str = copyAttr(element, attribute) as? String {
    return str
  }
  return ""
}

func urlAttr(_ element: AXUIElement, _ attribute: String) -> String {
  guard let val = copyAttr(element, attribute) else { return "" }
  if let url = val as? URL {
    return url.absoluteString
  }
  if let str = val as? String {
    return str
  }
  return ""
}

func boolFromAny(_ value: Any) -> Bool {
  if let flag = value as? Bool {
    return flag
  }
  if let num = value as? NSNumber {
    return num.intValue != 0
  }
  return false
}

func boolAttr(_ element: AXUIElement, _ attribute: String) -> Bool {
  guard let val = copyAttr(element, attribute) else { return false }
  return boolFromAny(val)
}

func windowId(of element: AXUIElement) -> CGWindowID {
  var wid: CGWindowID = 0
  if _AXUIElementGetWindow(element, &wid) == .success {
    return wid
  }
  return 0
}

func findBrowserPIDs(appName: String, nativeWindows: [NativeWindowInput]) -> [Int32] {
  var seen = Set<Int32>()
  var result: [Int32] = []
  for win in nativeWindows where win.pid > 0 {
    if seen.insert(win.pid).inserted {
      result.append(win.pid)
    }
  }
  if !result.isEmpty {
    return result
  }
  for app in NSWorkspace.shared.runningApplications {
    let pid = app.processIdentifier
    guard pid > 0 else { continue }
    let localized = app.localizedName ?? ""
    let bundleName = app.bundleURL?.deletingPathExtension().lastPathComponent ?? ""
    if localized == appName || bundleName == appName {
      if seen.insert(pid).inserted {
        result.append(pid)
      }
    }
  }
  return result
}

func discoverAXWindows(
  pid: Int32,
  expectedWindowIds: Set<CGWindowID>,
  maxElementId: UInt64 = 500
) -> [CGWindowID: AXUIElement] {
  var found: [CGWindowID: AXUIElement] = [:]
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 0.4)

  if let wins = copyAttr(app, kAXWindowsAttribute) as? [AXUIElement] {
    for win in wins {
      let wid = windowId(of: win)
      guard wid > 0, found[wid] == nil else { continue }
      if stringAttr(win, kAXRoleAttribute) == "AXWindow" {
        found[wid] = win
      }
    }
  }

  if !expectedWindowIds.isEmpty && expectedWindowIds.isSubset(of: Set(found.keys)) {
    return found
  }

  for attr in [kAXMainWindowAttribute, kAXFocusedWindowAttribute] {
    if let rawWin = copyAttr(app, attr) {
      let win = rawWin as! AXUIElement
      let wid = windowId(of: win)
      guard wid > 0, found[wid] == nil else { continue }
      if stringAttr(win, kAXRoleAttribute) == "AXWindow" {
        found[wid] = win
      }
    }
  }

  if !expectedWindowIds.isEmpty && expectedWindowIds.isSubset(of: Set(found.keys)) {
    return found
  }

  var remoteToken = Data(count: 20)
  remoteToken.replaceSubrange(0..<4, with: withUnsafeBytes(of: pid) { Data($0) })
  remoteToken.replaceSubrange(4..<8, with: withUnsafeBytes(of: Int32(0)) { Data($0) })
  remoteToken.replaceSubrange(8..<12, with: withUnsafeBytes(of: Int32(0x636f636f)) { Data($0) })

  for elementId: UInt64 in 1...maxElementId {
    remoteToken.replaceSubrange(12..<20, with: withUnsafeBytes(of: elementId) { Data($0) })
    guard let element = _AXUIElementCreateWithRemoteToken(remoteToken as CFData)?.takeRetainedValue() else {
      continue
    }
    let wid = windowId(of: element)
    guard wid > 0, found[wid] == nil else { continue }
    if !expectedWindowIds.isEmpty && !expectedWindowIds.contains(wid) {
      continue
    }
    AXUIElementSetMessagingTimeout(element, 0.15)
    guard stringAttr(element, kAXRoleAttribute) == "AXWindow" else {
      continue
    }
    found[wid] = element
    if !expectedWindowIds.isEmpty && expectedWindowIds.isSubset(of: Set(found.keys)) {
      break
    }
  }

  return found
}

func roleAndSubrole(_ element: AXUIElement) -> (role: String, subrole: String) {
  let attrs: [CFString] = [kAXRoleAttribute as CFString, kAXSubroleAttribute as CFString]
  var valuesRef: CFArray?
  if AXUIElementCopyMultipleAttributeValues(element, attrs as CFArray, [], &valuesRef) == .success,
    let values = valuesRef as? [Any],
    values.count >= 2
  {
    let role = values[0] as? String ?? ""
    let subrole = values[1] as? String ?? ""
    if !role.isEmpty {
      return (role, subrole)
    }
  }
  return (stringAttr(element, kAXRoleAttribute), stringAttr(element, kAXSubroleAttribute))
}

func inspectWebKitWindow(_ window: AXUIElement, collectUrl: Bool = true) -> WindowAXInspection {
  var result = WindowAXInspection()
  var foundTabsFromAxis = false

  func walk(
    _ element: AXUIElement,
    depth: Int,
    insideTabGroup: Bool,
    insideToolbar: Bool,
    skipTabCollection: Bool
  ) {
    if depth > 12 {
      return
    }
    let (role, subrole) = roleAndSubrole(element)
    if role == "AXMenu" || role == "AXMenuBar" || role == "AXButton" || role == "AXStaticText" || role == "AXImage" {
      return
    }
    // Sidebar / start page / page content subtrees are very slow to enumerate and never contain tab buttons.
    if role == "AXOutline" || role == "AXList" || role == "AXTable" || role == "AXRow" || role == "AXCell" {
      return
    }
    if role == "AXScrollArea" && (insideTabGroup || depth > 0) {
      return
    }

    if role == "AXWebArea" {
      if collectUrl && result.webAreaUrl.isEmpty {
        let u = urlAttr(element, kAXURLAttribute)
        result.webAreaUrl = !u.isEmpty ? u : urlAttr(element, kAXDocumentAttribute)
      }
      return
    }

    if role == "AXTextField" {
      if collectUrl && result.addressBarUrl.isEmpty {
        let identifier = stringAttr(element, "AXIdentifier")
        if identifier == "WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD" || insideToolbar {
          result.addressBarUrl = stringAttr(element, kAXValueAttribute)
        }
      }
      return
    }

    if !skipTabCollection && (subrole == "AXTabButton" || (insideTabGroup && role == "AXRadioButton")) {
      result.tabButtons.append(element)
      return
    }

    let nowInTabGroup = insideTabGroup || role == "AXTabGroup"
    let nowInToolbar = insideToolbar || role == "AXToolbar"
    var skipChildrenTabs = skipTabCollection

    if !skipTabCollection && role == "AXTabGroup" && !foundTabsFromAxis {
      if let axTabs = copyAttr(element, "AXTabs") as? [AXUIElement], !axTabs.isEmpty {
        let filtered = axTabs.filter { tab in
          let (r, sr) = roleAndSubrole(tab)
          return sr == "AXTabButton" || r == "AXRadioButton" || r == "AXTab"
        }
        result.tabButtons.append(contentsOf: filtered.isEmpty ? axTabs : filtered)
        foundTabsFromAxis = true
        skipChildrenTabs = true
      }
    }

    if skipChildrenTabs && (!collectUrl || !result.webAreaUrl.isEmpty) {
      return
    }

    if let children = copyAttr(element, kAXChildrenAttribute) as? [AXUIElement] {
      for child in children {
        if skipChildrenTabs {
          let (childRole, _) = roleAndSubrole(child)
          if childRole != "AXGroup" && childRole != "AXScrollArea" && childRole != "AXSplitGroup"
            && childRole != "AXWebArea"
          {
            continue
          }
        }
        walk(
          child,
          depth: depth + 1,
          insideTabGroup: nowInTabGroup,
          insideToolbar: nowInToolbar,
          skipTabCollection: skipChildrenTabs
        )
      }
    }
  }

  walk(window, depth: 0, insideTabGroup: false, insideToolbar: false, skipTabCollection: false)
  return result
}

func decodeCustomContentUrl(_ rawData: Any?) -> String {
  guard let data = rawData as? Data,
    let items = try? NSKeyedUnarchiver.unarchivedObject(
      ofClasses: [NSArray.self, AXCustomContent.self, NSString.self, NSAttributedString.self],
      from: data
    ) as? [AXCustomContent]
  else {
    return ""
  }
  return items.first?.value ?? ""
}

func tabTitleFallback(of tab: AXUIElement) -> String {
  let desc = stringAttr(tab, kAXDescriptionAttribute)
  if !desc.isEmpty {
    return desc
  }
  if let children = copyAttr(tab, kAXChildrenAttribute) as? [AXUIElement] {
    for child in children where stringAttr(child, kAXRoleAttribute) == "AXStaticText" {
      let value = stringAttr(child, kAXValueAttribute)
      if !value.isEmpty {
        return value
      }
      let childTitle = stringAttr(child, kAXTitleAttribute)
      if !childTitle.isEmpty {
        return childTitle
      }
    }
  }
  return ""
}

func readTabInfo(_ tab: AXUIElement) -> (title: String, selected: Bool, customUrl: String) {
  let attrs: [CFString] = [
    kAXTitleAttribute as CFString,
    kAXSelectedAttribute as CFString,
    kAXValueAttribute as CFString,
    kAXURLAttribute as CFString,
    "AXCustomContent" as CFString,
  ]
  var valuesRef: CFArray?
  if AXUIElementCopyMultipleAttributeValues(tab, attrs as CFArray, [], &valuesRef) == .success,
    let values = valuesRef as? [Any],
    values.count >= 5
  {
    let rawTitle = values[0] as? String ?? ""
    let selected = boolFromAny(values[1]) || boolFromAny(values[2])
    let title = !rawTitle.isEmpty ? rawTitle : tabTitleFallback(of: tab)
    let axUrl = (values[3] as? URL)?.absoluteString ?? (values[3] as? String ?? "")
    let customUrl = !axUrl.isEmpty ? axUrl : decodeCustomContentUrl(values[4])
    return (title, selected, customUrl)
  }

  let rawTitle = stringAttr(tab, kAXTitleAttribute)
  let title = !rawTitle.isEmpty ? rawTitle : tabTitleFallback(of: tab)
  let selected = boolAttr(tab, kAXSelectedAttribute) || boolAttr(tab, kAXValueAttribute)
  let axUrl = urlAttr(tab, kAXURLAttribute)
  let customUrl = !axUrl.isEmpty ? axUrl : decodeCustomContentUrl(copyAttr(tab, "AXCustomContent"))
  return (title, selected, customUrl)
}

func fourCC(_ s: String) -> FourCharCode {
  var result: FourCharCode = 0
  for b in s.utf8 {
    result = (result << 8) | FourCharCode(b)
  }
  return result
}

func everyElement(want: FourCharCode, from container: NSAppleEventDescriptor) -> NSAppleEventDescriptor {
  let obj = NSAppleEventDescriptor.record()
  obj.setDescriptor(NSAppleEventDescriptor(typeCode: want), forKeyword: fourCC("want"))
  obj.setDescriptor(container, forKeyword: fourCC("from"))
  // Absolute-position selection uses formAbsolutePosition (indx), not typeAbsoluteOrdinal (abso).
  obj.setDescriptor(NSAppleEventDescriptor(enumCode: fourCC("indx")), forKeyword: fourCC("form"))
  var allCode = fourCC("all ")
  if let seld = NSAppleEventDescriptor(descriptorType: fourCC("abso"), bytes: &allCode, length: 4) {
    obj.setDescriptor(seld, forKeyword: fourCC("seld"))
  }
  return obj.coerce(toDescriptorType: fourCC("obj ")) ?? obj
}

func byIdElement(want: FourCharCode, id: Int32, from container: NSAppleEventDescriptor) -> NSAppleEventDescriptor {
  let obj = NSAppleEventDescriptor.record()
  obj.setDescriptor(NSAppleEventDescriptor(typeCode: want), forKeyword: fourCC("want"))
  obj.setDescriptor(container, forKeyword: fourCC("from"))
  obj.setDescriptor(NSAppleEventDescriptor(enumCode: fourCC("ID  ")), forKeyword: fourCC("form"))
  obj.setDescriptor(NSAppleEventDescriptor(int32: id), forKeyword: fourCC("seld"))
  return obj.coerce(toDescriptorType: fourCC("obj ")) ?? obj
}

func byIndexElement(want: FourCharCode, index: Int32, from container: NSAppleEventDescriptor) -> NSAppleEventDescriptor {
  let obj = NSAppleEventDescriptor.record()
  obj.setDescriptor(NSAppleEventDescriptor(typeCode: want), forKeyword: fourCC("want"))
  obj.setDescriptor(container, forKeyword: fourCC("from"))
  obj.setDescriptor(NSAppleEventDescriptor(enumCode: fourCC("indx")), forKeyword: fourCC("form"))
  obj.setDescriptor(NSAppleEventDescriptor(int32: index), forKeyword: fourCC("seld"))
  return obj.coerce(toDescriptorType: fourCC("obj ")) ?? obj
}

func propertySpec(prop: FourCharCode, from container: NSAppleEventDescriptor) -> NSAppleEventDescriptor {
  let obj = NSAppleEventDescriptor.record()
  obj.setDescriptor(NSAppleEventDescriptor(typeCode: fourCC("prop")), forKeyword: fourCC("want"))
  obj.setDescriptor(container, forKeyword: fourCC("from"))
  obj.setDescriptor(NSAppleEventDescriptor(enumCode: fourCC("prop")), forKeyword: fourCC("form"))
  obj.setDescriptor(NSAppleEventDescriptor(typeCode: prop), forKeyword: fourCC("seld"))
  return obj.coerce(toDescriptorType: fourCC("obj ")) ?? obj
}

func queryAppleEventWindowIds(pid: Int32) -> [Int]? {
  let target = NSAppleEventDescriptor(processIdentifier: pid)
  let event = NSAppleEventDescriptor(
    eventClass: fourCC("core"),
    eventID: fourCC("getd"),
    targetDescriptor: target,
    returnID: AEReturnID(kAutoGenerateReturnID),
    transactionID: AETransactionID(kAnyTransactionID)
  )
  let allWins = everyElement(want: fourCC("cwin"), from: NSAppleEventDescriptor.null())
  event.setParam(propertySpec(prop: fourCC("ID  "), from: allWins), forKeyword: fourCC("----"))

  guard let reply = try? event.sendEvent(options: [.waitForReply, .canInteract], timeout: 2),
    reply.paramDescriptor(forKeyword: fourCC("errn")) == nil,
    let direct = reply.paramDescriptor(forKeyword: fourCC("----"))
  else {
    return nil
  }

  let winCount = direct.numberOfItems
  if winCount == 0 {
    let single = Int(direct.int32Value)
    return single > 0 ? [single] : []
  }

  var ids: [Int] = []
  for i in 1...winCount {
    ids.append(Int(direct.atIndex(i)?.int32Value ?? 0))
  }
  return ids
}

func queryAppleEventNestedStrings(pid: Int32, tabClass: FourCharCode, prop: FourCharCode) -> [[String]]? {
  let target = NSAppleEventDescriptor(processIdentifier: pid)
  let event = NSAppleEventDescriptor(
    eventClass: fourCC("core"),
    eventID: fourCC("getd"),
    targetDescriptor: target,
    returnID: AEReturnID(kAutoGenerateReturnID),
    transactionID: AETransactionID(kAnyTransactionID)
  )
  let allWins = everyElement(want: fourCC("cwin"), from: NSAppleEventDescriptor.null())
  let allTabs = everyElement(want: tabClass, from: allWins)
  event.setParam(propertySpec(prop: prop, from: allTabs), forKeyword: fourCC("----"))

  guard let reply = try? event.sendEvent(options: [.waitForReply, .canInteract], timeout: 2),
    reply.paramDescriptor(forKeyword: fourCC("errn")) == nil,
    let direct = reply.paramDescriptor(forKeyword: fourCC("----"))
  else {
    return nil
  }

  var result: [[String]] = []
  let winCount = direct.numberOfItems
  guard winCount > 0 else { return result }

  for i in 1...winCount {
    guard let winList = direct.atIndex(i) else { continue }
    var row: [String] = []
    let tabCount = winList.numberOfItems
    if tabCount > 0 {
      for j in 1...tabCount {
        row.append(winList.atIndex(j)?.stringValue ?? "")
      }
    } else if let single = winList.stringValue {
      row.append(single)
    }
    result.append(row)
  }
  return result
}

/// Fallback when the hand-built AppleEvent fails: run the equivalent AppleScript in-process.
func fetchWindowsViaAppleScript(appName: String) -> [AEWindowCandidate]? {
  guard !appName.isEmpty, !appName.contains("\""), !appName.contains("\\") else { return nil }
  let source = """
    tell application "\(appName)"
      set theTitles to name of every tab of every window
      set theUrls to URL of every tab of every window
      set theIds to id of every window
      return {theTitles, theUrls, theIds}
    end tell
    """
  var errorInfo: NSDictionary?
  guard let script = NSAppleScript(source: source) else { return nil }
  let output = script.executeAndReturnError(&errorInfo)
  guard errorInfo == nil, output.numberOfItems == 3,
    let titleLists = output.atIndex(1), let urlLists = output.atIndex(2), let idList = output.atIndex(3),
    titleLists.numberOfItems == urlLists.numberOfItems
  else {
    return nil
  }

  func strings(_ list: NSAppleEventDescriptor) -> [String] {
    if list.numberOfItems == 0 { return list.stringValue.map { [$0] } ?? [] }
    return (1...list.numberOfItems).map { list.atIndex($0)?.stringValue ?? "" }
  }

  var candidates: [AEWindowCandidate] = []
  if titleLists.numberOfItems > 0 {
    for i in 1...titleLists.numberOfItems {
      guard let t = titleLists.atIndex(i), let u = urlLists.atIndex(i) else { continue }
      let titles = strings(t)
      let urls = strings(u)
      guard titles.count == urls.count else { continue }
      let rawId = idList.numberOfItems >= i ? Int(idList.atIndex(i)?.int32Value ?? 0) : 0
      candidates.append(AEWindowCandidate(windowId: rawId > 0 ? rawId : nil, titles: titles, urls: urls))
    }
  }
  return candidates
}

func fetchAppleEventWindowsByPid(pid: Int32, appName: String = "") -> [AEWindowCandidate]? {
  let windowIds = queryAppleEventWindowIds(pid: pid)
  let safariUrls = queryAppleEventNestedStrings(pid: pid, tabClass: fourCC("bTab"), prop: fourCC("pURL"))
  let safariTitles = queryAppleEventNestedStrings(pid: pid, tabClass: fourCC("bTab"), prop: fourCC("pnam"))

  let urlsByWin: [[String]]
  let titlesByWin: [[String]]

  if let u = safariUrls, let t = safariTitles, u.count == t.count {
    urlsByWin = u
    titlesByWin = t
  } else if let u = queryAppleEventNestedStrings(pid: pid, tabClass: fourCC("CrTb"), prop: fourCC("URL ")),
    let t = queryAppleEventNestedStrings(pid: pid, tabClass: fourCC("CrTb"), prop: fourCC("pnam")),
    u.count == t.count
  {
    urlsByWin = u
    titlesByWin = t
  } else {
    return fetchWindowsViaAppleScript(appName: appName)
  }

  var candidates: [AEWindowCandidate] = []
  for i in 0..<urlsByWin.count {
    let winId = (windowIds != nil && i < windowIds!.count && windowIds![i] > 0) ? windowIds![i] : nil
    candidates.append(AEWindowCandidate(windowId: winId, titles: titlesByWin[i], urls: urlsByWin[i]))
  }
  return candidates
}

// Snapshots may straddle a tab reorder. Only unique titles on both sides can pair a URL.
func matchedTabURL(title: String, axTitles: [String], aeTitles: [String], aeURLs: [String]) -> String {
  guard !title.isEmpty, axTitles.filter({ $0 == title }).count == 1 else { return "" }
  let matches = aeTitles.indices.filter { aeTitles[$0] == title }
  guard matches.count == 1, matches[0] < aeURLs.count else { return "" }
  return aeURLs[matches[0]]
}

func matchAECandidate(
  wid: CGWindowID,
  tabCount: Int,
  effectiveDocUrl: String,
  effectiveWinTitle: String,
  onlyWindowForPid: Bool = false,
  aeCandidates: inout [AEWindowCandidate]
) -> AEWindowCandidate? {
  guard !aeCandidates.isEmpty else { return nil }

  if let exactIdx = aeCandidates.firstIndex(where: { $0.windowId == Int(wid) }) {
    return aeCandidates.remove(at: exactIdx)
  }

  // A single window on both sides is unambiguous, even when the AX tab count differs
  // (for example when Safari shows tabs in the sidebar and AX exposes no tab buttons).
  if onlyWindowForPid && aeCandidates.count == 1 {
    return aeCandidates.remove(at: 0)
  }

  if tabCount > 0 {
    let sameCountIndices = aeCandidates.indices.filter { aeCandidates[$0].urls.count == tabCount }
    if sameCountIndices.count == 1 {
      return aeCandidates.remove(at: sameCountIndices[0])
    } else if !sameCountIndices.isEmpty {
      if let idx = sameCountIndices.first(where: { i in
        !effectiveDocUrl.isEmpty && aeCandidates[i].urls.contains(effectiveDocUrl)
      }) {
        return aeCandidates.remove(at: idx)
      }
      if let idx = sameCountIndices.first(where: { i in
        !effectiveWinTitle.isEmpty && aeCandidates[i].titles.contains(effectiveWinTitle)
      }) {
        return aeCandidates.remove(at: idx)
      }
    }
  }

  return nil
}

private let tabReferences = TabReferenceStore()

func buildWindowOutput(
  wid: CGWindowID,
  axWindow: AXUIElement?,
  fallbackTitle: String?,
  fallbackDocUrl: String?,
  space: Int?,
  onlyWindowForPid: Bool = false,
  aeCandidates: inout [AEWindowCandidate]
) -> BrowserWindowOutput? {
  let winIdStr = String(wid)
  guard let axWindow = axWindow else {
    if let matchedAE = matchAECandidate(
      wid: wid,
      tabCount: 0,
      effectiveDocUrl: fallbackDocUrl ?? "",
      effectiveWinTitle: fallbackTitle ?? "",
      onlyWindowForPid: onlyWindowForPid,
      aeCandidates: &aeCandidates
    ), !matchedAE.titles.isEmpty {
      let tabs = matchedAE.titles.enumerated().map { (idx, title) in
        let url = idx < matchedAE.urls.count ? matchedAE.urls[idx] : ""
        return BrowserTabOutput(id: "\(winIdStr):\(idx)", title: title, url: url)
      }
      let title = fallbackTitle ?? tabs.first?.title ?? ""
      return BrowserWindowOutput(id: winIdStr, title: title, tabs: tabs, space: space)
    }
    guard let fallbackTitle = fallbackTitle, !fallbackTitle.isEmpty else {
      return nil
    }
    return BrowserWindowOutput(
      id: winIdStr,
      title: fallbackTitle,
      tabs: [BrowserTabOutput(id: "\(winIdStr):0", title: fallbackTitle, url: fallbackDocUrl ?? "")],
      space: space
    )
  }

  let inspection = inspectWebKitWindow(axWindow, collectUrl: true)
  let tabButtons = inspection.tabButtons

  let axWinTitle = stringAttr(axWindow, kAXTitleAttribute)
  let effectiveWinTitle = !axWinTitle.isEmpty ? axWinTitle : (fallbackTitle ?? "")
  let axDocUrl = urlAttr(axWindow, kAXDocumentAttribute)
  let fallbackActiveUrl =
    !axDocUrl.isEmpty
    ? axDocUrl
    : (!inspection.webAreaUrl.isEmpty
      ? inspection.webAreaUrl
      : (!(fallbackDocUrl ?? "").isEmpty ? (fallbackDocUrl ?? "") : inspection.addressBarUrl))

  if tabButtons.isEmpty {
    let subrole = stringAttr(axWindow, kAXSubroleAttribute)
    // A dialog without tab controls must match an actual browser window, not a preferences panel.
    if ["AXDialog", "AXSystemDialog"].contains(subrole)
      && !aeCandidates.contains(where: { $0.windowId == Int(wid) })
    {
      return nil
    }
    if subrole != "AXStandardWindow" && fallbackTitle == nil {
      return nil
    }
    if let matchedAE = matchAECandidate(
      wid: wid,
      tabCount: 1,
      effectiveDocUrl: fallbackActiveUrl,
      effectiveWinTitle: effectiveWinTitle,
      onlyWindowForPid: onlyWindowForPid,
      aeCandidates: &aeCandidates
    ), !matchedAE.titles.isEmpty {
      let tabs = matchedAE.titles.enumerated().map { (idx, title) in
        let url = idx < matchedAE.urls.count ? matchedAE.urls[idx] : ""
        return BrowserTabOutput(
          id: "\(winIdStr):\(idx)",
          title: !title.isEmpty ? title : effectiveWinTitle,
          url: !url.isEmpty ? url : (idx == 0 ? fallbackActiveUrl : "")
        )
      }
      let finalTitle = !effectiveWinTitle.isEmpty ? effectiveWinTitle : (tabs.first?.title ?? "")
      return BrowserWindowOutput(id: winIdStr, title: finalTitle, tabs: tabs, space: space)
    }
    return BrowserWindowOutput(
      id: winIdStr,
      title: effectiveWinTitle,
      tabs: [BrowserTabOutput(id: "\(winIdStr):0", title: effectiveWinTitle, url: fallbackActiveUrl)],
      space: space
    )
  }

  let tabInfos = tabButtons.map { readTabInfo($0) }
  let matchedAE = matchAECandidate(
    wid: wid,
    tabCount: tabInfos.count,
    effectiveDocUrl: fallbackActiveUrl,
    effectiveWinTitle: effectiveWinTitle,
    onlyWindowForPid: onlyWindowForPid,
    aeCandidates: &aeCandidates
  )
  let axTitles = tabInfos.map { $0.title }

  var tabs: [BrowserTabOutput] = []
  var activeTitle = ""

  for (index, info) in tabInfos.enumerated() {
    if info.selected && !info.title.isEmpty {
      activeTitle = info.title
    }
    let aeUrl = matchedAE.map {
      matchedTabURL(title: info.title, axTitles: axTitles, aeTitles: $0.titles, aeURLs: $0.urls)
    } ?? ""
    let axUrl = !info.customUrl.isEmpty ? info.customUrl : (info.selected ? fallbackActiveUrl : "")
    let url = !axUrl.isEmpty ? axUrl : aeUrl
    tabs.append(
      BrowserTabOutput(
        id: tabReferences.register(windowId: wid, element: tabButtons[index], fallbackIndex: index),
        title: info.title,
        url: url
      )
    )
  }

  let finalTitle = !activeTitle.isEmpty ? activeTitle : effectiveWinTitle
  return BrowserWindowOutput(
    id: winIdStr,
    title: finalTitle,
    tabs: tabs,
    space: space
  )
}

func handleList(args: [String]) throws {
  guard AXIsProcessTrusted() else {
    throw NSError(
      domain: "WebKitAX",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "Accessibility permission is required to read WebKit tabs."]
    )
  }

  let appName = args.count > 0 ? args[0] : "Safari"
  let nativeJson = args.count > 1 ? args[1] : "[]"
  let nativeWindows = (try? JSONDecoder().decode([NativeWindowInput].self, from: Data(nativeJson.utf8))) ?? []

  let pids = findBrowserPIDs(appName: appName, nativeWindows: nativeWindows)
  if pids.isEmpty {
    print("[]")
    return
  }

  var axWindowsByWid: [CGWindowID: AXUIElement] = [:]
  var aeByPid: [Int32: [AEWindowCandidate]] = [:]

  for pid in pids {
    let expected = Set(nativeWindows.filter { $0.pid == pid && $0.id > 0 }.map { CGWindowID($0.id) })
    let discovered = discoverAXWindows(pid: pid, expectedWindowIds: expected)
    for (wid, axWin) in discovered {
      axWindowsByWid[wid] = axWin
    }
    if let aeWins = fetchAppleEventWindowsByPid(pid: pid, appName: appName) {
      aeByPid[pid] = aeWins
    }
  }

  var results: [BrowserWindowOutput] = []
  var handledWids = Set<CGWindowID>()

  for nWin in nativeWindows where nWin.id > 0 {
    let wid = CGWindowID(nWin.id)
    guard handledWids.insert(wid).inserted else { continue }
    let validSpace = (nWin.space ?? 0) > 0 ? nWin.space : nil
    var aeCandidates = aeByPid[nWin.pid] ?? []
    if let output = buildWindowOutput(
      wid: wid,
      axWindow: axWindowsByWid[wid],
      fallbackTitle: nWin.title,
      fallbackDocUrl: nWin.documentUrl,
      space: validSpace,
      onlyWindowForPid: nativeWindows.filter { $0.pid == nWin.pid }.count == 1,
      aeCandidates: &aeCandidates
    ) {
      results.append(output)
    }
    aeByPid[nWin.pid] = aeCandidates
  }

  if nativeWindows.isEmpty {
    var emptyCandidates = pids.first.flatMap { aeByPid[$0] } ?? []
    for (wid, axWin) in axWindowsByWid.sorted(by: { $0.key < $1.key }) {
      guard handledWids.insert(wid).inserted else { continue }
      if let output = buildWindowOutput(
        wid: wid,
        axWindow: axWin,
        fallbackTitle: nil,
        fallbackDocUrl: nil,
        space: nil,
        aeCandidates: &emptyCandidates
      ) {
        results.append(output)
      }
    }
  }

  let encoded = try JSONEncoder().encode(results)
  print(String(data: encoded, encoding: .utf8) ?? "[]")
}

func selectTabViaAppleEvent(pid: Int32, wid: CGWindowID, tabIndex: Int) -> Bool {
  let target = NSAppleEventDescriptor(processIdentifier: pid)
  let event = NSAppleEventDescriptor(
    eventClass: fourCC("core"),
    eventID: fourCC("setd"),
    targetDescriptor: target,
    returnID: AEReturnID(kAutoGenerateReturnID),
    transactionID: AETransactionID(kAnyTransactionID)
  )
  let winSpec = byIdElement(want: fourCC("cwin"), id: Int32(wid), from: NSAppleEventDescriptor.null())
  let currentTabProp = propertySpec(prop: fourCC("cTab"), from: winSpec)
  let tabSpec = byIndexElement(want: fourCC("bTab"), index: Int32(tabIndex + 1), from: winSpec)
  event.setParam(currentTabProp, forKeyword: fourCC("----"))
  event.setParam(tabSpec, forKeyword: fourCC("data"))

  guard let reply = try? event.sendEvent(options: [.waitForReply, .canInteract], timeout: 2),
    reply.paramDescriptor(forKeyword: fourCC("errn")) == nil
  else {
    return false
  }
  return true
}

func focusTabViaAppleEvent(pid: Int32, windowId: CGWindowID, appName: String, expectedTitle: String) throws {
  // Apple Event window IDs must match exactly; title/count guesses are unsafe here.
  let candidates = fetchAppleEventWindowsByPid(pid: pid, appName: appName) ?? []
  let matches = candidates.filter { $0.windowId == Int(windowId) }
  guard matches.count == 1,
    let resolvedIndex = uniqueTabTitleIndex(titles: matches[0].titles, expectedTitle: expectedTitle)
  else {
    throw NSError(domain: "WebKitAX", code: 6,
      userInfo: [NSLocalizedDescriptionKey: "Tab changed or list expired. Refresh the list."])
  }
  guard selectTabViaAppleEvent(pid: pid, wid: windowId, tabIndex: resolvedIndex) else {
    throw NSError(domain: "WebKitAX", code: 7,
      userInfo: [NSLocalizedDescriptionKey: "Failed to activate WebKit tab."])
  }
}

func handleFocus(args: [String]) throws {
  guard AXIsProcessTrusted() else {
    throw NSError(
      domain: "WebKitAX",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "Accessibility permission is required to switch WebKit tabs."]
    )
  }
  guard args.count >= 4 else {
    throw NSError(
      domain: "WebKitAX",
      code: 2,
      userInfo: [NSLocalizedDescriptionKey: "Missing arguments for focus command."]
    )
  }

  let appName = args[0]
  let windowIdStr = args[1]
  let tabIdStr = args[2]
  guard TabReferenceStore.isRetainedID(tabIdStr) || parseTabIndex(tabIdStr) != nil else {
    throw NSError(domain: "WebKitAX", code: 3,
      userInfo: [NSLocalizedDescriptionKey: "Invalid tab ID."])
  }
  let expectedTitle = args[3]
  let explicitPid = args.count > 4 ? Int32(args[4]) : nil

  guard let rawWid = UInt32(windowIdStr), rawWid > 0 else {
    throw NSError(domain: "WebKitAX", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid WebKit window ID."])
  }
  let targetWid = CGWindowID(rawWid)

  let pids: [Int32]
  if let pid = explicitPid, pid > 0 {
    pids = [pid]
  } else {
    pids = findBrowserPIDs(appName: appName, nativeWindows: [])
  }

  guard !pids.isEmpty else {
    throw NSError(domain: "WebKitAX", code: 4, userInfo: [NSLocalizedDescriptionKey: "Browser is not running"])
  }

  var foundWindow: AXUIElement?
  var ownerPid: Int32 = pids[0]

  for pid in pids {
    let discovered = discoverAXWindows(pid: pid, expectedWindowIds: [targetWid], maxElementId: 2000)
    if let win = discovered[targetWid] {
      foundWindow = win
      ownerPid = pid
      break
    }
  }

  guard let targetWindow = foundWindow else {
    throw NSError(domain: "WebKitAX", code: 5, userInfo: [NSLocalizedDescriptionKey: "Browser window no longer exists"])
  }

  let inspection = inspectWebKitWindow(targetWindow, collectUrl: false)
  let tabButtons = inspection.tabButtons

  if !tabButtons.isEmpty {
    guard let resolvedIndex = tabReferences.resolve(
      tabId: tabIdStr, windowId: targetWid, tabs: tabButtons,
      expectedTitle: expectedTitle, title: { readTabInfo($0).title }
    ) else {
      throw NSError(
        domain: "WebKitAX", code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Tab changed or list expired. Refresh the list."]
      )
    }

    let targetTab = tabButtons[resolvedIndex]
    let pressError = AXUIElementPerformAction(targetTab, kAXPressAction as CFString)
    if pressError != .success {
      if TabReferenceStore.isRetainedID(tabIdStr) || !selectTabViaAppleEvent(pid: ownerPid, wid: targetWid, tabIndex: resolvedIndex) {
        throw NSError(
          domain: "WebKitAX",
          code: 7,
          userInfo: [NSLocalizedDescriptionKey: "Failed to activate WebKit tab (AX error \(pressError.rawValue))."]
        )
      }
    }
  } else {
    guard !TabReferenceStore.isRetainedID(tabIdStr) else {
      throw NSError(domain: "WebKitAX", code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Tab changed or list expired. Refresh the list."])
    }
    try focusTabViaAppleEvent(pid: ownerPid, windowId: targetWid, appName: appName, expectedTitle: expectedTitle)
  }

  if boolAttr(targetWindow, kAXMinimizedAttribute) {
    _ = AXUIElementSetAttributeValue(targetWindow, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
  }

  _ = AXUIElementPerformAction(targetWindow, kAXRaiseAction as CFString)
  _ = AXUIElementSetAttributeValue(targetWindow, kAXMainAttribute as CFString, kCFBooleanTrue)
  NSRunningApplication(processIdentifier: ownerPid)?.unhide()
  if #available(macOS 14.0, *) {
    NSRunningApplication(processIdentifier: ownerPid)?.activate()
  } else {
    NSRunningApplication(processIdentifier: ownerPid)?.activate(options: [.activateIgnoringOtherApps])
  }
  print("ok")
}

@main
enum WebKitAXHelper {
  static func main() {
    BrowserHelperRuntime.run(list: handleList, focus: handleFocus)
  }
}
