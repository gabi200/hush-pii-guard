// Runs the extension against mock/ served as https://chatgpt.com/, which
// reproduces the logged-in markup (id-less ProseMirror editor, "Send" button).
import { chromium } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve(import.meta.dirname, "../dist");
const MOCK = join(import.meta.dirname, "mock");
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rampart-")), {
  headless: true,
  channel: "chromium", // the headless shell can't load extensions
  executablePath: process.env.CHROME,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route("https://chatgpt.com/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/editor.bundle.js") return route.fulfill({ body: readFileSync(join(MOCK, "editor.bundle.js")), contentType: "text/javascript" });
  return route.fulfill({ body: readFileSync(join(MOCK, "index.html")), contentType: "text/html" });
});
const page = await ctx.newPage();
await page.goto("https://chatgpt.com/");
await page.locator('[contenteditable="true"]').click();
await page.keyboard.type(process.argv[2] ?? "my name is John Doe and contact me on +40722567222");
await page.waitForFunction(() => (CSS.highlights.get("rampart-protected")?.size ?? 0) > 0, null, { timeout: 120000 });
console.log("highlighted:", await page.evaluate(() => [...CSS.highlights.get("rampart-protected")].map((r) => r.toString())));
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__sent.length > 0, null, { timeout: 30000 });
console.log("sent:", await page.evaluate(() => window.__sent[0]));
await page.waitForTimeout(500);
console.log("shown:", await page.$$eval(".msg", (els) => els.map((e) => e.textContent)));
await ctx.close();
