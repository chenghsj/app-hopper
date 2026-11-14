import assert from "node:assert/strict";
import test from "node:test";
import type { MockValue } from "./load-ts.ts";
import createLoader from "./load-ts.ts";
import { renderer, findAll } from "./render-ui.ts";
import { windowSearchHarness } from "./window-search-harness.ts";

const { emptyWindowData, createWindowSearch } = createLoader({})("src/window-data.ts");
const native = { id: 10, pid: 20, app: "Firefox", title: "Current", "has-ax-reference": true };
const tabs = [{ id: "10", title: "Current", tabs: [{ id: "tab:1", title: "Docs", url: "" }] }];
const tick = () => new Promise((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(queries: Record<string, MockValue> = {}, cached?: MockValue) {
  const writes: MockValue[] = [];
  const store = createWindowSearch({
    queries: {
      queryWindows: async () => [native],
      getRunningApplicationMetadata: async () => ({}),
      queryAXWindows: async () => [],
      getBrowserSummary: async () => {
        throw new Error("Unexpected summary");
      },
      getBrowserWindows: async () => tabs,
      ...queries,
    },
    cache: {
      get: () => cached && JSON.stringify(cached),
      set: (_key: string, value: string) => writes.push(JSON.parse(value)),
    },
  });
  let loading: Promise<void>;
  const toasts: MockValue[] = [];
  const hook = windowSearchHarness({
    "@raycast/api": { showToast: async (toast: MockValue) => toasts.push(toast) },
    "./window-data": {
      createWindowSearch: () => ({
        ...store,
        load: (signal: AbortSignal) => (loading = store.load(signal)),
      }),
    },
  });
  let started = false;
  let enabled = true;
  const read = () => hook.render(enabled, started);
  const search = {
    getSnapshot() {
      const { isLoading, error } = read();
      return { data: store.getSnapshot(), isLoading, error };
    },
    refresh() {
      if (started) return read().refreshWindows();
      started = true;
      hook.flushEffects();
      return loading.then(tick, tick);
    },
    cancel() {
      enabled = false;
      read();
    },
    removeWindow: (target: MockValue) => read().removeWindow(target),
  };
  read();
  const updates: MockValue[] = [];
  const unsubscribe = store.subscribe(() => updates.push(store.getSnapshot()));
  return { search, writes, updates, unsubscribe, hook, toasts };
}

test("cold and cached searches publish native windows before tabs, then commit exactly once", async () => {
  for (const cached of [undefined, { ...emptyWindowData(), windows: [native] }]) {
    const browser = deferred<MockValue[]>();
    const { search, writes } = fixture({ getBrowserWindows: () => browser.promise }, cached);
    assert.deepEqual(search.getSnapshot().data.windows, cached?.windows ?? []);
    const loading = search.refresh();
    await tick();
    assert.deepEqual(search.getSnapshot().data.windows, [native]);
    assert.deepEqual(search.getSnapshot().data.browserTabs, {});
    assert.equal(search.getSnapshot().isLoading, true);
    assert.deepEqual(writes, []);
    browser.resolve(tabs);
    await loading;
    assert.equal(search.getSnapshot().isLoading, false);
    assert.deepEqual(search.getSnapshot().data.browserTabs.firefox, tabs);
    assert.deepEqual(writes, [search.getSnapshot().data]);
  }
});

test("fresh app data retains valid enrichment until a completed empty tab observation replaces it", async () => {
  const browser = deferred<MockValue[]>();
  const cached = {
    ...emptyWindowData(),
    windows: [native],
    applicationOrder: [20, 10],
    applications: [{ pid: 30, localizedName: "Notes" }],
    browserCounts: { firefox: { windows: 1, tabs: 1 } },
    browserTabs: { firefox: tabs },
  };
  const fresh = { ...native, title: "Updated" };
  const applications = [
    { pid: 20, localizedName: "Firefox" },
    { pid: 40, localizedName: "Editor" },
  ];
  const { search, writes } = fixture(
    {
      queryWindows: async () => [fresh],
      getRunningApplications: async () => applications,
      getApplicationOrder: async () => [40, 20],
      getBrowserWindows: () => browser.promise,
    },
    cached,
  );
  const loading = search.refresh();
  await tick();
  assert.deepEqual(search.getSnapshot().data.windows, [fresh]);
  assert.deepEqual(search.getSnapshot().data.applicationOrder, [40, 20]);
  assert.deepEqual(search.getSnapshot().data.applications, applications);
  assert.deepEqual(search.getSnapshot().data.browserTabs, cached.browserTabs);
  assert.deepEqual(search.getSnapshot().data.browserCounts, cached.browserCounts);
  assert.deepEqual(writes, []);
  browser.resolve([]);
  await loading;
  assert.deepEqual(search.getSnapshot().data.browserTabs.firefox, []);
  assert.deepEqual(search.getSnapshot().data.browserCounts.firefox, { windows: 0, tabs: undefined });
  assert.equal(writes.length, 1);
});

for (const outcome of ["success", "failure"]) {
  test(`an older load's ${outcome} cannot publish, commit or finish a newer pending load`, async () => {
    const firstNative = deferred<MockValue[]>();
    const browser = deferred<MockValue[]>();
    const fresh = { ...native, id: 11 };
    let calls = 0;
    const { search, writes } = fixture({
      queryWindows: () => (++calls === 1 ? firstNative.promise : Promise.resolve([fresh])),
      getBrowserWindows: (_browser: MockValue, windows: MockValue[]) => (windows[0].id === 11 ? browser.promise : []),
    });
    const first = search.refresh();
    const second = search.refresh();
    await tick();
    if (outcome === "success") firstNative.resolve([native]);
    else firstNative.reject(new Error("Obsolete failure"));
    await first;
    assert.deepEqual(search.getSnapshot().data.windows, [fresh]);
    assert.equal(search.getSnapshot().isLoading, true);
    assert.equal(search.getSnapshot().error, undefined);
    assert.deepEqual(writes, []);
    browser.resolve([]);
    await second;
    assert.equal(search.getSnapshot().isLoading, false);
    assert.equal(writes.length, 1);
  });
}

for (const stage of ["native", "enrichment"]) {
  test(`cancelling during ${stage} ignores late observations and lets a fresh load recover`, async () => {
    const pending = deferred<MockValue[]>();
    let first = true;
    const { search, writes, updates, unsubscribe } = fixture({
      queryWindows: () => (stage === "native" && first ? pending.promise : Promise.resolve([native])),
      getBrowserWindows: () => (stage === "enrichment" && first ? pending.promise : Promise.resolve(tabs)),
    });
    const loading = search.refresh();
    await tick();
    search.cancel();
    const cancelled = search.getSnapshot();
    const count = updates.length;
    pending.resolve(stage === "native" ? [native] : tabs);
    await loading;
    assert.deepEqual(search.getSnapshot(), cancelled);
    assert.equal(updates.length, count);
    assert.equal(cancelled.isLoading, false);
    assert.deepEqual(writes, []);
    first = false;
    await search.refresh();
    assert.deepEqual(search.getSnapshot().data.browserTabs.firefox, tabs);
    assert.equal(writes.length, 1);
    unsubscribe();
    const subscribedCount = updates.length;
    await search.refresh();
    assert.equal(updates.length, subscribedCount);
  });
}

test("a failed refresh keeps the completed snapshot and clears its error when retried", async () => {
  const cached = { ...emptyWindowData(), windows: [native], browserTabs: { firefox: tabs } };
  let fail = true;
  const failure = new Error("Window query failed");
  const { search, writes } = fixture(
    {
      queryWindows: async () => {
        if (fail) throw failure;
        return [];
      },
    },
    cached,
  );
  await search.refresh();
  assert.equal(search.getSnapshot().error, failure.message);
  assert.deepEqual(search.getSnapshot().data, cached);
  assert.equal(search.getSnapshot().isLoading, false);
  assert.deepEqual(writes, []);
  fail = false;
  const retry = search.refresh();
  assert.equal(search.getSnapshot().error, undefined);
  await retry;
  assert.deepEqual(search.getSnapshot().data.windows, []);
  assert.equal(writes.length, 1);
});

test("fresh native identities discard closed-window and restarted-browser enrichment before tabs finish", async () => {
  const { emptyWindowData } = createLoader({})("src/window-data.ts");
  for (const restarted of [false, true]) {
    const first = { id: 10, pid: 10, app: "Firefox", title: "First", "has-ax-reference": true };
    const previous = {
      ...emptyWindowData(),
      windows: [first, { ...first, id: 11 }, { ...first, id: 30, pid: 30, app: "Google Chrome" }],
      applications: [{ pid: 40, localizedName: "Old windowless app" }],
      browserTabs: {
        firefox: [
          { id: "session:1", nativeWindowId: "10", tabs: [{ id: "one" }] },
          { id: "session:2", nativeWindowId: "11", tabs: [{ id: "two" }] },
          { id: "session:3", tabs: [{ id: "unmapped" }] },
        ],
        chrome: [{ id: "30", tabs: [{ id: "closed" }] }],
      },
      browserCounts: { firefox: { windows: 3 }, chrome: { windows: 1, tabs: 1 } },
      axWindowsByPid: { 40: [{ pid: 40, index: 1, title: "Closed" }] },
    };
    const browser = deferred<MockValue[]>();
    const fresh = { ...first, pid: restarted ? 99 : first.pid };
    const { search } = fixture(
      {
        queryWindows: async () => [fresh],
        getRunningApplications: async () => [{ pid: fresh.pid, localizedName: "Firefox" }],
        getRunningApplicationMetadata: async () => ({}),
        queryAXWindows: async () => [],
        getBrowserSummary: async () => {
          throw new Error("Unexpected summary");
        },
        getBrowserWindows: () => browser.promise,
      },
      previous,
    );
    const loading = search.refresh();
    await new Promise((resolve) => setImmediate(resolve));
    const current = search.getSnapshot().data;
    assert.deepEqual(current.windows, [fresh]);
    assert.equal(current.browserTabs.chrome, undefined);
    assert.equal(current.browserCounts.chrome, undefined);
    assert.deepEqual(current.axWindowsByPid, {});
    if (restarted) assert.equal(current.browserTabs.firefox, undefined);
    else
      assert.deepEqual(
        current.browserTabs.firefox.map((window: MockValue) => window.id),
        ["session:1"],
      );
    assert.equal(current.browserCounts.firefox.windows, 1);
    browser.resolve([]);
    await loading;
  }
});

test("removing a confirmed missing window invalidates pending enrichment and prunes only completed cache data", async () => {
  const other = { ...native, id: 11, title: "Other" };
  const otherTabs = { id: "11", title: "Other", tabs: [] };
  const cached = {
    ...emptyWindowData(),
    windows: [native, other],
    applicationOrder: [20, 30],
    browserTabs: { firefox: [...tabs, otherTabs] },
    browserCounts: { firefox: { windows: 2 } },
  };
  const browser = deferred<MockValue[]>();
  let windows = [{ ...native, title: "Updated" }, other];
  let first = true;
  const { search, writes } = fixture(
    {
      queryWindows: async () => windows,
      getApplicationOrder: async () => [30, 20],
      getBrowserWindows: () => (first ? browser.promise : Promise.resolve([otherTabs])),
    },
    cached,
  );
  const loading = search.refresh();
  await tick();
  search.removeWindow(native);
  assert.deepEqual(search.getSnapshot().data.windows, [other]);
  assert.deepEqual(search.getSnapshot().data.browserTabs.firefox, [otherTabs]);
  assert.deepEqual(writes[0].windows, [other]);
  assert.deepEqual(writes[0].applicationOrder, [20, 30], "A partial refresh must not replace committed cache data");
  browser.resolve([...tabs, otherTabs]);
  await loading;
  assert.deepEqual(search.getSnapshot().data.windows, [other]);
  assert.deepEqual(search.getSnapshot().data.browserTabs.firefox, [otherTabs]);
  assert.equal(writes.length, 1, "The invalidated load cannot commit");
  first = false;
  windows = [other];
  await search.refresh();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].applicationOrder, [30, 20]);
});

