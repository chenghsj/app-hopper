import { getBrowserByAppName } from "./browsers/registry";
import type { BrowserConfig, BrowserWindow, BrowserTab } from "./browsers/types";
import type { AppGroup, Window, AXWindow } from "./windows";
import { matchesAnySearchTerm, remainingSearch, searchScore, SEARCH_WEIGHT as W } from "./helpers/search";

type ResultContext = { id: string; app: AppGroup; score: number };
export type SearchResult = ResultContext &
  (
    | { kind: "app" }
    | { kind: "window"; window: Window; browser?: BrowserConfig; browserWindow?: BrowserWindow }
    | { kind: "ax-window"; window: AXWindow }
    | { kind: "tab"; browser: BrowserConfig; window: BrowserWindow; tab: BrowserTab }
  );
export type BrowserSearchResult = { score: number; window: BrowserWindow } & (
  { kind: "window" } | { kind: "tab"; tab: BrowserTab }
);

export function getAppBrowser(app: AppGroup): BrowserConfig | undefined {
  return app.windows
    .map((window) => getBrowserByAppName(window.app, app.bundlePath || window.bundlePath))
    .find(Boolean);
}

export function tabSearchFields(tab: BrowserTab, appName: string, windowTitle: string) {
  return [
    { value: tab.title, weight: W.title },
    { value: tab.url, weight: W.url },
    { value: appName, weight: W.context },
    { value: windowTitle, weight: W.context },
  ];
}

function matchingTabs(window: BrowserWindow, appName: string, query: string) {
  const contentQuery = remainingSearch(query, [appName]) || query;
  return window.tabs.flatMap((tab) => {
    if (!matchesAnySearchTerm(contentQuery, [tab.title, tab.url])) return [];
    const score = searchScore(query, tabSearchFields(tab, appName, window.title));
    return score === null ? [] : [{ tab, score }];
  });
}

/** Search apps and concrete content targets together; field weights determine their ranking. */
export function searchApplications(
  apps: AppGroup[],
  query: string,
  browserTabs: Record<string, BrowserWindow[]>,
  axWindowsByPid: Record<number, AXWindow[] | null>,
): SearchResult[] {
  const appResults: SearchResult[] = [];
  for (const app of apps) {
    const appScore = searchScore(query, [
      { value: app.name, weight: W.app },
      ...app.windows.map((window) => ({ value: window.app, weight: W.app })),
    ]);
    if (appScore !== null) appResults.push({ kind: "app", id: app.id, app, score: appScore });
  }

  // Content results expose concrete targets; equal scores retain the incoming MRU order.
  const results: SearchResult[] = [...appResults];
  for (const app of apps) {
    const browser = getAppBrowser(app);
    const cachedWindows = browser ? (browserTabs[browser.id] ?? []) : [];
    let hasTabMatches = false;
    if (browser) {
      for (const window of cachedWindows) {
        for (const { tab, score } of matchingTabs(window, app.name, query)) {
          hasTabMatches = true;
          results.push({
            kind: "tab",
            id: `tab:${browser.id}:${window.id}:${tab.id}`,
            app,
            browser,
            window,
            tab,
            score,
          });
        }
      }
    }

    // Prefer direct tab targets over browser window summaries, including opaque bridge window IDs.
    const nativeWindows = browser && hasTabMatches ? [] : app.windows;
    for (const window of nativeWindows) {
      if (window["has-ax-reference"] === false) continue;
      if (!matchesAnySearchTerm(query, [window.title])) continue;
      const score = searchScore(query, [
        { value: window.title, weight: W.title },
        { value: app.name, weight: W.context },
      ]);
      if (score === null) continue;
      results.push({
        kind: "window",
        id: `window:${window.pid}:${window.id}`,
        app,
        window,
        browser,
        browserWindow: cachedWindows.find((candidate) => candidate.id === String(window.id)),
        score,
      });
    }
    for (const pid of app.pids) {
      if (app.windows.some((window) => window.pid === pid && window["has-ax-reference"] !== false)) continue;
      for (const window of axWindowsByPid[pid] ?? []) {
        if (!matchesAnySearchTerm(query, [window.title])) continue;
        const score = searchScore(query, [
          { value: window.title, weight: W.title },
          { value: app.name, weight: W.context },
        ]);
        if (score !== null) results.push({ kind: "ax-window", id: `ax:${pid}:${window.index}`, app, window, score });
      }
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Window-title matches stay navigable even when none of their tab titles match. */
export function searchBrowserWindows(windows: BrowserWindow[], appName: string, query: string): BrowserSearchResult[] {
  const results: BrowserSearchResult[] = [];
  for (const window of windows) {
    const tabs = matchingTabs(window, appName, query);
    if (tabs.length > 0) {
      results.push(...tabs.map(({ tab, score }) => ({ kind: "tab" as const, window, tab, score })));
      continue;
    }
    if (!matchesAnySearchTerm(query, [window.title])) continue;
    const score = searchScore(query, [
      { value: window.title, weight: W.title },
      { value: appName, weight: W.context },
    ]);
    if (score !== null) results.push({ kind: "window", window, score });
  }
  return results.sort((a, b) => b.score - a.score);
}
