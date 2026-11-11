import { Action, ActionPanel, Icon, Keyboard, List, Toast, closeMainWindow, showToast } from "@raycast/api";
import { useMemo } from "react";
import { BrowserTabsView, BrowserWindowsView, switchBrowserTab } from "./browser-windows";
import { AppWindowsView, AXWindowsView, RemoveWindow } from "./app-windows";
import { AppGroup, AXWindow, Window, raiseAXWindow, sameWindow } from "./windows";
import { activateApplication, focusNativeWindow } from "./window-focus";
import { useWindowSearch } from "./use-window-search";
import { getErrorMessage } from "./helpers/applescript";
import { remainingSearch, searchTerms } from "./helpers/search";
import { useListSearch } from "./helpers/use-list-search";
import { getAppBrowser, searchApplications, SearchResult } from "./search-results";
import { getSpaceLabel, getWindowAccessories } from "./helpers/window-presentation";
import { getBrowserTabProps } from "./helpers/browser-tab-presentation";
import { FirefoxIntegrationAction } from "./firefox-integration";
import { groupApplications } from "./app-groups";
import { useRuntimeEnvironment } from "./runtime-environment";
import { RuntimeSetupView } from "./runtime-setup";

export default function Command() {
  const { status: runtimeStatus, revalidate: checkSetup } = useRuntimeEnvironment();
  const {
    windows,
    applications = [],
    applicationOrder = [],
    setWindows,
    metadataByPid,
    browserCounts,
    browserTabs,
    axWindowsByPid,
    isLoading,
    refreshWindows,
  } = useWindowSearch(runtimeStatus.kind === "ready");
  const search = useListSearch();

  /** Remove stale native windows and reload the root list. */
  async function handleMissingWindow(target: Window, onRemoved?: RemoveWindow): Promise<void> {
    setWindows((current) => current.filter((window) => !sameWindow(window, target)));
    onRemoved?.(target.id);
    refreshWindows();

    await showToast({
      style: Toast.Style.Failure,
      title: "Window no longer exists",
      message: "The window list is being refreshed.",
    });
  }

  async function focusWindow(target: Window, onRemoved?: RemoveWindow): Promise<void> {
    try {
      const result = await focusNativeWindow(target);
      if (result === "missing") {
        await handleMissingWindow(target, onRemoved);
        return;
      }
      await closeMainWindow();
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to focus window", message: getErrorMessage(error) });
    }
  }

  async function focusAXWindow(target: AXWindow): Promise<void> {
    try {
      await raiseAXWindow(target);
      await closeMainWindow();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to focus window",
        message: getErrorMessage(error),
      });
      refreshWindows();
    }
  }

  async function activateExistingApp(app: AppGroup): Promise<void> {
    try {
      const result = await activateApplication(app);
      if (result === "missing") {
        if (app.windows[0]) await handleMissingWindow(app.windows[0]);
        else {
          refreshWindows();
          await showToast({ style: Toast.Style.Failure, title: "Application is no longer running" });
        }
      } else if (result === "multiple") {
        refreshWindows();
        await showToast({
          style: Toast.Style.Failure,
          title: "Multiple accessible windows found",
          message: "The list has changed. Refresh and choose a window.",
        });
      } else {
        await closeMainWindow();
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to open application window",
        message: getErrorMessage(error),
      });
    }
  }

  const apps = useMemo(
    () => groupApplications(windows, metadataByPid, applicationOrder, applications),
    [windows, metadataByPid, applicationOrder, applications],
  );

  const hasQuery = searchTerms(search.searchText).length > 0;
  const results = useMemo(
    () => (hasQuery ? searchApplications(apps, search.searchText, browserTabs, axWindowsByPid) : []),
    [apps, hasQuery, search.searchText, browserTabs, axWindowsByPid],
  );

  if (runtimeStatus.kind !== "ready") return <RuntimeSetupView status={runtimeStatus} onCheck={checkSetup} />;

  function getCarriedSearch(app: AppGroup): string {
    return remainingSearch(search.searchText, [app.name, ...app.windows.map((window) => window.app)]);
  }

  const refreshAction = (
    <Action
      title="Refresh List"
      icon={Icon.Repeat}
      shortcut={Keyboard.Shortcut.Common.Refresh}
      onAction={refreshWindows}
    />
  );

  function renderAppItem(app: AppGroup) {
    const browser = getAppBrowser(app);

    const allMissingAX = !browser && app.windows.every((window) => window["has-ax-reference"] === false);

    const appPids = app.pids;
    const axResolved = allMissingAX && appPids.every((pid) => Array.isArray(axWindowsByPid[pid]));

    const axWindows = allMissingAX ? appPids.flatMap((pid) => axWindowsByPid[pid] ?? []) : [];
    const browserCount = browser ? browserCounts[browser.id] : undefined;
    const needsApplicationUI =
      browserCount?.windows === 0 || (allMissingAX && (axResolved ? axWindows.length === 0 : app.windows.length === 0));

    const singleWindow = app.windows.length === 1 ? app.windows[0] : undefined;
    // Browser and AX results can reveal more windows than the native snapshot.
    let appSpace = singleWindow ? getSpaceLabel(singleWindow) : undefined;
    if (browser) {
      const resolvedWindows = browserTabs[browser.id];
      if (resolvedWindows) {
        appSpace = resolvedWindows.length === 1 ? getSpaceLabel(resolvedWindows[0]) : undefined;
      }
      if (browserCount && browserCount.windows !== 1) appSpace = undefined;
    } else if (allMissingAX) {
      appSpace = axResolved && axWindows.length === 1 ? getSpaceLabel(axWindows[0]) : undefined;
    }

    let subtitle = "";
    if (browser) {
      if (browserCount?.windows === 1 && browserCount.tabs !== undefined) {
        subtitle = `${browserCount.tabs} ${browserCount.tabs === 1 ? "tab" : "tabs"}`;
      } else if (browserCount && browserCount.windows > 1) {
        subtitle = `${browserCount.windows} windows`;
      } else if (!browserCount && app.windows.length > 1) {
        subtitle = `${app.windows.length} windows`;
      }
    } else if (allMissingAX) {
      if (axResolved && axWindows.length > 1) {
        subtitle = `${axWindows.length} windows`;
      }
    } else if (app.windows.length > 1) {
      subtitle = `${app.windows.length} windows`;
    }

    return (
      <List.Item
        key={app.id}
        id={app.id}
        icon={app.bundlePath ? { fileIcon: app.bundlePath } : Icon.AppWindow}
        title={app.name}
        subtitle={subtitle}
        accessories={appSpace ? [{ text: appSpace }] : undefined}
        actions={
          <ActionPanel>
            {needsApplicationUI ? (
              <Action title="Show Application" onAction={() => activateExistingApp(app)} />
            ) : browser ? (
              <Action.Push
                title="Show Browser Tabs and Windows"
                target={
                  <BrowserWindowsView
                    browser={browser}
                    initialNativeWindows={app.windows}
                    initialSearchText={getCarriedSearch(app)}
                  />
                }
              />
            ) : allMissingAX && axResolved && axWindows.length === 1 ? (
              <Action title="Focus Window" onAction={() => focusAXWindow(axWindows[0])} />
            ) : allMissingAX && axResolved && axWindows.length > 1 ? (
              <Action.Push
                title="Show Windows"
                target={
                  <AXWindowsView
                    app={app}
                    windows={axWindows}
                    onFocus={focusAXWindow}
                    onRefresh={refreshWindows}
                    initialSearchText={getCarriedSearch(app)}
                  />
                }
              />
            ) : allMissingAX ? (
              <Action
                title={needsApplicationUI ? "Show Application" : "Activate Application"}
                onAction={() => activateExistingApp(app)}
              />
            ) : singleWindow ? (
              <Action title="Activate Application" onAction={() => activateExistingApp(app)} />
            ) : (
              <Action.Push
                title="Show Windows"
                target={
                  <AppWindowsView
                    app={app}
                    onFocus={focusWindow}
                    onRefresh={refreshWindows}
                    initialSearchText={getCarriedSearch(app)}
                  />
                }
              />
            )}
            {refreshAction}
            {browser?.engine === "firefox" && (
              <FirefoxIntegrationAction browserId={browser.id === "zen" ? "zen" : "firefox"} />
            )}
          </ActionPanel>
        }
      />
    );
  }

  function renderResult(result: SearchResult) {
    if (result.kind === "app") return renderAppItem(result.app);
    const { app, window } = result;
    const browser = result.kind === "ax-window" ? undefined : result.browser;
    const browserWindow =
      result.kind === "tab" ? result.window : result.kind === "window" ? result.browserWindow : undefined;
    const presentation =
      result.kind === "tab"
        ? getBrowserTabProps(result.browser, result.window, result.tab)
        : {
            icon: app.bundlePath ? { fileIcon: app.bundlePath } : Icon.AppWindow,
            title: window.title || "Untitled Window",
            subtitle: app.name,
            accessories: getWindowAccessories(window),
          };
    return (
      <List.Item
        key={result.id}
        id={result.id}
        {...presentation}
        actions={
          <ActionPanel>
            {result.kind === "tab" ? (
              <Action
                title="Switch to Tab"
                onAction={() => switchBrowserTab(result.browser, result.window, result.tab)}
              />
            ) : result.kind === "ax-window" ? (
              <Action title="Focus Window" onAction={() => focusAXWindow(result.window)} />
            ) : (
              <Action title="Focus Window" onAction={() => focusWindow(result.window)} />
            )}
            {browser && browserWindow ? (
              <Action.Push
                title="Show Tabs"
                target={
                  <BrowserTabsView
                    browser={browser}
                    window={browserWindow}
                    initialSearchText={remainingSearch(search.searchText, [app.name, browserWindow.title])}
                  />
                }
              />
            ) : null}
            {browser ? (
              <Action.Push
                title="Show Browser Tabs and Windows"
                target={
                  <BrowserWindowsView
                    browser={browser}
                    initialNativeWindows={app.windows}
                    initialSearchText={getCarriedSearch(app)}
                  />
                }
              />
            ) : result.kind === "ax-window" ? (
              <Action.Push
                title="Show Windows"
                target={
                  <AXWindowsView
                    app={app}
                    windows={app.pids.flatMap((pid) => axWindowsByPid[pid] ?? [])}
                    onFocus={focusAXWindow}
                    onRefresh={refreshWindows}
                    initialSearchText={getCarriedSearch(app)}
                  />
                }
              />
            ) : (
              <Action.Push
                title="Show Windows"
                target={
                  <AppWindowsView
                    app={app}
                    onFocus={focusWindow}
                    onRefresh={refreshWindows}
                    initialSearchText={getCarriedSearch(app)}
                  />
                }
              />
            )}
            {refreshAction}
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      {...search}
      searchBarPlaceholder="Search apps, windows, tabs or URLs..."
    >
      {(hasQuery ? results.length : apps.length) === 0 ? (
        <List.EmptyView
          title={hasQuery ? "No Results" : "No Applications"}
          description="No matching applications, windows or tabs."
          actions={<ActionPanel>{refreshAction}</ActionPanel>}
        />
      ) : hasQuery ? (
        results.map(renderResult)
      ) : (
        apps.map(renderAppItem)
      )}
    </List>
  );
}