test("removing a window from a cold partial load never commits that partial observation", async () => {
  const browser = deferred<MockValue[]>();
  const { search, writes } = fixture({ getBrowserWindows: () => browser.promise });
  const loading = search.refresh();
  await tick();
  search.removeWindow(native);
  browser.resolve(tabs);
  await loading;
  assert.deepEqual(search.getSnapshot().data.windows, []);
  assert.deepEqual(search.getSnapshot().data.browserTabs, {});
  assert.deepEqual(writes, []);
});

test("removal keeps a reused window ID belonging to another process", async () => {
  const reused = { ...native, pid: 99 };
  const { search, writes } = fixture({ queryWindows: async () => [reused] });
  await search.refresh();
  search.removeWindow(native);
  assert.deepEqual(search.getSnapshot().data.windows, [reused]);
  assert.deepEqual(writes.at(-1).windows, [reused]);
});

test("corrupt or unavailable caches do not prevent a completed live search", async () => {
  for (const get of [
    () => "{invalid",
    () => JSON.stringify({ windows: null }),
    () => {
      throw new Error("Read failed");
    },
  ]) {
    const search = createWindowSearch({
      queries: {
        queryWindows: async () => [],
        getRunningApplicationMetadata: async () => ({}),
        queryAXWindows: async () => [],
        getBrowserSummary: async () => ({ windows: 0 }),
      },
      cache: {
        get,
        set: () => {
          throw new Error("Write failed");
        },
      },
    });
    await search.load(new AbortController().signal);
    assert.deepEqual(search.getSnapshot().windows, []);
  }
});

