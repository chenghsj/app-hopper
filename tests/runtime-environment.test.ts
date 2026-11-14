import assert from "node:assert/strict";
import test from "node:test";
import createLoader from "./load-ts.ts";
import { renderer, findAll } from "./render-ui.ts";
import { windowSearchHarness } from "./window-search-harness.ts";

function environment(
  overrides: Partial<{
    platform: string;
    version: string;
    access: boolean;
    damaged: boolean;
    invalid: boolean;
  }> = {},
) {
  const state = {
    platform: "darwin",
    version: "27.2",
    access: true,
    ...overrides,
  };
  const calls: [string, string[]?][] = [];
  const load = createLoader({
    "node:os": { platform: () => state.platform },
    "@raycast/utils": {},
    "./helpers/applescript": {
      execBinary: async (binary, args) => {
        calls.push([binary, args]);
        if (binary === "/usr/bin/sw_vers") return { stdout: state.version };
        throw new Error(`Unexpected binary: ${binary}`);
      },
    },
    "./helpers/native-helper": {
      runNativeHelper: async () => {
        if (state.damaged) throw new Error("Missing package");
        calls.push(["permission-check"]);
        return state.invalid ? "invalid" : JSON.stringify({ accessibility: state.access });
      },
    },
  });
  return { checkRuntimeEnvironment: load("src/runtime-environment.ts").checkRuntimeEnvironment, state, calls };
}

test("Store-built helpers run without developer tools, and permission checks never grant access", async () => {
  {
    const check = environment();
    assert.deepEqual(await check.checkRuntimeEnvironment(), { kind: "ready" });
    assert.deepEqual(
      check.calls.map(([binary]) => binary),
      ["/usr/bin/sw_vers", "permission-check"],
    );
    check.state.access = false;
    assert.deepEqual(await check.checkRuntimeEnvironment(), { kind: "accessibility" });
  }
});

test("unsupported systems, damaged packages and malformed helper output have explicit setup states", async () => {
  for (const options of [{ platform: "linux" }, { version: "12.7" }]) {
    const check = environment(options);
    assert.deepEqual(await check.checkRuntimeEnvironment(), { kind: "unsupported" });
    assert.equal(
      check.calls.some(([binary]) => binary === "permission-check"),
      false,
    );
  }
  for (const options of [{ damaged: true }, { invalid: true }]) {
    assert.deepEqual(await environment(options).checkRuntimeEnvironment(), { kind: "error" });
  }
});

test("the setup view shows only the missing prerequisite and provides explicit recovery actions", async () => {
  let opened = "",
    checked = 0;
  const access = renderer({}, {}, "src/runtime-setup.tsx", "RuntimeSetupView", {
    status: { kind: "accessibility" },
    onCheck: () => checked++,
  });
  access.ui.open = async (url: string) => {
    opened = url;
  };
  const tree = access.render();
  assert.match(tree.props.markdown, /Enable Raycast/);
  assert.doesNotMatch(tree.props.markdown, /Command Line Tools/);
  await findAll(tree, (node) => node.props.title === "Open Accessibility Settings")[0].props.onAction();
  assert.match(opened, /Privacy_Accessibility$/);
  findAll(tree, (node) => node.props.title === "Check Again")[0].props.onAction();
  assert.equal(checked, 1);
});

test("window discovery and actions stay disabled until setup is ready", () => {
  const setupTitles: Record<string, RegExp> = {
    accessibility: /Allow Accessibility Access/,
    error: /Could Not Start/,
  };
  for (const kind of ["checking", "accessibility", "error"]) {
    const enabled: boolean[] = [];
    const snapshot = {
      windows: [{ id: 1, pid: 42, app: "Cached App", title: "Cached Window", space: 1, "has-ax-reference": true }],
      metadataByPid: {},
      browserCounts: {},
      browserTabs: {},
      axWindowsByPid: {},
    };
    const view = renderer(snapshot, {
      "./runtime-environment": { useRuntimeEnvironment: () => ({ status: { kind }, revalidate() {} }) },
      "./use-window-search": {
        useWindowSearch: (value) => {
          enabled.push(value);
          return snapshot;
        },
      },
    });
    const tree = view.render();
    if (kind === "checking") {
      assert.equal(tree.type, view.ui.List);
      assert.equal(tree.props.isLoading, true);
      const rows = findAll(tree, (node) => node.type === view.ui.List.Item);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].props.actions, undefined);
      assert.equal(findAll(tree, (node) => node.type === view.ui.List.EmptyView).length, 0);
    } else {
      assert.match(tree.props.markdown, setupTitles[kind]);
    }
    assert.deepEqual(enabled, [false]);
  }
  let loads = 0;
  for (const enabled of [false, true]) {
    const hook = windowSearchHarness({
      "./window-data": {
        createWindowSearch: () => ({
          getSnapshot: () => ({ windows: [] }),
          subscribe() {},
          load: async () => {
            loads++;
          },
        }),
      },
    });
    hook.render(enabled);
    assert.equal(loads, enabled ? 1 : 0);
  }
});

test("a new permission check does not reuse a previous ready state", () => {
  const result = { data: { kind: "ready" }, isLoading: true, revalidate() {} };
  const load = createLoader({ "@raycast/utils": { usePromise: () => result } });
  const { useRuntimeEnvironment } = load("src/runtime-environment.ts");
  assert.equal(useRuntimeEnvironment().status.kind, "checking");
  result.isLoading = false;
  result.data = { kind: "accessibility" };
  assert.equal(useRuntimeEnvironment().status.kind, "accessibility");
});
