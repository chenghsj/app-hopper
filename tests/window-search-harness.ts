import createLoader, { type MockModules, type MockValue } from "./load-ts.ts";

/** Exercise the installed Raycast usePromise with persistent React hook state. */
export function windowSearchHarness(mocks: MockModules = {}) {
  let cursor = 0;
  const slots: MockValue[] = [];
  const pending = new Map<number, () => void>();
  const cleanups = new Map<number, () => void>();
  const equal = (a: MockValue[], b?: MockValue[]) =>
    b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const useState = (initial: MockValue) => {
    const index = cursor++;
    if (!(index in slots)) {
      const state = {
        value: typeof initial === "function" ? initial() : initial,
        set(next: MockValue) {
          state.value = typeof next === "function" ? next(state.value) : next;
        },
      };
      slots[index] = state;
    }
    return [slots[index].value, slots[index].set];
  };
  const useMemo = (fn: () => MockValue, dependencies: MockValue[]) => {
    const index = cursor++;
    if (!equal(dependencies, slots[index]?.dependencies)) slots[index] = { dependencies, value: fn() };
    return slots[index].value;
  };
  const api = {
    environment: { launchType: "user", assetsPath: "assets", isDevelopment: true },
    LaunchType: { Background: "background" },
    Toast: { Style: { Failure: "failure" } },
    showToast: async () => {},
    ...mocks["@raycast/api"],
  };
  const react = {
    useState,
    useRef: (value: MockValue) => useState(() => ({ current: value }))[0],
    useMemo,
    useCallback: (fn: MockValue, dependencies: MockValue[]) => useMemo(() => fn, dependencies),
    useSyncExternalStore: (_subscribe: MockValue, get: () => MockValue) => get(),
    useEffect: (effect: () => (() => void) | void, dependencies: MockValue[]) => {
      const index = cursor++;
      if (!equal(dependencies, slots[index])) {
        slots[index] = dependencies;
        pending.set(index, () => {
          cleanups.get(index)?.();
          const cleanup = effect();
          if (cleanup) cleanups.set(index, cleanup);
          else cleanups.delete(index);
        });
      }
    },
  };
  const utils = createLoader({
    react,
    "react/jsx-runtime": {},
    "@raycast/api": api,
  })("node_modules/@raycast/utils/dist/main.js");
  const load = createLoader({ ...mocks, react, "@raycast/api": api, "@raycast/utils": utils });
  const hook = load("src/use-window-search.ts").useWindowSearch;
  function flushEffects() {
    const effects = [...pending.values()];
    pending.clear();
    effects.forEach((effect) => effect());
  }
  return {
    flushEffects,
    render(enabled = true, flush = true) {
      cursor = 0;
      const result = hook(enabled);
      if (flush) flushEffects();
      return result;
    },
    unmount() {
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
    },
  };
}
