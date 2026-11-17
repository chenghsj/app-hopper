import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { companionReleasePlan } from "../scripts/companion-release-plan";

const source = ts.transpileModule(readFileSync("scripts/companion-release.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
}).outputText;

async function plan(status: number) {
  const logs: string[] = [];
  const errors: string[] = [];
  const process = {
    argv: ["node", "companion-release.ts", "plan"],
    env: { GH_TOKEN: "test-release-token" },
    exitCode: 0,
  };
  vm.runInNewContext(source, {
    exports: {},
    require: (name: string) => {
      if (name === "node:fs") {
        return {
          readFileSync: (file: string) =>
            JSON.stringify(
              file.startsWith("companion/")
                ? { version: "1.0.3", browser_specific_settings: { gecko: { id: "app-hopper-firefox@chenghsj" } } }
                : { companion: { version: "1.0.1" } },
            ),
        };
      }
      if (name === "./companion-release-plan") return { companionReleasePlan };
      return {};
    },
    process,
    console: { log: (value: string) => logs.push(value), error: (value: string) => errors.push(value) },
    fetch: async (url: string, options?: RequestInit) => {
      assert.equal(url, "https://api.github.com/repos/chenghsj/app-hopper/releases/tags/companion-v1.0.3");
      const authenticated = new Headers(options?.headers).get("authorization") === "Bearer test-release-token";
      return { status: authenticated ? status : 403, ok: authenticated && status === 200 };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { logs, errors, exitCode: process.exitCode };
}

test("release planning authenticates its GitHub lookup when an anonymous request would return 403", async () => {
  const result = await plan(404);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.logs, ["Release candidate: companion-v1.0.3"]);
});

test("authenticated release planning still rejects an existing release before signing", async () => {
  const result = await plan(200);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.errors, ["Release already exists; refusing to replace its assets"]);
});
