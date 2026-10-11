// End-to-end check of the Firefox build (dist-firefox/) against mock/:
// redaction and restored values, attachments, and the options page.
// Playwright can't load extensions into Firefox, so the add-on is installed as
// a temporary add-on over Firefox's remote debugging protocol.
import { firefox } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makePdf } from "./fixtures.mjs";

const EXT = resolve(import.meta.dirname, "../dist-firefox");
const MOCK = join(import.meta.dirname, "mock");
const ADDON_ID = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).browser_specific_settings.gecko.id;
// Pinning the add-on's internal UUID gives the options page a known URL.
const UUID = "7f3b6a52-1c1e-4b8e-9a51-2f2d3c4b5a69";
const RDP_PORT = 6000 + Math.floor(Math.random() * 1000);

const ctx = await firefox.launchPersistentContext(mkdtempSync(join(tmpdir(), "hush-ff-")), {
  headless: true,
  executablePath: process.env.FIREFOX,
  args: ["-start-debugger-server", String(RDP_PORT)],
  firefoxUserPrefs: {
    "devtools.debugger.remote-enabled": true,
    "devtools.debugger.prompt-connection": false,
    "devtools.chrome.enabled": true,
    "extensions.webextensions.uuids": JSON.stringify({ [ADDON_ID]: UUID }),  },
});

// The protocol frames each JSON packet as "<byte length>:<json>".
async function installTemporaryAddon(path) {
  const socket = connect(RDP_PORT, "127.0.0.1");
  await new Promise((ok, fail) => socket.once("connect", ok).once("error", fail));
  let buffer = Buffer.alloc(0);
  const waiting = [];
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const colon = buffer.indexOf(":");
      if (colon < 0) break;
      const length = Number(buffer.subarray(0, colon).toString());
      if (buffer.length < colon + 1 + length) break;
      const packet = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length).toString());
      buffer = buffer.subarray(colon + 1 + length);
      waiting.shift()?.(packet);
    }
  });
  const next = () => new Promise((ok) => waiting.push(ok));
  const send = (packet) => {
    const body = Buffer.from(JSON.stringify(packet));
    socket.write(`${body.length}:`);
    socket.write(body);
    return next();
  };
  await next(); // greeting
  const root = await send({ to: "root", type: "getRoot" });
  const result = await send({ to: root.addonsActor, type: "installTemporaryAddon", addonPath: path });
  socket.end();
  if (!result.addon) throw new Error(`Couldn't install the add-on: ${JSON.stringify(result)}`);
  return result.addon.id;
}
console.log("installed", await installTemporaryAddon(EXT));

await ctx.route("https://chatgpt.com/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/editor.bundle.js") {
    return route.fulfill({ body: readFileSync(join(MOCK, "editor.bundle.js")), contentType: "text/javascript" });
  }
  return route.fulfill({ body: readFileSync(join(MOCK, "index.html")), contentType: "text/html" });
});

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await page.goto("https://chatgpt.com/");
await page.locator("rampart-pill").waitFor({ state: "attached", timeout: 30000 });
check("pill appears", true);

const highlight = (name) => page.evaluate((n) => [...(CSS.highlights.get(n) ?? [])].map((r) => r.toString()), name);
const messages = () => page.$$eval(".msg", (els) => els.map((e) => e.textContent));

// ---- Redact and restore ----------------------------------------------------------------
await page.locator('[contenteditable="true"]').click();
await page.keyboard.type("my name is John Doe and contact me on +40722567222");
await page.waitForFunction(() => (CSS.highlights.get("rampart-protected")?.size ?? 0) >= 3, null, { timeout: 180000 });
check("items are highlighted", (await highlight("rampart-protected")).includes("+40722567222"), (await highlight("rampart-protected")).join(", "));
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__sent.length === 1, null, { timeout: 30000 });
const sent = await page.evaluate(() => window.__sent[0]);
check("message is redacted before sending", sent === "my name is [GIVEN_NAME_1] [SURNAME_1] and contact me on [PHONE_1]", sent);
await page.waitForTimeout(800);
check("reply shows real values", (await messages()).at(-1) === "I received John, Doe, +40722567222.", (await messages()).at(-1));
check("restored values are marked", (await highlight("rampart-revealed")).includes("Doe"), (await highlight("rampart-revealed")).join(", "));

// ---- Attachments ------------------------------------------------------------------------
const files = () => page.evaluate(() => window.__files);
const fileDialog = page.locator("rampart-files dialog[open]");
const notes = "Meeting notes\nWrite to maria.gonzalez@example.com about the SSN 123-45-6789.\n";
await page.locator("#upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from(notes) });
await fileDialog.waitFor({ timeout: 60000 });
check("text file with PII opens the dialog", /notes\.txt.*Email/.test(await fileDialog.textContent()), await fileDialog.textContent());
await page.locator("rampart-files").getByRole("button", { name: "Attach redacted copy", exact: true }).click();
await page.waitForFunction(() => window.__files.length >= 1, null, { timeout: 10000 });
const redacted = (await files())[0];
check(
  "redacted copy reaches the site",
  redacted.name === "notes.txt" && redacted.text.includes("[EMAIL_1]") && !/maria\.gonzalez|123-45-6789/.test(redacted.text),
  JSON.stringify(redacted),
);

const pdf = makePdf("Dear Maria Gonzalez, your SSN 123-45-6789 is on file.");
await page.evaluate(
  (bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "letter.pdf", { type: "application/pdf" }));
    document.getElementById("dropzone").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  },
  [...pdf],
);
await fileDialog.waitFor({ timeout: 60000 });
check("PDF text is scanned", /letter\.pdf.*SSN/.test(await fileDialog.textContent()), await fileDialog.textContent());
await page.locator("rampart-files").getByRole("button", { name: "Attach redacted copy", exact: true }).click();
await page.waitForFunction(() => window.__files.length >= 2, null, { timeout: 10000 });
const redactedPdf = (await files())[1];
check(
  "redacted PDF arrives as text through the drop",
  redactedPdf.via === "drop" && redactedPdf.name === "letter.txt" && redactedPdf.text.includes("[SSN_") && !redactedPdf.text.includes("123-45-6789"),
  JSON.stringify(redactedPdf),
);

// ---- Options page ---------------------------------------------------------------------------
const options = await ctx.newPage();
await options.goto(`moz-extension://${UUID}/options.html`);
await options.locator("#model-status").filter({ hasText: /Ready|Patterns/ }).waitFor({ timeout: 60000 });
console.log("      model:", await options.locator("#model-status").textContent(), "/", await options.locator("#model-detail").textContent());
check("model runs", (await options.locator("#model-status").textContent()) === "Ready");
await options.locator(".conv").first().waitFor({ timeout: 10000 });
check("options lists the conversation", /ChatGPT · abc123/.test(await options.locator(".conv").first().textContent()));
await options.getByRole("button", { name: "Show values" }).click();
const values = await options.locator(".values").textContent();
check("options decrypts saved values", values.includes("[SURNAME_1]") && values.includes("Doe"), values);

await ctx.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
