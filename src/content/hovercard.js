import { adoptStyles, mountPersistent } from "./mount.js";

// A small card shown when hovering a highlight: what the item is, what the AI
// sees, and an action (skip / redact again). Highlights aren't elements, so
// hovering is detected by hit-testing their screen rects against the pointer.

const CSS = `
:host { all: initial; }
.card {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(360px, calc(100vw - 16px));
  padding: 8px 8px 8px 12px;
  border-radius: 10px;
  background: #18181b;
  color: #fafafa;
  border: 1px solid rgb(255 255 255 / 0.14);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
  font: 400 12px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.card[hidden] { display: none; }
.text { min-width: 0; }
.title { font-weight: 600; }
.detail { color: #a1a1aa; overflow-wrap: anywhere; }
code { font: 500 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #86efac; }
button {
  all: unset;
  flex: none;
  padding: 5px 10px;
  border-radius: 6px;
  background: #3f3f46;
  color: #fafafa;
  font-weight: 600;
  cursor: pointer;
}
button:hover { background: #52525b; }
button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
button[hidden] { display: none; }
`;

const HIDE_DELAY = 250;
const GAP = 6;

export function createHoverCard() {
  const host = document.createElement("rampart-card");
  const root = host.attachShadow({ mode: "open" });
  adoptStyles(root, CSS);
  const card = document.createElement("div");
  card.className = "card";
  card.hidden = true;
  card.innerHTML = `<div class="text"><div class="title"></div><div class="detail"></div></div><button type="button"></button>`;
  root.append(card);
  mountPersistent(host);

  const title = card.querySelector(".title");
  const detail = card.querySelector(".detail");
  const button = card.querySelector("button");

  let current = null; // the target object currently shown
  let action = null;
  let hideTimer = 0;
  let overCard = false;

  card.addEventListener("pointerenter", () => {
    overCard = true;
    clearTimeout(hideTimer);
  });
  card.addEventListener("pointerleave", () => {
    overCard = false;
    scheduleHide();
  });
  // Keep focus (and the caret) in the message box, so typing or Enter carries on.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    const run = action;
    hide();
    run?.();
  });

  function hide() {
    clearTimeout(hideTimer);
    card.hidden = true;
    current = null;
    action = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!overCard) hide();
    }, HIDE_DELAY);
  }

  function show(target, rect) {
    clearTimeout(hideTimer);
    if (current === target && !card.hidden) return;
    current = target;
    const { heading, body, actionLabel, onAction } = target.describe();
    title.textContent = heading;
    detail.replaceChildren(...body);
    button.hidden = !actionLabel;
    button.textContent = actionLabel ?? "";
    action = onAction ?? null;
    card.hidden = false;
    // Above the item when there's room, otherwise below it.
    const { width, height } = card.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), innerWidth - width - 8);
    const top = rect.top - height - GAP >= 8 ? rect.top - height - GAP : rect.bottom + GAP;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  return {
    /**
     * Point the card at whichever target is under (x, y). Each target has
     * `rects()` → DOMRect[] and `describe()` → { heading, body: Node[], actionLabel?, onAction? }.
     */
    track(x, y, targets) {
      for (const target of targets) {
        for (const rect of target.rects()) {
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            show(target, rect);
            return;
          }
        }
      }
      if (!card.hidden && !overCard) scheduleHide();
    },
    hide,
  };
}

/** Builds "text <code>token</code> text" detail lines without innerHTML. */
export function line(...parts) {
  return parts.map((part) => {
    if (typeof part === "string") return document.createTextNode(part);
    const code = document.createElement("code");
    code.textContent = part.code;
    return code;
  });
}
