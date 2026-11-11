import { homedir } from "node:os";
import path from "node:path";
import type { BrowserConfig, BrowserWindow } from "./types";
import { runBrowserHelper } from "../helpers/browser-helper";
import { assertNativeTabTarget } from "../helpers/browser-tab-id";
import { sortWindows } from "../helpers/window-utils";
import { queryWindows, Window } from "../windows";

const DIRECTORY = path.join(homedir(), "Library/Application Support/raycast-app-hopper");

export interface BrowserSummary {
  windows: number;
  tabs?: number;
}

function parseAXWindows(raw: string): BrowserWindow[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("Invalid Chromium window list");
  return value.map((window) => {
    if (!window || typeof window !== "object" || typeof window.id !== "string" || !Array.isArray(window.tabs)) {
      throw new Error("Invalid Chromium window");
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
          throw new Error("Invalid Chromium tab");
        }
        return { id: tab.id, title: tab.title, url: tab.url };
      }),
    };
  });
}

function filterChromiumNativeWindows(windows: Window[], appName: string): Window[] {
  const matching = windows.filter(
    (win) =>
      win &&
      win.app === appName &&
      Number.isSafeInteger(win.id) &&
      win.id > 0 &&
      (!win.subrole || win.subrole === "AXStandardWindow"),
  );
  return sortWindows(matching);
}

async function getChromiumNativeWindows(appName: string): Promise<Window[]> {
  try {
    const allWindows = await queryWindows();
    return filterChromiumNativeWindows(allWindows, appName);
  } catch {
    return [];
  }
}

/**
 * Retrieves all windows and tabs from a Chromium-based browser via the native Swift helper.
 */
export async function getChromiumWindows(
  browser: BrowserConfig,
  preloadedNativeWindows?: Window[],
): Promise<BrowserWindow[]> {
  const appName = browser.appName;
  const nativeWindows = preloadedNativeWindows
    ? filterChromiumNativeWindows(preloadedNativeWindows, appName)
    : await getChromiumNativeWindows(appName);
  const payload = JSON.stringify(
    nativeWindows.map((win) => ({
      id: win.id,
      pid: win.pid,
      space: win.space,
      title: win.title,
      documentUrl: win.documentUrl,
    })),
  );
  const stdout = await runBrowserHelper("chromium-ax.swift", "chromium-ax", DIRECTORY, ["list", appName, payload]);
  return parseAXWindows(stdout);
}

/**
 * Activates a specific tab in a Chromium browser window via the native Swift helper.
 */
export async function focusChromiumTab(
  browser: BrowserConfig,
  windowId: string,
  tabId: string,
  expectedTitle = "",
): Promise<void> {
  assertNativeTabTarget(windowId, tabId, "Chromium");

  const appName = browser.appName;
  const nativeWindows = await getChromiumNativeWindows(appName);
  const matched = nativeWindows.find((win) => String(win.id) === windowId);
  const args = ["focus", appName, windowId, tabId, expectedTitle];
  if (matched && Number.isSafeInteger(matched.pid) && matched.pid > 0) {
    args.push(String(matched.pid));
  }

  await runBrowserHelper("chromium-ax.swift", "chromium-ax", DIRECTORY, args);
}

/** Count windows and (for a single window) tabs via the native Swift helper. */
export async function getChromiumSummary(
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

  const windows = await getChromiumWindows(browser, preloadedNativeWindows);
  return {
    windows: windows.length,
    tabs: windows.length === 1 ? windows[0].tabs.length : undefined,
  };
}
