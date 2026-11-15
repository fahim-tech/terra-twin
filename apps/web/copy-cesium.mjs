// Copies Cesium's static runtime (workers, assets, widgets CSS, third-party) into public/cesium.
// Runs before dev/build; the output is git-ignored.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const src = resolve(import.meta.dirname, "node_modules/cesium/Build/Cesium");
const dest = resolve(import.meta.dirname, "public/cesium");
const version = JSON.parse(readFileSync(resolve(import.meta.dirname, "node_modules/cesium/package.json"), "utf8")).version;
const stamp = resolve(dest, ".version");
if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) process.exit(0);
for (const d of ["Workers", "ThirdParty", "Assets", "Widgets"]) cpSync(resolve(src, d), resolve(dest, d), { recursive: true });
writeFileSync(stamp, version);
console.log(`copied Cesium ${version} runtime to public/cesium`);
