import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import * as esbuild from "esbuild";

const out = "dist";
await rm(out, { recursive: true, force: true });
await mkdir(`${out}/ort`, { recursive: true });

const common = { bundle: true, target: "chrome120", sourcemap: true, logLevel: "info" };

await Promise.all([
  esbuild.build({ ...common, entryPoints: ["src/background.js"], outfile: `${out}/background.js`, format: "iife" }),
  esbuild.build({ ...common, entryPoints: ["src/content/index.js"], outfile: `${out}/content.js`, format: "iife" }),
  esbuild.build({ ...common, entryPoints: ["src/options.js"], outfile: `${out}/options.js`, format: "iife" }),
  esbuild.build({
    ...common,
    entryPoints: ["src/offscreen.js"],
    outfile: `${out}/offscreen.js`,
    format: "esm",
    platform: "browser",
  }),
]);

for (const file of ["manifest.json", "offscreen.html", "options.html", "content.css"]) {
  await copyFile(`src/${file}`, `${out}/${file}`);
}

await cp("src/icons", `${out}/icons`, { recursive: true, filter: (path) => !path.endsWith(".svg") });

// ONNX Runtime fetches these at runtime; MV3 requires them to ship in the package.
// The JSEP build serves both the WebGPU and WASM backends.
const ort = "node_modules/onnxruntime-web/dist";
for (const file of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
  await copyFile(`${ort}/${file}`, `${out}/ort/${file}`);
}
