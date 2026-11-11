import { Action, ActionPanel, Icon, Keyboard, List, Toast, closeMainWindow, showToast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import type { BrowserConfig, BrowserTab, BrowserWindow } from "./browsers/types";
import { getBrowserById } from "./browsers/registry";
import { getBrowserWindows, focusBrowserTab } from "./browsers/client";
import type { Window } from "./windows";
import { FirefoxIntegrationAction } from "./firefox-integration";
import { getWindowAccessories } from "./helpers/window-presentation";
import { getBrowserTabProps } from "./helpers/browser-tab-presentation";
import { rankSearch, remainingSearch, searchTerms } from "./helpers/search";
import { useListSearch } from "./helpers/use-list-search";
import { searchBrowserWindows, tabSearchFields } from "./search-results";

function unavailableTabsMessage(browser: BrowserConfig): string {
  return browser.id === "zen"
    ? "Set up Zen Integration to read tabs with the sidebar hidden, or show the sidebar in Zen and refresh."
    : "Show the browser's tab bar, then refresh this list.";
}

const preloadedNativeWindowsBySnapshot = new Map<string, Window[]>();

/**
 * Retrieves browser windows and attaches their current
 * macOS Space information using live native window metadata.
 */
async function loadBrowserWindows(browserId: string, snapshotKey: string): Promise<BrowserWindow[]> {
  const browser = getBrowserById(browserId);

  if (!browser) {
    throw new Error(`Unsupported browser: ${browserId}`);
  }

  const preloaded = preloadedNativeWindowsBySnapshot.get(snapshotKey);
  preloadedNativeWindowsBySnapshot.delete(snapshotKey);
  return getBrowserWindows(browser, preloaded);
}

async function loadBrowserWindow(browserId: string, windowId: string): Promise<BrowserWindow | null> {
  const browser = getBrowserById(browserId);
  if (!browser) throw new Error(`Unsupported browser: ${browserId}`);
  const windows = await getBrowserWindows(browser);
  return windows.find((window) => window.id === windowId) ?? null;
}

/**
 * Activates a browser tab and closes the Raycast window.
 */
export async function switchBrowserTab(browser: BrowserConfig, window: BrowserWindow, tab: BrowserTab): Promise<void> {
  try {
    await focusBrowserTab(browser, window, tab);

    await closeMainWindow();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to switch tab",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Displays all tabs belonging to a specific browser window.
 * Used when the browser has multiple windows.
 */
export function BrowserTabsView({
  browser,
  window,
  initialSearchText = "",
}: {
  browser: BrowserConfig;
  window: BrowserWindow;
  initialSearchText?: string;
}) {
  const search = useListSearch(remainingSearch(initialSearchText, [browser.appName, window.title]));
  const {
    data: currentWindow = window,
    isLoading,
    error,
    revalidate,
  } = useCachedPromise(loadBrowserWindow, [browser.id, window.id], {
    initialData: window,
    keepPreviousData: false,
  });
  const tabs = rankSearch(currentWindow?.tabs ?? [], search.searchText, (tab) =>
    tabSearchFields(tab, browser.appName, currentWindow?.title ?? window.title),
  );
  const errorMessage = error ? (error instanceof Error ? error.message : String(error)) : "";

  function renderRefreshAction() {
    return (
      <Action
        title="Refresh List"
        icon={Icon.Repeat}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={revalidate}
      />
    );
  }

  return (
    <List
      navigationTitle={currentWindow?.title || window.title || "Browser Tabs"}
      isLoading={isLoading}
      filtering={false}
      {...search}
      searchBarPlaceholder="Search tab title or URL..."
    >
      {tabs.map((tab) => (
        <List.Item
          key={tab.id}
          id={tab.id}
          {...getBrowserTabProps(browser, currentWindow ?? window, tab)}
          actions={
            <ActionPanel>
              <Action
                title="Switch to Tab"
                onAction={() => {
                  if (currentWindow) return switchBrowserTab(browser, currentWindow, tab);
                }}
              />
              {renderRefreshAction()}
              {browser.engine === "firefox" && (
                <FirefoxIntegrationAction browserId={browser.id === "zen" ? "zen" : "firefox"} />
              )}
            </ActionPanel>
          }
        />
      ))}
      <List.EmptyView
        title={
          errorMessage
            ? "Failed to Load Tabs"
            : currentWindow?.tabListUnavailable
              ? "Tab List Unavailable"
              : currentWindow === null
                ? "Window Closed"
                : "No Tabs"
        }
        description={
          errorMessage ||
          (currentWindow?.tabListUnavailable
            ? unavailableTabsMessage(browser)
            : currentWindow === null
              ? "This browser window is no longer open."
              : "No tabs match your search in this window.")
        }
        actions={
          <ActionPanel>
            {renderRefreshAction()}
            {browser.engine === "firefox" && (
              <FirefoxIntegrationAction browserId={browser.id === "zen" ? "zen" : "firefox"} />
            )}
          </ActionPanel>
        }
      />
    </List>
  );
}

/**
 * Displays browser windows or tabs based on the
 * number of currently available windows.
 *
 * - 0 windows: Show an empty state.
 * - 1 window: Display tabs directly.
 * - 2+ windows: Display windows with nested tabs.
 */
export function BrowserWindowsView({
  browser,
  initialNativeWindows,
  initialSearchText = "",
}: {
  browser: BrowserConfig;
  initialNativeWindows?: Window[];
  initialSearchText?: string;
}) {
  const search = useListSearch(remainingSearch(initialSearchText, [browser.appName]));
  // A different window set/state must not briefly reuse an old single-window layout.
  const snapshotKey = JSON.stringify([
    browser.id,
    initialNativeWindows?.map(({ id, pid, space, isMinimized, isHidden }) => [id, pid, space, isMinimized, isHidden]),
  ]);
  useState(() => {
    if (initialNativeWindows) {
      preloadedNativeWindowsBySnapshot.set(snapshotKey, initialNativeWindows);
    }
  });

  const {
    data: windows = [],
    isLoading,
    error,
    revalidate,
  } = useCachedPromise(loadBrowserWindows, [browser.id, snapshotKey], {
    keepPreviousData: false,
  });

  const query = search.searchText;
  const hasQuery = searchTerms(query).length > 0;
  const singleWindow = windows.length === 1 ? windows[0] : undefined;
  const singleWindowTabs = singleWindow
    ? rankSearch(singleWindow.tabs, query, (tab) => tabSearchFields(tab, browser.appName, singleWindow.title))
    : [];
  const results = hasQuery && !singleWindow ? searchBrowserWindows(windows, browser.appName, query) : [];

  const errorMessage = error ? (error instanceof Error ? error.message : String(error)) : "";

  function renderRefreshAction() {
    return (
      <Action
        title="Refresh List"
        icon={Icon.Repeat}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={revalidate}
      />
    );
  }

  function tabsAction(window: BrowserWindow) {
    return (
      <Action.Push
        title="Show Tabs"
        target={
          <BrowserTabsView
            browser={browser}
            window={window}
            initialSearchText={remainingSearch(query, [browser.appName, window.title])}
          />
        }
      />
    );
  }

  function renderTab(window: BrowserWindow, tab: BrowserTab) {
    return (
      <List.Item
        key={`tab:${window.id}:${tab.id}`}
        id={`tab:${window.id}:${tab.id}`}
        {...getBrowserTabProps(browser, window, tab)}
        actions={
          <ActionPanel>
            <Action title="Switch to Tab" onAction={() => switchBrowserTab(browser, window, tab)} />
            {!singleWindow && tabsAction(window)}
            {renderRefreshAction()}
            {browser.engine === "firefox" && (
              <FirefoxIntegrationAction browserId={browser.id === "zen" ? "zen" : "firefox"} />
            )}
          </ActionPanel>
        }
      />
    );
  }

  function renderWindow(window: BrowserWindow) {
    return (
      <List.Item
        key={`window:${window.id}`}
        id={`window:${window.id}`}
        icon={browser.appPath ? { fileIcon: browser.appPath } : Icon.Globe}
        title={window.title || "Untitled Window"}
        subtitle={
          window.tabListUnavailable
            ? "Tab list unavailable"
            : `${window.tabs.length} ${window.tabs.length === 1 ? "tab" : "tabs"}`
        }
        accessories={getWindowAccessories(window)}
        actions={
          <ActionPanel>
            {tabsAction(window)}
            {renderRefreshAction()}
            {browser.engine === "firefox" && (
              <FirefoxIntegrationAction browserId={browser.id === "zen" ? "zen" : "firefox"} />
            )}
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      navigationTitle={browser.appName}
      {...search}
      searchBarPlaceholder={
        singleWindow ? "Search tabs or URLs..." : `Search ${browser.appName} windows, tabs or URLs...`
      }
      isLoading={isLoading && windows.length === 0}
      filtering={false}
    >
      {singleWindow
        ? singleWindowTabs.map((tab) => renderTab(singleWindow, tab))
        : hasQuery
          ? results.map((result) =>
              result.kind === "tab" ? renderTab(result.window, result.tab) : renderWindow(result.window),
            )
          : windows.map(renderWindow)}
      <List.EmptyView
        title={
          errorMessage
            ? "Failed to Load Browser Windows"
            : singleWindow?.tabListUnavailable
              ? "Tab List Unavailable"
              : hasQuery
                ? "No Results"
                : singleWindow
                  ? "No Tabs"
                  : "No Browser Windows"
        }
        description={
          errorMessage ||
          (singleWindow?.tabListUnavailable
            ? unavailableTabsMessage(browser)
            : hasQuery
              ? "No windows or tabs match your search."
              : singleWindow
                ? "No tabs found in this window."
                : "No open browser windows found.")
        }
        actions={
          <ActionPanel>
            {renderRefreshAction()}
            {browser.engine === "firefox" && (
              <FirefoxIntegrationAction browserId={browser.id === "zen" ? "zen" : "firefox"} />
            )}
          </ActionPanel>
        }
      />
    </List>
  );
}
