import createLoader from "./load-ts.ts";
import type { MockValue, MockModules } from "./load-ts.ts";

export type TestNode = { type: MockValue; props: Record<string, MockValue> };

function findAll(node: MockValue, predicate: (node: TestNode) => boolean): TestNode[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  if (!node || typeof node !== "object") return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...findAll(node.props?.children, predicate),
    ...findAll(node.props?.actions, predicate),
  ];
}

function renderer(
  snapshot: Record<string, MockValue>,
  mocks: MockModules = {},
  file = "src/app-hopper.tsx",
  exportName = "default",
  props = {},
) {
  const component = (name: string) =>
    Object.assign(() => {}, {
      Item: `${name}.Item`,
      Section: `${name}.Section`,
      EmptyView: `${name}.EmptyView`,
      Push: `${name}.Push`,
    });
  const ui: Record<string, MockValue> = {
    Action: component("Action"),
    ActionPanel: component("ActionPanel"),
    List: component("List"),
    Detail: component("Detail"),
    Icon: { Minus: "minus", Tack: "tack" },
    Keyboard: { Shortcut: { Common: { Refresh: {} } } },
    Toast: { Style: { Failure: "failure" } },
    closeMainWindow: async () => {},
    showToast: async () => {},
  };
  let cursor = 0;
  const state: MockValue[] = [];
  const load = createLoader({
    "@raycast/api": ui,
    "@raycast/utils": {
      useCachedPromise: (_load, _args, options) => ({
        data: options?.initialData ?? snapshot.browserWindows ?? [],
        isLoading: false,
        revalidate() {},
      }),
    },
    react: {
      useMemo: (fn) => fn(),
      useEffect: () => {},
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [
          state[index],
          (value: MockValue) => {
            state[index] = typeof value === "function" ? value(state[index]) : value;
          },
        ];
      },
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "./use-window-search": {
      useWindowSearch: () => ({ ...snapshot, isLoading: false, setWindows() {}, refreshWindows() {} }),
    },
    "./firefox-integration": {},
    "./runtime-environment": {
      useRuntimeEnvironment: () => ({ status: { kind: "ready" }, revalidate() {} }),
    },
    ...mocks,
  });
  const View = load(file)[exportName];
  return {
    ui,
    render: (): TestNode => {
      cursor = 0;
      return View(props);
    },
  };
}

export { renderer, findAll };
