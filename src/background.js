// Routes requests from content scripts and the options page: model calls go to
// the offscreen document (one copy of the model for every tab), conversation
// tables are encrypted here before they touch chrome.storage.

const OFFSCREEN_PATH = "offscreen.html";
const CONV_PREFIX = "conv:";

// ---- Offscreen model page ---------------------------------------------------

// Chrome runs the model page as an offscreen document. Firefox has no such
// API, so its persistent background page (this page) holds it in an iframe;
// either way the page is reached with runtime messages.
const offscreenDocument = {
  exists: async () => (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length > 0,
  create: (url) =>
    chrome.offscreen.createDocument({ url, reasons: ["WORKERS"], justification: "Runs the on-device Rampart PII detection model." }),
  close: () => chrome.offscreen.closeDocument(),
};

const MODEL_FRAME = "model-page";
const backgroundFrame = {
  exists: async () => document.getElementById(MODEL_FRAME) !== null,
  create: async (url) => {
    const frame = Object.assign(document.createElement("iframe"), { id: MODEL_FRAME, src: url });
    document.body.append(frame);
  },
  close: async () => document.getElementById(MODEL_FRAME)?.remove(),
};

const modelPage = chrome.offscreen ? offscreenDocument : backgroundFrame;
let creating = null;

// Offscreen documents only get chrome.runtime, not chrome.storage, so the
// backend preference travels in the URL. If WebGPU already failed for this
// preference during this browser session, go straight to WASM.
async function offscreenUrl() {
  const { device = "auto" } = await chrome.storage.local.get("device");
  const { fallback } = await chrome.storage.session.get("fallback");
  const params =
    fallback?.from === device ? { device: "wasm", fellBack: device, why: fallback.why } : { device };
  return `${OFFSCREEN_PATH}?${new URLSearchParams(params)}`;
}

async function ensureOffscreen() {
  if (await modelPage.exists()) return;
  creating ??= (async () => {
    await modelPage.create(await offscreenUrl());
  })().finally(() => {
    creating = null;
  });
  await creating;
}

// Errors meaning "no document to answer": not created yet, still starting, or
// closed mid-request by a backend restart. All are retried on a fresh document.
// The last one is Firefox's wording when the frame is removed mid-request.
const RETRYABLE = /Receiving end does not exist|message port closed|message channel closed|Message manager disconnected/;

async function toOffscreen(message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await ensureOffscreen();
    try {
      const response = await chrome.runtime.sendMessage({ ...message, target: "offscreen" });
      if (response !== undefined) return response;
    } catch (err) {
      if (!RETRYABLE.test(String(err?.message))) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The model page did not respond.");
}

// A new backend only takes effect in a fresh document; the next request makes one.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.device) return;
  await chrome.storage.session.remove("fallback");
  if (await modelPage.exists()) await modelPage.close();
});

// The model page reports that WebGPU failed; restart it on WASM.
async function fallBackToWasm({ why }) {
  const { device = "auto" } = await chrome.storage.local.get("device");
  await chrome.storage.session.set({ fallback: { from: device, why } });
  if (await modelPage.exists()) await modelPage.close();
  return { ok: true };
}

// ---- Encrypted conversation tables -------------------------------------------
//
// Values are sealed with AES-GCM under a non-extractable key kept in this
// extension's IndexedDB. That keeps plain-text PII out of the storage files and
// out of anything that dumps chrome.storage; it does not protect against
// malware that can run code inside the browser profile.

let keyPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("rampart", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idb(db, mode, run) {
  return new Promise((resolve, reject) => {
    const request = run(db.transaction("keys", mode).objectStore("keys"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tableKey() {
  keyPromise ??= (async () => {
    const db = await openDb();
    let key = await idb(db, "readonly", (store) => store.get("tables"));
    if (!key) {
      key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await idb(db, "readwrite", (store) => store.put(key, "tables"));
    }
    return key;
  })();
  return keyPromise;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function saveTable({ key, site, id, table }) {
  if (!key.startsWith(CONV_PREFIX)) throw new Error("Bad table key.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await tableKey(),
    new TextEncoder().encode(JSON.stringify(table)),
  );
  const count = Object.keys(table.values ?? {}).length;
  await chrome.storage.local.set({
    [key]: { v: 1, site, id, count, updated: Date.now(), iv: toBase64(iv), data: toBase64(sealed) },
  });
  return { ok: true };
}

async function loadTable({ key }) {
  const entry = (await chrome.storage.local.get(key))[key];
  if (!entry) return { table: null };
  // Tables saved by 0.1.0 were plain JSON.
  if (entry.v === undefined) return { table: entry };
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(entry.iv) }, await tableKey(), fromBase64(entry.data));
  return { table: JSON.parse(new TextDecoder().decode(plain)) };
}

async function listTables() {
  const all = await chrome.storage.local.get(null);
  const tables = Object.entries(all)
    .filter(([key]) => key.startsWith(CONV_PREFIX))
    .map(([key, entry]) => {
      const [, site, id] = key.split(":");
      return {
        key,
        site: entry.site ?? site,
        id: entry.id ?? id,
        count: entry.count ?? Object.keys(entry.values ?? {}).length,
        updated: entry.updated ?? null,
      };
    })
    .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
  return { tables };
}

async function deleteTables({ keys }) {
  const all = await chrome.storage.local.get(null);
  const targets = keys ?? Object.keys(all).filter((key) => key.startsWith(CONV_PREFIX));
  await chrome.storage.local.remove(targets.filter((key) => key.startsWith(CONV_PREFIX)));
  return { ok: true };
}

// The toolbar button opens the settings page. Manifest V2 (the Firefox build)
// calls it browserAction.
(chrome.action ?? chrome.browserAction).onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ---- Routing -----------------------------------------------------------------

const handlers = {
  status: () => toOffscreen({ type: "status" }),
  detect: ({ text }) => toOffscreen({ type: "detect", text }),
  extract: ({ kind, data, limit }) => toOffscreen({ type: "extract", kind, data, limit }),
  "offscreen:fallback": fallBackToWasm,
  "table:load": loadTable,
  "table:save": saveTable,
  "table:list": listTables,
  "table:delete": deleteTables,
  openOptions: async () => {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "background") return;
  const handler = handlers[message.type];
  if (!handler) return;
  Promise.resolve()
    .then(() => handler(message))
    .then(sendResponse, (err) => sendResponse({ error: String(err?.message ?? err) }));
  return true;
});
