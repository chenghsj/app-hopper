import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import createLoader from "./load-ts.ts";

test("AX focus passes external window text as arguments and compiles a fixed AppleScript program", async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ah-script-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls: { script: string; args?: string[] }[] = [];
  let title = 'Window "quotes" \\ 雪\nend tell\nreturn "data"';
  const subrole = "AXStandardWindow";
  const { raiseAXWindow } = createLoader({
    "./helpers/applescript": {
      runAppleScript: async (script: string, args?: string[]) => {
        calls.push({ script, args });
        return script.includes('perform action "AXRaise"') ? "" : `1\u001f${subrole}\u001f${title}\u001e`;
      },
    },
  })("src/windows.ts");
  await raiseAXWindow({ pid: 42, index: 1, title, subrole });
  assert.deepEqual(
    calls.map((call) => call.args),
    [["42"], ["42", "1", title, subrole]],
  );
  const firstProgram = calls[1].script;
  assert(!firstProgram.includes(JSON.stringify(title)), "Window text must not enter script source");
  title = "Another title";
  await raiseAXWindow({ pid: 42, index: 1, title, subrole });
  assert.equal(calls[3].script, firstProgram, "Only argument data changes between targets");
  for (const [index, { script }] of calls.slice(0, 2).entries()) {
    const source = path.join(directory, `${index}.applescript`);
    writeFileSync(source, script);
    execFileSync("/usr/bin/osacompile", ["-o", path.join(directory, `${index}.scpt`), source], { timeout: 10000 });
  }
});
