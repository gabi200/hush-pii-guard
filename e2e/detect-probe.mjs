// Asks the extension's detector for spans on the chosen backend (GPU=1 for WebGPU).
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
const page = await ctx.newPage();
page.on("console", (m) => console.log("[options]", m.text().slice(0, 300)));
await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
const ask = (msg) => page.evaluate((m) => chrome.runtime.sendMessage({ target: "background", ...m }), msg);
for (let i = 0; i < 60; i++) {
  const s = await ask({ type: "status" });
  if (s.phase !== "loading") { console.log("status", JSON.stringify(s)); break; }
  await page.waitForTimeout(500);
}
const text = "my name is John Doe and contact me on +40722567222";
const t0 = Date.now();
const result = await Promise.race([ask({ type: "detect", text }), new Promise((r) => setTimeout(() => r("TIMEOUT"), 30000))]);
console.log(`detect (${Date.now() - t0} ms):`, JSON.stringify(result));
const offscreen = ctx.backgroundPages?.() ?? [];
await ctx.close();
