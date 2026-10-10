// Drives the real chatgpt.com (logged out) with the extension loaded. The
// conversation request is intercepted and aborted, so nothing reaches OpenAI.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve(import.meta.dirname, "../dist");
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rampart-")), {
  headless: true,
  executablePath: process.env.CHROME,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--disable-blink-features=AutomationControlled"],
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});
const sent = [];
await ctx.route("**/*", (route) => {
  const req = route.request();
  if (req.method() === "POST" && /conversation/.test(req.url()) && !/prepare|init/.test(req.url())) {
    sent.push({ url: req.url(), body: req.postData() ?? "" });
    return route.abort();
  }
  return route.continue();
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const page = await ctx.newPage();
page.on("console", (m) => /rampart/i.test(m.text()) && console.log("[page]", m.text().slice(0, 300)));
await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);
const box = page.locator('textarea[name="prompt"]').first();

async function trial(label, text, enabled) {
  await sw.evaluate((on) => chrome.storage.local.set({ enabled: on }), enabled);
  await box.click();
  await page.keyboard.type(text);
  await page.waitForFunction(() => document.querySelector("rampart-overlay") !== null);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(import.meta.dirname, `${label}.png`) });
  const before = sent.length;
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  console.log(`${label}: box now = ${JSON.stringify(await box.inputValue().catch(() => "?"))}`);
  for (const s of sent.slice(before)) console.log(`${label}: POST ${s.url}\n   body: ${s.body.slice(0, 400)}`);
  if (sent.length === before) console.log(`${label}: no conversation POST seen`);
}

await trial("on", "My name is Alex Rivera and my SSN is 472-81-0094.", true);
await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
await trial("off", "Call John Smith at 415-555-0132", false);
await ctx.close();
