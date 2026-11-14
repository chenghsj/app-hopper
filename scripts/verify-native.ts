import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const binary = path.resolve(__dirname, "../assets/compiled_raycast_swift/app-hopper-native");
if (!existsSync(binary)) throw new Error("Run npm run build to compile the Swift package first.");
const result = execFileSync(binary, ["helperExecutablePath"], { encoding: "utf8", timeout: 5000 });
if (JSON.parse(result) !== binary) throw new Error("The Swift package returned an unexpected executable path.");
const architectures = execFileSync("/usr/bin/lipo", ["-archs", binary], { encoding: "utf8" }).trim();
console.log(`Verified Raycast-built Swift package (${architectures}).`);
