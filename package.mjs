// Builds dist/ and zips it for the Chrome Web Store, leaving out source maps.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

execFileSync("node", ["build.mjs"], { stdio: "inherit" });
const { version } = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
const zip = `hush-${version}.zip`;
rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-q", `../${zip}`, ".", "-x", "*.map"], { cwd: "dist", stdio: "inherit" });
console.log(`Wrote ${zip}`);
