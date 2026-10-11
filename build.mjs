// Builds the extension for Chrome (dist/) and Firefox (dist-firefox/), or only
// the browsers named on the command line: `node build.mjs firefox`.
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as esbuild from "esbuild";

const TARGETS = {
  chrome: { out: "dist", esbuild: { target: "chrome120" }, manifest: (m) => m },
  firefox: {
    out: "dist-firefox",
    esbuild: {
      target: "firefox140",
      // Firefox's chrome.* namespace takes callbacks in Manifest V2; browser.*
      // is the same API returning promises, which is what the code expects.
      define: { chrome: "browser" },
    },
    manifest: firefoxManifest,
  },
};

// Firefox's Manifest V3 background pages are unloaded when idle, which would
// unload the model with them. A persistent Manifest V2 background page keeps
// it loaded, and hosts the model page in an iframe (Firefox has no offscreen
// documents). 140 is the first release with the CSS Custom Highlight API.
function firefoxManifest(manifest) {
  const { minimum_chrome_version, action, background, permissions, content_security_policy, ...rest } = manifest;
  return {
    ...rest,
    manifest_version: 2,
    browser_action: action,
    background: { scripts: ["background.js"], persistent: true },
    permissions: permissions.filter((permission) => permission !== "offscreen"),
    content_security_policy: content_security_policy.extension_pages,
    browser_specific_settings: {
      gecko: {
        id: "hush-pii-guard@gabi200.github.io",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}

async function build(name) {
  const target = TARGETS[name];
  const { out } = target;
  await rm(out, { recursive: true, force: true });
  await mkdir(`${out}/ort`, { recursive: true });
  await mkdir(`${out}/pdfjs`, { recursive: true });

  const common = { bundle: true, sourcemap: true, logLevel: "warning", ...target.esbuild };
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

  const manifest = target.manifest(JSON.parse(await readFile("src/manifest.json", "utf8")));
  await writeFile(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of ["offscreen.html", "options.html", "content.css"]) {
    await copyFile(`src/${file}`, `${out}/${file}`);
  }

  await cp("src/icons", `${out}/icons`, { recursive: true, filter: (path) => !path.endsWith(".svg") });

  // ONNX Runtime fetches these at runtime; extensions may not load remote code,
  // so they ship in the package. The JSEP build serves both WebGPU and WASM.
  const ort = "node_modules/onnxruntime-web/dist";
  for (const file of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
    await copyFile(`${ort}/${file}`, `${out}/ort/${file}`);
  }

  // PDF.js is imported at runtime by the model page, only once a PDF is attached.
  // The legacy build supports the manifest's minimum Chrome version.
  const pdfjs = "node_modules/pdfjs-dist";
  await copyFile(`${pdfjs}/legacy/build/pdf.min.mjs`, `${out}/pdfjs/pdf.mjs`);
  await copyFile(`${pdfjs}/legacy/build/pdf.worker.min.mjs`, `${out}/pdfjs/pdf.worker.mjs`);
  await cp(`${pdfjs}/cmaps`, `${out}/pdfjs/cmaps`, { recursive: true });
  console.log(`Built ${out}/ (${name})`);
}

const names = process.argv.slice(2);
for (const name of names.length ? names : Object.keys(TARGETS)) {
  if (!TARGETS[name]) throw new Error(`Unknown browser "${name}"; use ${Object.keys(TARGETS).join(" or ")}.`);
  await build(name);
}
