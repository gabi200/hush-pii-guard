// Checks the pill survives the app removing it or replacing <body>.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve(import.meta.dirname, "../dist");
const MOCK = join(import.meta.dirname, "mock");
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rampart-")), {
  headless: true,
  executablePath: process.env.CHROME,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route("https://chatgpt.com/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/editor.bundle.js") {
    return route.fulfill({ body: readFileSync(join(MOCK, "editor.bundle.js")), contentType: "text/javascript" });
  }
  return route.fulfill({ body: readFileSync(join(MOCK, "index.html")), contentType: "text/html" });
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("https://chatgpt.com/");
await page.waitForTimeout(2000);

const where = () =>
  page.evaluate(() => {
    const host = document.querySelector("rampart-pill");
    return host ? `in <${host.parentNode.nodeName.toLowerCase()}>` : "missing";
  });
console.log("initial:", await where());
await page.evaluate(() => document.querySelector("rampart-pill").remove());
await page.waitForTimeout(300);
console.log("after app removes it:", await where());
await page.evaluate(() => document.body.replaceWith(document.createElement("body")));
await page.waitForTimeout(1500);
console.log("after <body> is replaced:", await where());
await page.screenshot({ path: join(import.meta.dirname, "pill.png") });
await ctx.close();
