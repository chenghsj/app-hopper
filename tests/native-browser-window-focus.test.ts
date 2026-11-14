import test from "node:test";
import { readAsset, readFixture, runSwiftHarness } from "./swift-harness.ts";

// Compile the entire production module against a fake OS, including its real asynchronous verifier.
const focusModule = readAsset("window-focus.swift").replace(/^import (AppKit|ApplicationServices)\n/gm, "");

for (const mode of ["browser", "firefox", "application"]) {
  test(`${mode} restores and focuses the exact window after activation restores the previous key window`, () => {
    const options = mode === "firefox" ? ", unhide: false" : mode === "application" ? ", setFocused: true" : "";
    const expected = ["restore", ...(mode === "firefox" ? [] : ["unhide"]), "activate", "raise", "main"];
    if (mode === "application") expected.push("focused");
    runSwiftHarness(
      [
        readFixture("native-browser-window-focus.swift"),
        focusModule,
        `try focusWindow(targetWindow, pid: 20, windowId: 10${options})
        precondition(events == ${JSON.stringify(expected)})
        precondition(isFocusedWindow(pid: 20, windowId: 10), "Wait for the foreground process and exact target")
        precondition(!targetWindow.minimized, "Restore before activation")`,
      ].join("\n"),
    );
  });
}

test("the complete focus operation fails when raising leaves another window focused", () => {
  runSwiftHarness(
    [
      readFixture("native-browser-window-focus.swift"),
      focusModule,
      `raiseSucceeds = false
      do {
        try focusWindow(targetWindow, pid: 20, windowId: 10)
        fatalError("An activation request alone must not report success")
      } catch {
        precondition(error.localizedDescription.contains("did not become focused"))
      }
      precondition(focusedWindow?.id == 11)`,
    ].join("\n"),
  );
});
