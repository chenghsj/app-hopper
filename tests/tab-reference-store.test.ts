import test from "node:test";
import { assetPath, fixturePath, runSwiftHarness } from "./swift-harness.ts";

test("registering thousands of tabs uses an identity index instead of comparing every existing reference", () => {
  runSwiftHarness(
    `
    import Foundation
    let store = TabReferenceStore()
    let tabs = (0..<2000).map { Element($0) }
    let ids = tabs.enumerated().map { store.register(windowId: 10, element: $0.element, fallbackIndex: $0.offset) }
    precondition(Set(ids).count == tabs.count)
    precondition(comparisons < 20000, "New tabs must not perform quadratic identity comparisons")
    for (index, tab) in tabs.enumerated() {
      precondition(store.register(windowId: 10, element: tab, fallbackIndex: index) == ids[index])
    }
    precondition(comparisons < 40000, "Existing tabs must also use the identity index")
  `,
    [assetPath("browser-tab-references.swift"), fixturePath("tab-reference-store.swift")],
  );
});

test("reference indexing distinguishes hash collisions, application launches, windows and retired references", () => {
  runSwiftHarness(
    `
    import Foundation
    let store = TabReferenceStore()
    let first = Element(1, collision: true), second = Element(2, collision: true)
    let firstID = store.register(windowId: 10, element: first, fallbackIndex: 0)
    let secondID = store.register(windowId: 10, element: second, fallbackIndex: 1)
    precondition(firstID != secondID, "Equal hashes do not identify the same tab")
    precondition(store.register(windowId: 10, element: Element(1, collision: true), fallbackIndex: 9) == firstID,
      "Equivalent AX objects keep the same reference even if represented by another wrapper")
    precondition(store.register(windowId: 11, element: first, fallbackIndex: 0) != firstID)
    launchDate = Date(timeIntervalSince1970: 2)
    precondition(store.register(windowId: 10, element: first, fallbackIndex: 0) != firstID)
    precondition(store.resolve(tabId: firstID, windowId: 10, tabs: [first], expectedTitle: "", title: { _ in "" }) == nil)

    let capacity = TabReferenceStore()
    let original = Element(100)
    let originalID = capacity.register(windowId: 10, element: original, fallbackIndex: 0)
    for index in 1...8192 { _ = capacity.register(windowId: 10, element: Element(100 + index), fallbackIndex: index) }
    let renewedID = capacity.register(windowId: 10, element: original, fallbackIndex: 0)
    precondition(renewedID != originalID, "Eviction must clear both the reference and its identity index")
    precondition(capacity.resolve(tabId: originalID, windowId: 10, tabs: [original], expectedTitle: "", title: { _ in "" }) == nil)
    precondition(capacity.resolve(tabId: renewedID, windowId: 10, tabs: [original], expectedTitle: "", title: { _ in "" }) == 0)
  `,
    [assetPath("browser-tab-references.swift"), fixturePath("tab-reference-store.swift")],
  );
});
