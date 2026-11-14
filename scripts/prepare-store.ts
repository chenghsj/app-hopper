import path from "node:path";
const root = path.resolve(__dirname, "..");
import { prepareStore } from "./store-package.ts";

console.log(`Store source prepared at ${prepareStore(root)}.`);
console.log("This only prepares local files; it does not publish or open a PR.");
