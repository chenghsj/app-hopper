import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { chmod, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

export const OSA_TIMEOUT_MS = 10000;
export const COMPILE_TIMEOUT_MS = 30000;

const compilePromises = new Map<string, Promise<string>>();
const sourceHashCache = new Map<string, string>();
const verifiedBundles = new Map<string, string>();

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = (error as Error & { stderr?: string }).stderr?.trim() || error.message;
    if (message.includes("-1743")) {
      return "Allow Raycast in System Settings → Privacy & Security → Automation, then try again.";
    }
    return message;
  }
  return String(error);
}

/** Bundled helpers are built for both architectures; verify the shipped checksum once per host process. */
export function findBundledHelper(binaryPrefix: string, sourceHash: string): string | undefined {
  const assets = getRaycastPaths().assetsPath;
  if (!assets) return undefined;
  const manifestPath = path.join(assets, "native", "manifest.json");
  if (!fs.existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1)
    throw new Error("App Hopper's native helper package is invalid. Reinstall the extension.");
  const entry = manifest.helpers?.[binaryPrefix];
  if (!entry || entry.sourceHash !== sourceHash) return undefined;
  if (entry.file !== `${binaryPrefix}-${sourceHash}` || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error("App Hopper's native helper package is invalid. Reinstall the extension.");
  }
  const file = path.join(assets, "native", entry.file);
  if (verifiedBundles.get(file) !== entry.sha256) {
    const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (hash !== entry.sha256) throw new Error("App Hopper's native helper is damaged. Reinstall the extension.");
    verifiedBundles.set(file, hash);
  }
  return file;
}

/**
 * Executes a binary directly without spawning a shell.
 */
export function execBinary(
  file: string,
  args: string[],
  options: { timeout?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: options.timeout ?? OSA_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: options.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          const enriched = Object.assign(error, { stdout, stderr });
          reject(enriched);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

export async function runAppleScript(script: string, language = "AppleScript"): Promise<string> {
  try {
    const { stdout } = await execBinary("/usr/bin/osascript", ["-l", language, "-e", script], {
      timeout: OSA_TIMEOUT_MS,
    });
    return stdout.trimEnd();
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export function getRaycastPaths(): { assetsPath?: string; supportPath?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raycast = require("@raycast/api");
    return {
      assetsPath: raycast.environment?.assetsPath,
      supportPath: raycast.environment?.supportPath,
    };
  } catch {
    return {};
  }
}

export function resolveHelperPaths(
  sourceFileName: string,
  binaryPrefix: string,
  fallbackSupportDir: string,
  additionalSourceFiles: string[] = [],
): { sourcePaths: string[]; binaryPath: string; bundledBinaryPath?: string } {
  const { assetsPath, supportPath } = getRaycastPaths();
  const sourcePaths = [sourceFileName, ...additionalSourceFiles].map((file) =>
    assetsPath ? path.join(assetsPath, file) : path.resolve("assets", file),
  );
  const cacheKey = sourcePaths.join("\0");

  let suffix = sourceHashCache.get(cacheKey) ?? "v1";
  if (!sourceHashCache.has(cacheKey)) {
    try {
      if (typeof fs.readFileSync === "function") {
        const source = sourcePaths.map((file) => fs.readFileSync(file, "utf8")).join("\0");
        suffix = createHash("sha256").update(source).digest("hex").slice(0, 12);
        sourceHashCache.set(cacheKey, suffix);
      }
    } catch {
      // Keep the default suffix when the source file is not present in mocked tests.
    }
  }

  const binaryPath = path.join(supportPath || fallbackSupportDir, `${binaryPrefix}-${suffix}`);
  return { sourcePaths, binaryPath, bundledBinaryPath: findBundledHelper(binaryPrefix, suffix) };
}

export async function ensureSwiftHelper(
  sourceFileName: string,
  binaryPrefix: string,
  fallbackSupportDir: string,
  additionalSourceFiles: string[] = [],
): Promise<string> {
  const { sourcePaths, binaryPath, bundledBinaryPath } = resolveHelperPaths(
    sourceFileName,
    binaryPrefix,
    fallbackSupportDir,
    additionalSourceFiles,
  );
  if (bundledBinaryPath) {
    if ((fs.statSync(bundledBinaryPath).mode & 0o111) === 0) await chmod(bundledBinaryPath, 0o755);
    return bundledBinaryPath;
  }
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  const pending = compilePromises.get(binaryPath);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const supportDir = path.dirname(binaryPath);
      await mkdir(supportDir, { recursive: true });
      const tempPath = `${binaryPath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await execBinary("/usr/bin/swiftc", ["-O", ...sourcePaths, "-o", tempPath], {
          timeout: COMPILE_TIMEOUT_MS,
        });
        await rename(tempPath, binaryPath);
      } finally {
        await rm(tempPath, { force: true });
      }
      return binaryPath;
    } finally {
      compilePromises.delete(binaryPath);
    }
  })();

  compilePromises.set(binaryPath, promise);
  return promise;
}

export async function runSwiftHelper(
  sourceFileName: string,
  binaryPrefix: string,
  fallbackSupportDir: string,
  args: string[],
): Promise<string> {
  try {
    const binaryPath = await ensureSwiftHelper(sourceFileName, binaryPrefix, fallbackSupportDir);
    const { stdout } = await execBinary(binaryPath, args, {
      timeout: OSA_TIMEOUT_MS,
    });
    return stdout.trimEnd();
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
