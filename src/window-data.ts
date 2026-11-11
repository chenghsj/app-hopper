import { getBrowserByAppName } from "./browsers/registry";
import type { BrowserSummary } from "./browsers/chromium";
import type { BrowserWindow } from "./browsers/types";
import { getBrowserSummary, getBrowserWindows } from "./browsers/client";
import { getApplicationOrder } from "./helpers/app-order";
import {
  AXWindow,
  RunningAppMetadata,
  Window,
  getRunningApplicationMetadata,
  getRunningApplications,
  queryAXWindows,
  queryWindows,
} from "./windows";

export interface WindowSearchData {
  windows: Window[];
  applicationOrder: number[];
  applications: RunningAppMetadata[];
  metadataByPid: Record<number, RunningAppMetadata>;
  browserCounts: Record<string, BrowserSummary>;
  /** Cached browser windows and tabs, keyed by browser id, used by the root search. */
  browserTabs: Record<string, BrowserWindow[]>;
  axWindowsByPid: Record<number, AXWindow[] | null>;
}

export function emptyWindowData(): WindowSearchData {
  return {
    windows: [],
    applications: [],
    applicationOrder: [],
    metadataByPid: {},
    browserCounts: {},
    browserTabs: {},
    axWindowsByPid: {},
  };
}

interface WindowDataQueries {
  queryWindows: typeof queryWindows;
  getRunningApplicationMetadata: typeof getRunningApplicationMetadata;
  queryAXWindows: typeof queryAXWindows;
  getBrowserSummary: typeof getBrowserSummary;
  getBrowserWindows?: typeof getBrowserWindows;
  getApplicationOrder?: typeof getApplicationOrder;
  getRunningApplications?: typeof getRunningApplications;
}

const systemQueries: WindowDataQueries = {
  queryWindows,
  getRunningApplicationMetadata,
  queryAXWindows,
  getBrowserSummary,
  getBrowserWindows,
  getApplicationOrder,
  getRunningApplications,
};

/** Publish the native list first. Each optional query enriches it independently. */
export async function loadWindowData(
  publish: (data: WindowSearchData) => void,
  queries: WindowDataQueries = systemQueries,
): Promise<void> {
  const windows = await queries.queryWindows();

  const initialMetadata: Record<number, RunningAppMetadata> = {};
  const byPid = new Map<number, Window[]>();
  const browsers = new Map<string, NonNullable<ReturnType<typeof getBrowserByAppName>>>();
  const browserWindowsById = new Map<string, Window[]>();

  for (const window of windows) {
    const processWindows = byPid.get(window.pid) ?? [];
    processWindows.push(window);
    byPid.set(window.pid, processWindows);

    if (
      initialMetadata[window.pid] === undefined &&
      (window.bundlePath !== undefined || window.localizedName !== undefined)
    ) {
      initialMetadata[window.pid] = {
        pid: window.pid,
        bundlePath: window.bundlePath,
        localizedName: window.localizedName,
      };
    }

    const browser = getBrowserByAppName(window.app);
    if (browser) {
      browsers.set(browser.id, browser);
      const list = browserWindowsById.get(browser.id) ?? [];
      list.push(window);
      browserWindowsById.set(browser.id, list);
    }
  }

  let snapshot: WindowSearchData = {
    ...emptyWindowData(),
    windows,
    metadataByPid: initialMetadata,
  };
  publish(snapshot);

  function update(data: Partial<WindowSearchData>) {
    snapshot = { ...snapshot, ...data };
    publish(snapshot);
  }

  const missingMetadataPids = [...byPid.keys()].filter((pid) => initialMetadata[pid] === undefined);

  async function loadAXWindows(pid: number) {
    let axWindows: AXWindow[] | null;
    try {
      axWindows = await queries.queryAXWindows(pid);
    } catch (error) {
      console.error(`Failed to query AX windows for PID ${pid}:`, error);
      axWindows = null;
    }
    update({ axWindowsByPid: { ...snapshot.axWindowsByPid, [pid]: axWindows } });
  }

  await Promise.all([
    queries.getRunningApplications
      ? queries
          .getRunningApplications()
          .then(async (applications) => {
            update({ applications });
            await Promise.all(applications.filter((app) => !byPid.has(app.pid)).map((app) => loadAXWindows(app.pid)));
          })
          .catch((error) => console.error("Failed to resolve running applications:", error))
      : Promise.resolve(),
    queries.getApplicationOrder
      ? queries
          .getApplicationOrder()
          .then((applicationOrder) => update({ applicationOrder }))
          .catch((error) => console.error("Failed to resolve application order:", error))
      : Promise.resolve(),
    missingMetadataPids.length > 0
      ? queries
          .getRunningApplicationMetadata(missingMetadataPids)
          .then((resolved) => update({ metadataByPid: { ...snapshot.metadataByPid, ...resolved } }))
          .catch((error) => console.error("Failed to resolve application metadata:", error))
      : Promise.resolve(),
    ...[...browsers.values()].map(async (browser) => {
      const nativeBrowserWindows = browserWindowsById.get(browser.id);
      try {
        if (!queries.getBrowserWindows) {
          const summary = await queries.getBrowserSummary(browser, nativeBrowserWindows);
          update({ browserCounts: { ...snapshot.browserCounts, [browser.id]: summary } });
          return;
        }

        // Publish the cheap window count first, then fill in tabs once the helper finishes.
        if (
          nativeBrowserWindows &&
          nativeBrowserWindows.length > 1 &&
          nativeBrowserWindows.every((window) => window["has-ax-reference"] !== false)
        ) {
          update({
            browserCounts: { ...snapshot.browserCounts, [browser.id]: { windows: nativeBrowserWindows.length } },
          });
        }

        const browserWindows = await queries.getBrowserWindows(browser, nativeBrowserWindows);
        update({
          browserCounts: {
            ...snapshot.browserCounts,
            [browser.id]: {
              windows: browserWindows.length,
              tabs:
                browserWindows.length === 1 && !browserWindows[0].tabListUnavailable
                  ? browserWindows[0].tabs.length
                  : undefined,
            },
          },
          browserTabs: { ...snapshot.browserTabs, [browser.id]: browserWindows },
        });
      } catch (error) {
        console.error(`Failed to load ${browser.appName} tabs:`, error);
      }
    }),
    ...[...byPid]
      .filter(([, processWindows]) =>
        processWindows.every((window) => window["has-ax-reference"] === false && !getBrowserByAppName(window.app)),
      )
      .map(([pid]) => loadAXWindows(pid)),
  ]);
}
