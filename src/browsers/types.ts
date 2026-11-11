import type { WindowState } from "../helpers/window-utils";

export interface BrowserConfig {
  id: string;
  appName: string;
  appPath?: string;
  engine: "chromium" | "firefox" | "webkit";
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
}

export interface BrowserWindow extends WindowState {
  id: string;
  title: string;
  tabs: BrowserTab[];
  space?: number;
  /** Missing tab controls are unknown, not an empty or single-tab window. */
  tabListUnavailable?: boolean;
}