test("the React adapter renders cold failures and wires retry to the real search lifetime", async () => {
  const failure = new Error("Accessibility query failed");
  let fail = true;
  const { search, hook, toasts } = fixture({
    queryWindows: async () => {
      if (fail) throw failure;
      return [];
    },
  });
  await search.refresh();
  await tick();
  const view = renderer(emptyWindowData(), { "./use-window-search": { useWindowSearch: () => hook.render() } });
  const empty = () => findAll(view.render(), (node) => node.type === view.ui.List.EmptyView)[0];
  assert.equal(empty().props.title, "Failed to Load Applications");
  assert.equal(empty().props.description, failure.message);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, "Failed to fetch windows");
  assert.equal(toasts[0].message, failure.message);
  fail = false;
  await findAll(empty(), (node) => node.props.title === "Refresh List")[0].props.onAction();
  await tick();
  assert.equal(empty().props.title, "No Running Applications");
});

test("Raycast request state preserves arrangements and URL search as progressive tabs arrive", async () => {
  const firefox = { ...native, localizedName: "Firefox", space: 2 };
  const notes = { id: 30, pid: 40, app: "Notes", localizedName: "Notes", title: "Notes window", space: 1 };
  const expected = {
    recent: { titles: ["Notes", "Firefox"], sections: [] },
    name: { titles: ["Firefox", "Notes"], sections: [] },
    type: { titles: ["Firefox", "Notes"], sections: ["Browsers", "Applications"] },
    space: { titles: ["Notes", "Firefox"], sections: ["Space 1", "Space 2"] },
  };
  for (const [arrangement, result] of Object.entries(expected)) {
    const browser = deferred<MockValue[]>();
    const { search, hook } = fixture({
      queryWindows: async () => [firefox, notes],
      getApplicationOrder: async () => [40, 20],
      getBrowserWindows: () => browser.promise,
    });
    const loading = search.refresh();
    await tick();
    const view = renderer(emptyWindowData(), {
      "./use-window-search": { useWindowSearch: () => hook.render() },
    });
    view.render().props.searchBarAccessory.props.onChange(arrangement);
    const rows = () => findAll(view.render(), (node) => node.type === view.ui.List.Item);
    assert.deepEqual(
      rows().map((row) => row.props.title),
      result.titles,
    );
    assert.deepEqual(
      findAll(view.render(), (node) => node.type === view.ui.List.Section).map((section) => section.props.title),
      result.sections,
    );
    view.render().props.onSearchTextChange("docs.example.com");
    assert.deepEqual(rows(), []);
    browser.resolve([
      { id: "10", title: "Current", tabs: [{ id: "tab:1", title: "Reference", url: "https://docs.example.com" }] },
    ]);
    await loading;
    assert.deepEqual(
      rows().map((row) => row.props.title),
      ["Reference"],
    );
    const target = rows()[0].props.id;
    view.render().props.onSelectionChange(target);
    await hook.render().refreshWindows();
    assert.equal(view.render().props.searchText, "docs.example.com");
    assert.equal(view.render().props.selectedItemId, target);
    assert.deepEqual(
      rows().map((row) => row.props.id),
      [target],
    );
    view.render().props.onSearchTextChange("");
    assert.equal(view.render().props.searchBarAccessory.props.value, arrangement);
    assert.deepEqual(
      rows().map((row) => row.props.title),
      result.titles,
    );
  }
});

test("unmounting cancels late results and failures without a toast or cache write", async () => {
  for (const outcome of ["success", "failure"]) {
    const pending = deferred<MockValue[]>();
    const { search, hook, writes, toasts } = fixture({ queryWindows: () => pending.promise });
    const loading = search.refresh();
    hook.unmount();
    if (outcome === "success") pending.resolve([native]);
    else pending.reject(new Error("Obsolete native failure"));
    await loading;
    assert.deepEqual(writes, []);
    assert.deepEqual(toasts, []);
    assert.deepEqual(search.getSnapshot().data.windows, []);
  }
});

test("empty search results show the loading state until pending data has arrived", () => {
  let loading = true;
  const view = renderer(emptyWindowData(), {
    "./use-window-search": { useWindowSearch: () => ({ ...emptyWindowData(), isLoading: loading }) },
  });
  view.render().props.onSearchTextChange("github");
  const empty = () => findAll(view.render(), (node) => node.type === view.ui.List.EmptyView)[0];
  assert.equal(empty().props.title, "Getting things ready…");
  loading = false;
  assert.equal(empty().props.title, "No Results");
});
