import assert from "node:assert/strict";
import test from "node:test";
import createLoader from "./load-ts.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
  const calls: { pid: number; resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
  const { queryAXWindows } = createLoader({
    "./helpers/applescript": {
      runAppleScript: (_script: string, args: string[]) =>
        new Promise<string>((resolve, reject) => {
          calls.push({ pid: Number(args[0]), resolve, reject });
        }),
    },
  })("src/windows.ts");
  return { calls, queryAXWindows };
}

test("AX fallback queries share a two-process limit and release slots after failures", async () => {
  const { calls, queryAXWindows } = fixture();
  const queries = [20, 21, 22, 23].map((pid) => queryAXWindows(pid));
  const failed = assert.rejects(queries[0], /Unavailable/);
  await tick();
  assert.deepEqual(
    calls.map((call) => call.pid),
    [20, 21],
    "Do not start every System Events query at once",
  );
  calls[0].reject(new Error("Unavailable"));
  await tick();
  assert.deepEqual(
    calls.map((call) => call.pid),
    [20, 21, 22],
  );
  calls[1].resolve("");
  await tick();
  assert.deepEqual(
    calls.map((call) => call.pid),
    [20, 21, 22, 23],
  );
  calls[2].resolve("");
  calls[3].resolve("");
  await Promise.all([failed, ...queries.slice(1)]);
});

test("cancelling a queued AX query rejects its caller without starting AppleScript", async () => {
  const { calls, queryAXWindows } = fixture();
  const first = queryAXWindows(20);
  const second = queryAXWindows(21);
  const controller = new AbortController();
  const cancelled = assert.rejects(queryAXWindows(22, controller.signal), { name: "AbortError" });
  const last = queryAXWindows(23);
  controller.abort();
  await tick();
  calls[0].resolve("");
  calls[1].resolve("");
  await tick();
  assert.deepEqual(
    calls.map((call) => call.pid),
    [20, 21, 23],
  );
  calls[2].resolve("");
  await Promise.all([first, second, cancelled, last]);
});

test("an aborted active AX query holds its slot until the underlying subprocess finishes", async () => {
  const { calls, queryAXWindows } = fixture();
  const controller = new AbortController();
  const cancelled = assert.rejects(queryAXWindows(20, controller.signal), { name: "AbortError" });
  const second = queryAXWindows(21);
  const third = queryAXWindows(22);
  controller.abort();
  await tick();
  assert.deepEqual(calls.map((call) => call.pid), [20, 21], "Aborting must not let a third subprocess overlap");
  calls[0].resolve("");
  await tick();
  assert.deepEqual(calls.map((call) => call.pid), [20, 21, 22]);
  calls[1].resolve("");
  calls[2].resolve("");
  await Promise.all([cancelled, second, third]);
});
