import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import createLoader from "./load-ts.ts";

function activation(activateAfter?: number) {
  let active = false;
  let uptime = 0;
  const events: string[] = [];
  const app = {
    terminated: false,
    hidden: true,
    get active() {
      return active;
    },
    get unhide() {
      events.push("unhide");
      return true;
    },
    activateWithOptions(options: number) {
      assert.equal(options, 2);
      events.push("activate");
      return true;
    },
  };
  const { activateRunningApplication } = createLoader({
    "./helpers/applescript": {
      runAppleScript: async (script: string, language: string) => {
        assert.equal(language, "JavaScript");
        vm.runInNewContext(script, {
          ObjC: { import: (name: string) => assert.equal(name, "AppKit") },
          $: {
            NSRunningApplication: {
              runningApplicationWithProcessIdentifier: (pid: number) => {
                assert.equal(pid, 99);
                return app;
              },
            },
            NSApplicationActivateIgnoringOtherApps: 2,
            NSProcessInfo: {
              processInfo: {
                get systemUptime() {
                  return uptime;
                },
              },
            },
            NSDate: { dateWithTimeIntervalSinceNow: (seconds: number) => seconds },
            NSRunLoop: {
              currentRunLoop: {
                runUntilDate: (seconds: number) => {
                  uptime += seconds;
                  events.push("runLoop");
                  active = activateAfter !== undefined && uptime >= activateAfter;
                },
              },
            },
          },
        });
      },
    },
  })("src/windows.ts");
  return { app, events, activateRunningApplication };
}

test("process activation waits for run-loop observations without reopening or raising a guessed window", async () => {
  const { activateRunningApplication, events } = activation(0.06);
  await activateRunningApplication(99);
  assert.deepEqual(events, ["unhide", "activate", "runLoop", "runLoop"]);
});

test("process activation reports a real timeout and rejects a closed or invalid process", async () => {
  const { activateRunningApplication, app } = activation();
  await assert.rejects(activateRunningApplication(99), /did not become focused/);
  app.terminated = true;
  await assert.rejects(activateRunningApplication(99), /no longer running/);
  await assert.rejects(activateRunningApplication(-1), /Invalid application PID/);
});
