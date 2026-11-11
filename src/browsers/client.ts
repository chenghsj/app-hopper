import type { BrowserConfig, BrowserWindow } from "./types";
import { focusChromiumTab, getChromiumSummary, getChromiumWindows } from "./chromium";
import { focusFirefoxTab, getFirefoxSummary, getFirefoxWindows } from "./firefox";
import { focusWebKitTab, getWebKitSummary, getWebKitWindows } from "./webkit";
import { queryWindows, type Window } from "../windows";

export async function getBrowserWindows(
  browser: BrowserConfig,
  preloadedNativeWindows?: Window[],
): Promise<BrowserWindow[]> {
  const nativeWindows = (preloadedNativeWindows ?? (await queryWindows().catch(() => []))).filter(
    (window) => window.app === browser.appName,
  );
  const windows =
    browser.engine === "firefox"
      ? await getFirefoxWindows(browser, nativeWindows)
      : browser.engine === "webkit"
        ? await getWebKitWindows(browser, nativeWindows)
        : await getChromiumWindows(browser, nativeWindows);

  // Match window state by native ID; bridge-only IDs receive only app-wide facts.
  const allHidden = nativeWindows.length > 0 && nativeWindows.every((window) => window.isHidden === true);
  const allMinimized = nativeWindows.length > 0 && nativeWindows.every((window) => window.isMinimized === true);
  return windows.map((window) => {
    const native = nativeWindows.find((candidate) => String(candidate.id) === window.id);
    return {
      ...window,
      space: window.space ?? (native?.space && native.space > 0 ? native.space : undefined),
      isHidden: native?.isHidden ?? (allHidden ? true : undefined),
      isMinimized: native?.isMinimized ?? (allMinimized ? true : undefined),
    };
  });
}

export async function getBrowserSummary(browser: BrowserConfig, nativeWindows?: Window[]) {
  if (browser.engine === "firefox") return getFirefoxSummary(browser, nativeWindows);
  if (browser.engine === "webkit") return getWebKitSummary(browser, nativeWindows);
  return getChromiumSummary(browser, nativeWindows);
}

export async function focusBrowserTab(
  browser: BrowserConfig,
  window: BrowserWindow,
  tab: BrowserWindow["tabs"][number],
) {
  if (browser.engine === "firefox") return focusFirefoxTab(window.id, tab.id, browser, tab.title);
  if (browser.engine === "webkit") return focusWebKitTab(browser, window.id, tab.id, tab.title);
  return focusChromiumTab(browser, window.id, tab.id, tab.title);
}
