// Builds the extension and zips it for release, leaving out source maps:
// hush-<version>.zip (Chrome, dist/) and hush-firefox-<version>.zip (dist-firefox/).
// Zipped with fflate, so no zip tool needs to be installed.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";

execFileSync("node", ["build.mjs"], { stdio: "inherit" });

// Archive paths use forward slashes on every OS, which Firefox requires.
function files(dir, prefix = "") {
  const out = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(out, files(join(dir, entry.name), `${path}/`));
    else if (!entry.name.endsWith(".map")) out[path] = readFileSync(join(dir, entry.name));
  }
  return out;
}

const { version } = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
for (const [dir, zip] of [
  ["dist", `hush-${version}.zip`],
  ["dist-firefox", `hush-firefox-${version}.zip`],
]) {
  writeFileSync(zip, zipSync(files(dir), { level: 9 }));
  console.log(`Wrote ${zip}`);
}
