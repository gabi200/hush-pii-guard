// End-to-end check of: skip an item, redaction, restored-value marking and the
// "show placeholders" switch, edit-message boxes, the options page (encrypted
// storage, view, delete), and backend selection. Runs against mock/.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve(import.meta.dirname, "../dist");
const MOCK = join(import.meta.dirname, "mock");
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rampart-")), {
  headless: true,
  executablePath: process.env.CHROME,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, ...(process.env.GPU ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan"] : [])],
});
await ctx.route("https://chatgpt.com/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/editor.bundle.js") {
    return route.fulfill({ body: readFileSync(join(MOCK, "editor.bundle.js")), contentType: "text/javascript" });
  }
  return route.fulfill({ body: readFileSync(join(MOCK, "index.html")), contentType: "text/html" });
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const extensionId = new URL(sw.url()).host;

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto("https://chatgpt.com/");

const highlight = (name) => page.evaluate((n) => [...(CSS.highlights.get(n) ?? [])].map((r) => r.toString()), name);
const pillStatus = () => page.locator("rampart-pill .status").textContent();
const cardText = () => page.locator("rampart-card .card").textContent();
const messages = () => page.$$eval(".msg", (els) => els.map((e) => e.textContent));
async function hoverText(highlightName, text) {
  const box = await page.evaluate(
    ([n, t]) => {
      const range = [...(CSS.highlights.get(n) ?? [])].find((r) => r.toString() === t);
      const rect = range?.getBoundingClientRect();
      return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    },
    [highlightName, text],
  );
  if (!box) throw new Error(`no ${highlightName} highlight over "${text}"`);
  await page.mouse.move(box.x - 30, box.y + 40);
  await page.mouse.move(box.x, box.y, { steps: 4 });
  await page.locator("rampart-card .card:not([hidden])").waitFor();
}

// ---- 1. Skip one item ("Don't redact"), then send ---------------------------------
await page.locator('[contenteditable="true"]').click();
await page.keyboard.type("my name is John Doe and contact me on +40722567222");
await page.waitForFunction(() => (CSS.highlights.get("rampart-protected")?.size ?? 0) >= 3, null, { timeout: 120000 });
await hoverText("rampart-protected", "John");
check("hover card describes the item", /First name · will be redacted.*\[GIVEN_NAME_1\]/.test(await cardText()), await cardText());
await page.locator("rampart-card button").click();
await page.waitForTimeout(200);
check("skipped item gets the skipped style", (await highlight("rampart-skipped")).join() === "John", (await highlight("rampart-skipped")).join());
check("pill counts only items still to redact", (await pillStatus()) === "2 to redact", await pillStatus());
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__sent.length === 1, null, { timeout: 30000 });
const sent1 = await page.evaluate(() => window.__sent[0]);
check("skipped value sent as typed, others redacted", sent1 === "my name is John [SURNAME_1] and contact me on [PHONE_1]", sent1);

// ---- 2. Restored values: marking, hover, show-placeholders switch --------------------
await page.waitForTimeout(800);
check("reply shows real values", (await messages()).at(-1) === "I received Doe, +40722567222.", (await messages()).at(-1));
const revealedText = await highlight("rampart-revealed");
check("restored values are marked", revealedText.includes("Doe") && revealedText.includes("+40722567222"), revealedText.join(", "));
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
await hoverText("rampart-revealed", "Doe");
check("hover on restored value says what the AI saw", /Real value.*\[SURNAME_1\]/.test(await cardText()), await cardText());
await page.mouse.move(5, 5);
await page.locator("rampart-pill .reveal").click();
await page.waitForTimeout(400);
check("eye button shows placeholders", (await messages()).at(-1) === "I received [SURNAME_1], [PHONE_1].", (await messages()).at(-1));
await page.locator("rampart-pill .reveal").click();
await page.waitForTimeout(400);
check("eye button restores real values", (await messages()).at(-1) === "I received Doe, +40722567222.", (await messages()).at(-1));

// ---- 3. Edit-message box ---------------------------------------------------------------
await page.getByRole("button", { name: "Edit" }).click();
const editBox = page.locator(".edit textarea");
await editBox.press("End");
await editBox.pressSequentially(" or mail jane.roe@example.com");
await page.waitForTimeout(1500);
await page.locator(".edit").getByRole("button", { name: "Send" }).click();
await page.waitForFunction(() => window.__sent.length === 2, null, { timeout: 30000 });
const sent2 = await page.evaluate(() => window.__sent[1]);
check(
  "edited message is redacted before sending",
  sent2.startsWith("edit:") && !/Doe|\+4072|jane\.roe/.test(sent2) && sent2.includes("[EMAIL_1]"),
  sent2,
);

// ---- 4. Options page: encrypted storage, view, delete ------------------------------------
await page.waitForTimeout(500);
const raw = JSON.stringify(await sw.evaluate(() => chrome.storage.local.get(null)));
check("saved table is encrypted at rest", raw.includes("conv:chatgpt:abc123") && !/Doe|40722567222|jane/.test(raw));
const options = await ctx.newPage();
await options.goto(`chrome-extension://${extensionId}/options.html`);
await options.locator(".conv").first().waitFor();
check("options lists the conversation", /ChatGPT · abc123/.test(await options.locator(".conv").first().textContent()));
await options.getByRole("button", { name: "Show values" }).click();
const valuesText = await options.locator(".values").textContent();
check("options decrypts and shows values", valuesText.includes("[SURNAME_1]") && valuesText.includes("Doe") && valuesText.includes("Given name · you chose not to redact"), valuesText);
await options.locator("#model-status").filter({ hasText: /Ready|Patterns/ }).waitFor({ timeout: 60000 });
console.log("      model:", await options.locator("#model-status").textContent(), "/", await options.locator("#model-detail").textContent());
await options.screenshot({ path: join(import.meta.dirname, "options.png"), fullPage: true });

await options.locator("#delete-all").click();
await options.locator("#delete-all").click();
await options.getByText("Nothing saved yet.").waitFor();
const afterDelete = Object.keys(await sw.evaluate(() => chrome.storage.local.get(null))).filter((k) => k.startsWith("conv:"));
check("delete all removes saved tables", afterDelete.length === 0, afterDelete.join());
await page.waitForTimeout(500);
check("chat stops showing deleted values", (await messages()).at(-1).includes("[SURNAME_1]"), (await messages()).at(-1));

// ---- 5. Backend selection ------------------------------------------------------------------
await options.selectOption("#device", "webgpu");
await options.locator("#model-status").filter({ hasText: /Ready|Patterns/ }).waitFor({ timeout: 60000 });
console.log("      after choosing WebGPU:", await options.locator("#model-detail").textContent());
await options.selectOption("#device", "wasm");
await options.locator("#model-status").filter({ hasText: /Ready|Patterns/ }).waitFor({ timeout: 60000 });
check("WASM backend selectable", /WASM/.test(await options.locator("#model-detail").textContent()), await options.locator("#model-detail").textContent());

await page.bringToFront();
await page.screenshot({ path: join(import.meta.dirname, "chat.png") });
await ctx.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
