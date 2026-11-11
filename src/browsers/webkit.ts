import { homedir } from "node:os";
import path from "node:path";
import type { BrowserSummary } from "./chromium";
import type { BrowserConfig, BrowserWindow } from "./types";
import { runBrowserHelper } from "../helpers/browser-helper";
import { assertNativeTabTarget } from "../helpers/browser-tab-id";
import { sortWindows } from "../helpers/window-utils";
import { queryWindows, Window } from "../windows";

const DIRECTORY = path.join(homedir(), "Library/Application Support/raycast-app-hopper");

function parseAXWindows(raw: string): BrowserWindow[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("Invalid WebKit window list");
  return value.map((window) => {
    if (!window || typeof window !== "object" || typeof window.id !== "string" || !Array.isArray(window.tabs)) {
      throw new Error("Invalid WebKit window");
    }
    const space =
      typeof window.space === "number" && Number.isSafeInteger(window.space) && window.space > 0
        ? window.space
        : undefined;
    return {
      id: window.id,
      title: typeof window.title === "string" ? window.title : "",
      space,
      tabs: window.tabs.map((tab: { id: string; title: string; url: string }) => {
        if (!tab || typeof tab.id !== "string" || typeof tab.title !== "string" || typeof tab.url !== "string") {
          throw new Error("Invalid WebKit tab");
        }
        return { id: tab.id, title: tab.title, url: tab.url };
      }),
    };
  });
}

function filterWebKitNativeWindows(windows: Window[], appName: string): Window[] {
  const matching = windows.filter(
    (win) =>
      win &&
      win.app === appName &&
      Number.isSafeInteger(win.id) &&
      win.id > 0 &&
      (!win.subrole || ["AXStandardWindow", "AXDialog", "AXSystemDialog"].includes(win.subrole)),
  );
  return sortWindows(matching);
}

async function getWebKitNativeWindows(appName: string): Promise<Window[]> {
  try {
    const allWindows = await queryWindows();
    return filterWebKitNativeWindows(allWindows, appName);
  } catch {
    return [];
  }
}

/**
 * Retrieves all windows and tabs from a WebKit-based browser via the native Swift helper.
 */
export async function getWebKitWindows(
  browser: BrowserConfig,
  preloadedNativeWindows?: Window[],
): Promise<BrowserWindow[]> {
  const appName = browser.appName;
  const nativeWindows = preloadedNativeWindows
    ? filterWebKitNativeWindows(preloadedNativeWindows, appName)
    : await getWebKitNativeWindows(appName);
  const payload = JSON.stringify(
    nativeWindows.map((win) => ({
      id: win.id,
      pid: win.pid,
      space: win.space,
      title: win.title,
      documentUrl: win.documentUrl,
    })),
  );
  const stdout = await runBrowserHelper("webkit-ax.swift", "webkit-ax", DIRECTORY, ["list", appName, payload]);
  return parseAXWindows(stdout);
}

/**
 * Activates a specific tab in a WebKit browser window via the native Swift helper.
 */
export async function focusWebKitTab(
  browser: BrowserConfig,
  windowId: string,
  tabId: string,
  expectedTitle = "",
): Promise<void> {
  assertNativeTabTarget(windowId, tabId, "WebKit");

  const appName = browser.appName;
  const nativeWindows = await getWebKitNativeWindows(appName);
  const matched = nativeWindows.find((win) => String(win.id) === windowId);
  const args = ["focus", appName, windowId, tabId, expectedTitle];
  if (matched && Number.isSafeInteger(matched.pid) && matched.pid > 0) {
    args.push(String(matched.pid));
  }

  await runBrowserHelper("webkit-ax.swift", "webkit-ax", DIRECTORY, args);
}

/** Count windows and (for a single window) tabs via the native Swift helper. */
export async function getWebKitSummary(
  browser: BrowserConfig,
  preloadedNativeWindows?: Window[],
): Promise<BrowserSummary> {
  // When multiple accessible windows are already known from the native snapshot,
  // the root view only displays the window count and does not need an extra helper call.
  if (
    preloadedNativeWindows &&
    preloadedNativeWindows.length > 1 &&
    preloadedNativeWindows.every((win) => win["has-ax-reference"] !== false)
  ) {
    return { windows: preloadedNativeWindows.length };
  }

  const windows = await getWebKitWindows(browser, preloadedNativeWindows);
  return {
    windows: windows.length,
    tabs: windows.length === 1 ? windows[0].tabs.length : undefined,
  };
}
