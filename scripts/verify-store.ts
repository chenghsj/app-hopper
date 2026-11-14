import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyStoreMetadata } from "./store-metadata.ts";

const root = path.resolve(__dirname, "..");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
const required = [
  ...verifyStoreMetadata(root),
  "swift/app-hopper-native/Package.swift",
  "swift/app-hopper-native/Package.resolved",
  ...tracked.filter((file) => file.startsWith("swift/") && file.endsWith(".swift")),
];
execFileSync("git", ["ls-files", "--error-unmatch", "--", ...new Set(required)], { cwd: root, stdio: "pipe" });
for (const file of tracked.filter((file) => file.startsWith("assets/"))) {
  if (file.startsWith("assets/native/") || file.includes("compiled_raycast_swift/")) {
    throw new Error(`Remove committed native build output: ${file}`);
  }
  const magic = readFileSync(path.join(root, file)).subarray(0, 4).toString("hex");
  if (["cffaedfe", "feedfacf", "cafebabe", "bebafeca", "7f454c46"].includes(magic)) {
    throw new Error(`Remove committed executable: ${file}`);
  }
}
console.log("Store sources verified: Swift package and screenshots are tracked; no native executables are committed.");
