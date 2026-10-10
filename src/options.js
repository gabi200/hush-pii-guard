import { CATEGORY_GROUPS, labelName } from "./labels.js";

const SITES = {
  chatgpt: { name: "ChatGPT", url: (id) => `https://chatgpt.com/c/${id}` },
  claude: { name: "Claude", url: (id) => `https://claude.ai/chat/${id}` },
};

const $ = (id) => document.getElementById(id);

async function ask(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ target: "background", type, ...payload });
  if (!response || response.error) throw new Error(response?.error ?? "No response.");
  return response;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ---- Settings ----------------------------------------------------------------

async function loadSettings() {
  const { enabled = true, reveal = true, device = "auto" } = await chrome.storage.local.get(["enabled", "reveal", "device"]);
  $("enabled").checked = enabled;
  $("reveal").checked = reveal;
  $("device").value = device;
}

// ---- Categories ----------------------------------------------------------------

function renderCategories() {
  $("categories").replaceChildren(
    ...CATEGORY_GROUPS.map((group) =>
      el(
        "div",
        { className: "group" },
        el("p", { className: "group-name", textContent: group.name }),
        el(
          "div",
          { className: "checks" },
          ...group.labels.map((label) =>
            el("label", { className: "check" }, el("input", { type: "checkbox", value: label }), labelName(label)),
          ),
        ),
      ),
    ),
  );
}

async function loadCategories() {
  const { disabledLabels = [] } = await chrome.storage.local.get("disabledLabels");
  for (const box of $("categories").querySelectorAll("input")) box.checked = !disabledLabels.includes(box.value);
}

$("categories").addEventListener("change", () => {
  const disabledLabels = [...$("categories").querySelectorAll("input:not(:checked)")].map((box) => box.value);
  chrome.storage.local.set({ disabledLabels });
});

$("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));
$("reveal").addEventListener("change", (e) => chrome.storage.local.set({ reveal: e.target.checked }));
$("device").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ device: e.target.value });
  showStatus({ phase: "loading" });
  setTimeout(pollStatus, 300);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled || changes.reveal || changes.device) loadSettings();
  if (changes.disabledLabels) loadCategories();
  if (Object.keys(changes).some((key) => key.startsWith("conv:"))) loadConversations();
});

// ---- Model status --------------------------------------------------------------

const DEVICE_NAMES = { webgpu: "WebGPU", wasm: "WASM" };

function showStatus(status) {
  const [text, tone, detail] =
    status.phase === "ready"
      ? ["Ready", "ok", `Running on ${DEVICE_NAMES[status.device] ?? status.device}.`]
      : status.phase === "heuristics"
        ? ["Patterns only", "warn", `The model failed to load (${status.reason}). Only emails, URLs, IPs, SSNs and card numbers are detected.`]
        : status.phase === "error"
          ? ["Unavailable", "warn", status.error]
          : ["Loading", "busy", "Downloading or starting the model. The first run downloads about 15 MB."];
  $("model-status").textContent = text;
  $("model-dot").dataset.tone = tone;
  $("model-detail").textContent = detail;
  if (status.phase === "ready" && status.preference !== "wasm" && status.device === "wasm") {
    $("model-detail").textContent +=
      status.fallback === "wrong-results"
        ? " WebGPU gave incorrect results on this device, so it uses WASM."
        : status.fallback === "error"
          ? " WebGPU failed to start on this device, so it uses WASM."
          : " WebGPU isn't available here, so it uses WASM.";
  }
}

async function pollStatus() {
  let status;
  try {
    status = await ask("status");
  } catch (err) {
    status = { phase: "error", error: err.message };
  }
  showStatus(status);
  if (status.phase === "loading") setTimeout(pollStatus, 1500);
}

// ---- Saved conversations ---------------------------------------------------------

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

async function loadConversations() {
  const list = $("conversations");
  let tables;
  try {
    ({ tables } = await ask("table:list"));
  } catch (err) {
    list.replaceChildren(el("p", { className: "empty", textContent: `Couldn't load: ${err.message}` }));
    return;
  }
  $("delete-all").hidden = tables.length === 0;
  if (tables.length === 0) {
    list.replaceChildren(el("p", { className: "empty", textContent: "Nothing saved yet." }));
    return;
  }
  list.replaceChildren(...tables.map(renderConversation));
}

function renderConversation(entry) {
  const site = SITES[entry.site];
  const link = el("a", {
    href: site ? site.url(entry.id) : "#",
    target: "_blank",
    rel: "noopener",
    textContent: `${site?.name ?? entry.site} · ${entry.id.slice(0, 8)}`,
    title: entry.id,
  });
  const meta = el("div", {
    className: "conv-meta",
    textContent: [
      `${entry.count} ${entry.count === 1 ? "value" : "values"}`,
      entry.updated ? dateFormat.format(entry.updated) : null,
    ].filter(Boolean).join(" · "),
  });
  const details = el("div", { hidden: true });
  const show = el("button", { type: "button", textContent: "Show values" });
  const remove = el("button", { type: "button", className: "danger", textContent: "Delete" });

  show.addEventListener("click", async () => {
    if (!details.hidden) {
      details.hidden = true;
      details.replaceChildren();
      show.textContent = "Show values";
      return;
    }
    try {
      const { table } = await ask("table:load", { key: entry.key });
      details.replaceChildren(renderValues(table));
    } catch (err) {
      details.replaceChildren(el("p", { className: "empty", textContent: `Couldn't decrypt: ${err.message}` }));
    }
    details.hidden = false;
    show.textContent = "Hide values";
  });
  confirmable(remove, "Confirm delete", () => ask("table:delete", { keys: [entry.key] }));

  return el(
    "div",
    { className: "conv" },
    el("div", { className: "conv-head" }, el("div", { className: "conv-title" }, link, meta), el("div", { className: "conv-actions" }, show, remove)),
    details,
  );
}

function renderValues(table) {
  const rows = Object.entries(table?.values ?? {}).map(([token, value]) =>
    el("tr", {}, el("td", {}, el("code", { textContent: token })), el("td", { textContent: value })),
  );
  const skipped = (table?.skipped ?? []).map((key) => {
    const [label, ...rest] = key.split("|");
    return el("tr", {}, el("td", { textContent: `${labelName(label)} · you chose not to redact` }), el("td", { textContent: rest.join("|") }));
  });
  if (rows.length + skipped.length === 0) return el("p", { className: "empty", textContent: "No values." });
  return el(
    "table",
    { className: "values" },
    el("thead", {}, el("tr", {}, el("th", { textContent: "The AI saw" }), el("th", { textContent: "Real value" }))),
    el("tbody", {}, ...rows, ...skipped),
  );
}

// Two-step destructive buttons: the first click arms, the second confirms.
// (Extension pages can't rely on confirm() being shown everywhere, and an
// inline step is clearer anyway.)
function confirmable(button, armedLabel, action) {
  const label = button.textContent;
  let timer = 0;
  button.addEventListener("click", async () => {
    if (!button.classList.contains("armed")) {
      button.classList.add("armed");
      button.textContent = armedLabel;
      timer = setTimeout(() => {
        button.classList.remove("armed");
        button.textContent = label;
      }, 4000);
      return;
    }
    clearTimeout(timer);
    button.disabled = true;
    try {
      await action();
    } finally {
      button.disabled = false;
      button.classList.remove("armed");
      button.textContent = label;
    }
  });
}

confirmable($("delete-all"), "Click again to delete everything", () => ask("table:delete", {}));

renderCategories();
loadSettings();
loadCategories();
pollStatus();
loadConversations();
