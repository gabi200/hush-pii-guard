import { composerHolds, rangeFor, readComposer, writeComposer } from "./editor.js";
import { createHoverCard, line } from "./hovercard.js";
import { labelName } from "../labels.js";
import { createTextareaOverlay } from "./overlay.js";
import { currentSite, findComposer, findSendButton } from "./sites.js";
import { PLACEHOLDER_PATTERN, PlaceholderTable } from "./table.js";
import { createPill } from "./ui.js";

const EDITABLE = 'textarea, [contenteditable="true"]';
const MODAL = 'dialog, [role="dialog"], [aria-modal="true"]';
// Labels of the buttons that submit an inline "edit message" box.
const EDIT_SUBMIT = /^(send|save|submit|update)$/i;
// How far up from an edit box to look for its submit button.
const NEAR_DEPTH = 8;

const site = currentSite();
if (site) main();

async function main() {
  const settings = await chrome.storage.local.get(["enabled", "reveal", "pillPosition", "disabledLabels"]);

  let enabled = settings.enabled ?? true;
  let showReal = settings.reveal ?? true;
  // Categories turned off in settings are neither highlighted nor redacted.
  let disabledLabels = new Set(settings.disabledLabels ?? []);
  let phase = "loading"; // loading | ready | heuristics | error
  let busy = false;
  let bypass = false; // set while we re-trigger the site's own send
  let notice = null;

  // ---- Background calls ------------------------------------------------------

  async function ask(type, payload = {}) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ target: "background", type, ...payload });
    } catch (err) {
      // Thrown after the extension is reloaded/updated: this page's script is orphaned.
      phase = "error";
      throw new Error("Hush was updated. Reload this page.", { cause: err });
    }
    if (!response || response.error) throw new Error(response?.error ?? "No response from Hush.");
    return response;
  }

  async function pollStatus() {
    try {
      phase = (await ask("status")).phase;
    } catch {
      phase = "error";
    }
    render();
    if (phase === "loading") setTimeout(pollStatus, 1000);
  }

  async function detect(text) {
    const response = await ask("detect", { text });
    phase = response.phase;
    return response.spans.filter((span) => !disabledLabels.has(span.label));
  }

  // ---- Pill ------------------------------------------------------------------

  const pill = createPill({
    enabled,
    reveal: showReal,
    position: settings.pillPosition,
    onToggle: (on) => chrome.storage.local.set({ enabled: on }),
    onReveal: (on) => chrome.storage.local.set({ reveal: on }),
    onOptions: () => ask("openOptions").catch((err) => flash(err.message, "error")),
    onMove: (pillPosition) => chrome.storage.local.set({ pillPosition }),
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) {
      enabled = changes.enabled.newValue ?? true;
      pill.setEnabled(enabled);
      paintEditorHighlights();
      render();
    }
    if (changes.disabledLabels) {
      disabledLabels = new Set(changes.disabledLabels.newValue ?? []);
      scheduleHighlight(0);
    }
    if (changes.reveal) {
      showReal = changes.reveal.newValue ?? true;
      pill.setReveal(showReal);
      if (showReal) reveal(document.body);
      else unrevealAll();
    }
    // Deleted from the options page: forget the values here too.
    if (storageKey && changes[storageKey] && changes[storageKey].newValue === undefined) {
      unrevealAll();
      table = new PlaceholderTable();
    }
  });

  function render() {
    const pending = scan.items.filter((item) => !item.skipped).length;
    let text;
    let tone;
    if (notice) ({ text, tone } = notice);
    else if (phase === "error") [text, tone] = ["Error · reload the page", "error"];
    else if (busy) [text, tone] = ["Redacting…", "busy"];
    else if (phase === "loading") [text, tone] = ["Loading model…", "busy"];
    else if (enabled) [text, tone] = [pending ? `${pending} to redact` : "On", "ok"];
    else [text, tone] = [pending ? `Off · ${pending} detected` : "Off", pending ? "warn" : "idle"];
    if (phase === "heuristics" && !notice) text += " (patterns only)";
    pill.setStatus(text, tone);
  }

  function flash(text, tone, ms = 5000) {
    notice = { text, tone };
    render();
    setTimeout(() => {
      notice = null;
      render();
    }, ms);
  }

  // ---- Conversation table ------------------------------------------------------

  // A new chat has no id until its first message is sent; its table lives in
  // memory until the URL gains an id, then it is saved under that id.
  let storageKey = null;
  let conversationId = null;
  let table = new PlaceholderTable();

  async function syncConversation() {
    const id = site.conversationId();
    const key = id ? `conv:${site.name}:${id}` : null;
    if (key === storageKey) return;
    const adopt = key && storageKey === null && (table.size > 0 || table.skipped.size > 0);
    storageKey = key;
    conversationId = id;
    if (adopt) {
      await saveTable();
      return;
    }
    unrevealAll();
    table = new PlaceholderTable();
    if (key) {
      try {
        const { table: data } = await ask("table:load", { key });
        if (key === storageKey && data) table = new PlaceholderTable(data);
      } catch (err) {
        console.error("Hush: couldn't load saved values", err);
      }
    }
    reveal(document.body);
    scheduleHighlight(0);
  }

  async function saveTable() {
    if (!storageKey) return;
    await ask("table:save", { key: storageKey, site: site.name, id: conversationId, table: table.toJSON() });
  }

  // ---- Which editors are protected ----------------------------------------------

  const buttonLabel = (button) => (button.getAttribute("aria-label") || button.textContent || "").trim();
  const visible = (el) => el.getClientRects().length > 0;

  // The submit button of an inline edit box: the nearest visible Send/Save/…
  // button, without climbing into a container that also holds the composer
  // (whose own Send button would match).
  function submitButtonNear(editor, composer) {
    let node = editor.parentElement;
    for (let depth = 0; node && depth < NEAR_DEPTH; depth++, node = node.parentElement) {
      if (composer && node.contains(composer)) break;
      for (const button of node.querySelectorAll("button")) {
        if (visible(button) && EDIT_SUBMIT.test(buttonLabel(button))) return button;
      }
    }
    return null;
  }

  function editorNearButton(button, composer) {
    let node = button.parentElement;
    for (let depth = 0; node && depth < NEAR_DEPTH; depth++, node = node.parentElement) {
      if (composer && node.contains(composer)) break;
      const editor = [...node.querySelectorAll(EDITABLE)].find(visible);
      if (editor) return { el: editor, composer: false, button };
    }
    return null;
  }

  // The composer is always protected. Any other editor counts only if it has
  // an edit-submit button nearby, which is what an "edit message" box looks like;
  // that keeps code canvases and settings dialogs out.
  function protectedEditor(target) {
    const el = target instanceof Element ? target.closest(EDITABLE) : null;
    if (!el || !visible(el) || el.closest(MODAL)) return null;
    const composer = findComposer(site);
    if (el === composer) return { el, composer: true };
    const button = submitButtonNear(el, composer);
    return button ? { el, composer: false, button } : null;
  }

  let activeEditor = null;
  addEventListener(
    "focusin",
    (event) => {
      const editor = protectedEditor(event.target);
      if (editor && editor.el !== activeEditor) {
        activeEditor = editor.el;
        scheduleHighlight(0);
      }
    },
    true,
  );

  function currentEditor() {
    if (activeEditor?.isConnected && visible(activeEditor)) return activeEditor;
    activeEditor = null;
    return findComposer(site);
  }

  // ---- Scanning and highlighting the editor ---------------------------------------

  // The latest scan of the editor being typed in. Items: { start, end, label,
  // value, skipped, range? } where range is set for contenteditable editors.
  let scan = { editor: null, text: "", items: [], segments: null };
  let highlightTimer = 0;
  let highlightSeq = 0;
  const overlay = createTextareaOverlay({ onStale: () => scheduleHighlight() });

  function scheduleHighlight(delay = 350) {
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(refreshHighlights, delay);
  }

  // Typing in a <textarea> causes no DOM mutations, so listen for input too.
  addEventListener("input", (event) => protectedEditor(event.target) && scheduleHighlight(), true);

  // Spans covering an existing placeholder (an edited message that was already
  // redacted) are dropped, so tokens never get wrapped in tokens.
  function classify(text, spans) {
    const tokens = [...text.matchAll(PLACEHOLDER_PATTERN)].map((m) => [m.index, m.index + m[0].length]);
    return spans
      .filter((s) => !tokens.some(([start, end]) => s.start < end && s.end > start))
      .map((s) => {
        const value = text.slice(s.start, s.end);
        return { ...s, value, skipped: table.isSkipped(s.label, value) };
      });
  }

  async function refreshHighlights() {
    const seq = ++highlightSeq;
    const editor = currentEditor();
    const { text, segments } = editor ? readComposer(editor) : { text: "", segments: null };
    let items = [];
    if (text.trim()) {
      try {
        items = classify(text, await detect(text));
      } catch {
        render();
        return;
      }
      // Drop stale results: the user kept typing while the model ran.
      if (seq !== highlightSeq || readComposer(editor).text !== text) return;
    }
    scan = { editor, text, items, segments };
    paintEditorHighlights();
    render();
  }

  function paintEditorHighlights() {
    for (const name of ["protected", "exposed", "skipped"]) CSS.highlights.delete(`rampart-${name}`);
    const tone = enabled ? "protected" : "exposed";
    const toneOf = (item) => (item.skipped ? "skipped" : tone);
    if (scan.segments) {
      overlay.clear();
      const groups = {};
      for (const item of scan.items) {
        item.range ??= rangeFor(scan.segments, item.start, item.end);
        if (item.range) (groups[toneOf(item)] ??= []).push(item.range);
      }
      for (const [name, ranges] of Object.entries(groups)) CSS.highlights.set(`rampart-${name}`, new Highlight(...ranges));
    } else if (scan.editor instanceof HTMLTextAreaElement) {
      overlay.render(scan.editor, scan.items.map((item) => ({ ...item, tone: toneOf(item) })));
    } else {
      overlay.clear();
    }
  }

  // The scan already covers exactly this text and nothing in it still needs
  // redacting, so the site can handle the key or click natively.
  function scanIsClean(editor, text) {
    return scan.editor === editor && scan.text === text && scan.items.every((item) => item.skipped);
  }

  async function setSkipped(item, skipped) {
    table.setSkipped(item.label, item.value, skipped);
    // Repeats of the same value in the message follow the same choice.
    for (const other of scan.items) other.skipped = table.isSkipped(other.label, other.value);
    paintEditorHighlights();
    render();
    await saveTable().catch((err) => console.error("Hush: couldn't save", err));
  }

  // ---- Hover card --------------------------------------------------------------

  const card = createHoverCard();
  function describeItem(item) {
    const name = labelName(item.label);
    if (item.skipped) {
      return {
        heading: `${name} · won't be redacted`,
        body: line("You chose to send this as typed in this conversation."),
        actionLabel: "Redact",
        onAction: () => setSkipped(item, false),
      };
    }
    const token = { code: table.peekToken(item.label, item.value) };
    if (!enabled) {
      return {
        heading: `${name} · will be sent as typed`,
        body: line("Hush is off. When on, the AI sees ", token, " instead."),
      };
    }
    return {
      heading: `${name} · will be redacted`,
      body: line("The AI will see ", token, " instead."),
      actionLabel: "Don't redact",
      onAction: () => setSkipped(item, true),
    };
  }

  function describeRevealed(token) {
    return {
      heading: "Real value, shown only on this device",
      body: line("The AI received ", { code: token }, "."),
      actionLabel: "Show placeholders",
      onAction: () => chrome.storage.local.set({ reveal: false }),
    };
  }

  function hoverTargets() {
    const targets = scan.items.map((item, index) => ({
      rects: () => (item.range ? [...item.range.getClientRects()] : overlay.rectsFor(index)),
      describe: () => describeItem(item),
    }));
    for (const [range, token] of revealed) {
      targets.push({ rects: () => [...range.getClientRects()], describe: () => describeRevealed(token) });
    }
    return targets;
  }

  let pointer = null;
  let pointerFrame = 0;
  addEventListener(
    "pointermove",
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      pointerFrame ||= requestAnimationFrame(() => {
        pointerFrame = 0;
        card.track(pointer.x, pointer.y, hoverTargets());
      });
    },
    { passive: true },
  );
  addEventListener("scroll", () => card.hide(), { capture: true, passive: true });

  // ---- Intercepting send ---------------------------------------------------------

  function intercept(event, editor) {
    if (busy) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const { text } = readComposer(editor.el);
    if (!text.trim() || scanIsClean(editor.el, text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    protectAndSend(editor, event.type === "keydown" ? "enter" : editor.button ?? null);
  }

  addEventListener(
    "keydown",
    (event) => {
      if (bypass || !enabled) return;
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      const editor = protectedEditor(event.target);
      if (editor) intercept(event, editor);
    },
    true,
  );

  addEventListener(
    "click",
    (event) => {
      if (bypass || !enabled) return;
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (!button) return;
      const composer = findComposer(site);
      let editor = null;
      if (composer && button === findSendButton(site, composer)) editor = { el: composer, composer: true };
      else if (EDIT_SUBMIT.test(buttonLabel(button))) editor = editorNearButton(button, composer);
      if (editor) intercept(event, editor);
    },
    true,
  );

  // Backstop for anything that submits the composer's form another way.
  addEventListener(
    "submit",
    (event) => {
      if (bypass || !enabled) return;
      const composer = findComposer(site);
      if (!composer || !(event.target instanceof Element) || !event.target.contains(composer)) return;
      intercept(event, { el: composer, composer: true });
    },
    true,
  );

  async function protectAndSend(editor, trigger) {
    busy = true;
    card.hide();
    render();
    try {
      const { text } = readComposer(editor.el);
      // Fail closed: if detection fails, nothing is sent.
      const spans = classify(text, await detect(text)).filter((item) => !item.skipped);
      let expected = text;
      if (spans.length > 0) {
        expected = table.redact(text, spans);
        if (!(await writeComposer(editor.el, expected))) {
          flash("Couldn't rewrite the message · not sent", "error", 8000);
          return;
        }
        await saveTable();
      }
      if (!composerHolds(editor.el, expected)) {
        flash("Message changed while redacting · not sent", "warn");
        return;
      }
      await submit(editor, trigger);
    } catch (err) {
      console.error("Hush:", err);
      flash(`${err.message} · not sent`, "error", 8000);
    } finally {
      busy = false;
      render();
    }
  }

  // The site enables its button only after it notices the new text.
  async function waitForEnabled(find) {
    for (let i = 0; i < 30; i++) {
      const button = find();
      if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") return button;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  async function submit(editor, trigger) {
    let button = null;
    if (editor.composer) button = await waitForEnabled(() => findSendButton(site, editor.el));
    else if (trigger instanceof HTMLElement) {
      button = await waitForEnabled(() => (trigger.isConnected ? trigger : submitButtonNear(editor.el, findComposer(site))));
    }
    bypass = true;
    try {
      if (button) {
        button.click();
      } else {
        const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        editor.el.dispatchEvent(new KeyboardEvent("keydown", init));
      }
    } finally {
      bypass = false;
    }
  }

  // ---- Showing real values in the conversation ---------------------------------------

  const revealed = new Map(); // Range over a real value -> the placeholder it replaced

  function skipNode(node) {
    return node.parentElement?.closest(`${EDITABLE}, script, style`) != null;
  }

  function reveal(root) {
    if (!showReal || table.size === 0 || !root) return;
    const nodes = [];
    if (root.nodeType === Node.TEXT_NODE) nodes.push(root);
    else {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode);
    }
    let changed = false;
    for (const node of nodes) {
      const value = node.nodeValue;
      if (!value.includes("[") || skipNode(node)) continue;
      let out = "";
      let cursor = 0;
      const spans = [];
      for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
        const real = table.lookup(match[0]);
        if (real === undefined) continue;
        out += value.slice(cursor, match.index);
        spans.push([out.length, out.length + real.length, match[0]]);
        out += real;
        cursor = match.index + match[0].length;
      }
      if (spans.length === 0) continue;
      // Only nodeValue changes: React tolerates those, unlike inserted elements.
      node.nodeValue = out + value.slice(cursor);
      for (const [start, end, token] of spans) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        revealed.set(range, token);
      }
      changed = true;
    }
    if (changed) paintRevealed();
  }

  // Put placeholders back, so the page shows exactly what the AI received.
  function unrevealAll() {
    const byNode = new Map();
    for (const [range, token] of revealed) {
      const node = range.startContainer;
      if (!node.isConnected || range.collapsed || range.endContainer !== node) continue;
      // Skip anything the site has re-rendered since we revealed it.
      if (node.nodeValue.slice(range.startOffset, range.endOffset) !== table.lookup(token)) continue;
      if (!byNode.has(node)) byNode.set(node, []);
      byNode.get(node).push({ start: range.startOffset, end: range.endOffset, token });
    }
    revealed.clear();
    for (const [node, edits] of byNode) {
      let value = node.nodeValue;
      for (const { start, end, token } of edits.sort((a, b) => b.start - a.start)) {
        value = value.slice(0, start) + token + value.slice(end);
      }
      node.nodeValue = value;
    }
    paintRevealed();
  }

  function paintRevealed() {
    for (const range of revealed.keys()) {
      if (range.collapsed || !range.startContainer.isConnected) revealed.delete(range);
    }
    if (revealed.size === 0) CSS.highlights.delete("rampart-revealed");
    else CSS.highlights.set("rampart-revealed", new Highlight(...revealed.keys()));
  }

  let pending = new Set();
  let frame = 0;
  new MutationObserver((mutations) => {
    const editor = scan.editor ?? findComposer(site);
    for (const m of mutations) {
      if (editor?.contains(m.target)) scheduleHighlight();
      if (m.type === "characterData") pending.add(m.target);
      else for (const node of m.addedNodes) pending.add(node);
    }
    if (pending.size > 0 && !frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const batch = pending;
        pending = new Set();
        for (const node of batch) if (node.isConnected) reveal(node);
        paintRevealed();
      });
    }
    // Observe <html>, not <body>: the apps can replace <body> wholesale.
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // ---- Start -------------------------------------------------------------------------

  render();
  pollStatus();
  await syncConversation();
  // SPA navigation doesn't fire events a content script can hook reliably.
  setInterval(syncConversation, 500);
  scheduleHighlight(0);
}
