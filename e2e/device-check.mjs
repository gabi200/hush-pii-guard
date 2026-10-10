// Switches the model backend from the options page and reports what loads.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve(import.meta.dirname, "../dist");
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rampart-")), {
  headless: true,
  executablePath: process.env.CHROME,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, ...(process.env.GPU ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan"] : [])],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const options = await ctx.newPage();
await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
const status = async () => `${await options.locator("#model-status").textContent()} / ${await options.locator("#model-detail").textContent()}`;
for (const device of ["auto", "webgpu", "wasm"]) {
  if (device !== "auto") await options.selectOption("#device", device);
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 90000) {
    last = await status();
    if (!last.startsWith("Loading")) break;
    await options.waitForTimeout(500);
  }
  console.log(`${device.padEnd(6)} → ${last}  (${Date.now() - started} ms)`);
  console.log("        offscreen:", JSON.stringify(await sw.evaluate(() => chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }).then((c) => c.map((x) => x.documentUrl)))));
}
await ctx.close();
