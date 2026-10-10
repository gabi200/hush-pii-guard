// Renders src/icons/icon.svg to the PNG sizes Chrome and the Web Store need.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(import.meta.dirname, "../src/icons");
const svg = readFileSync(join(dir, "icon.svg"), "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROME });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: join(dir, `icon-${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
