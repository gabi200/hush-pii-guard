import { adoptStyles, mountPersistent } from "./mount.js";

// The on-page toggle: a draggable pill in a shadow root so neither
// site's CSS leaks in.

const CSS = `
:host { all: initial; }
.pill {
  position: fixed;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 6px 0 10px;
  border-radius: 999px;
  background: #18181b;
  color: #fafafa;
  border: 1px solid rgb(255 255 255 / 0.14);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.22);
  font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.pill.dragging { cursor: grabbing; }
.dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #71717a; }
.dot[data-tone="ok"] { background: #22c55e; }
.dot[data-tone="warn"] { background: #f59e0b; }
.dot[data-tone="error"] { background: #ef4444; }
.dot[data-tone="busy"] { background: #a1a1aa; animation: pulse 1s ease-in-out infinite; }
.name { font-weight: 600; }
.status {
  color: #a1a1aa;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status[data-tone="warn"] { color: #fbbf24; }
.status[data-tone="error"] { color: #fca5a5; }
.switch {
  all: unset;
  box-sizing: border-box;
  flex: none;
  position: relative;
  width: 30px;
  height: 18px;
  border-radius: 999px;
  background: #52525b;
  cursor: pointer;
  transition: background-color 0.15s;
}
.switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.switch[aria-checked="true"] { background: #16a34a; }
.switch[aria-checked="true"]::after { transform: translateX(12px); }
.switch:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
.icon {
  all: unset;
  box-sizing: border-box;
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: #a1a1aa;
  cursor: pointer;
}
.icon:hover { color: #fafafa; background: rgb(255 255 255 / 0.08); }
.icon:focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
.icon[aria-pressed="false"] .open, .icon[aria-pressed="true"] .shut { display: none; }
.icon svg { width: 15px; height: 15px; }
@keyframes pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) {
  .switch, .switch::after { transition: none; }
  .dot[data-tone="busy"] { animation: none; }
}
`;

const MARGIN = 8;

export function createPill({ enabled, reveal, position, onToggle, onReveal, onOptions, onMove }) {
  const host = document.createElement("rampart-pill");
  const root = host.attachShadow({ mode: "open" });
  adoptStyles(root, CSS);

  const pill = document.createElement("div");
  pill.className = "pill";
  pill.innerHTML = `
    <span class="dot" data-tone="busy"></span>
    <span class="name">Hush</span>
    <span class="status" role="status"></span>
    <button class="icon reveal" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="open"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></g><g class="shut"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></g></svg></button>
    <button class="icon options" type="button" aria-label="Hush settings" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>
    <button class="switch" role="switch" aria-label="Redact personal information before sending"></button>
  `;
  root.append(pill);

  const dot = pill.querySelector(".dot");
  const status = pill.querySelector(".status");
  const toggle = pill.querySelector(".switch");
  const revealButton = pill.querySelector(".reveal");

  let pos = { right: 20, bottom: 96, ...position };
  const place = () => {
    const maxRight = Math.max(MARGIN, innerWidth - pill.offsetWidth - MARGIN);
    const maxBottom = Math.max(MARGIN, innerHeight - pill.offsetHeight - MARGIN);
    pos = {
      right: Math.min(Math.max(pos.right, MARGIN), maxRight),
      bottom: Math.min(Math.max(pos.bottom, MARGIN), maxBottom),
    };
    pill.style.right = `${pos.right}px`;
    pill.style.bottom = `${pos.bottom}px`;
  };

  toggle.addEventListener("click", () => onToggle(toggle.getAttribute("aria-checked") !== "true"));
  revealButton.addEventListener("click", () => onReveal(revealButton.getAttribute("aria-pressed") !== "true"));
  pill.querySelector(".options").addEventListener("click", onOptions);

  pill.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const origin = { x: event.clientX, y: event.clientY, ...pos };
    let moved = false;
    pill.setPointerCapture(event.pointerId);
    pill.classList.add("dragging");
    const move = (e) => {
      moved = true;
      pos = { right: origin.right - (e.clientX - origin.x), bottom: origin.bottom - (e.clientY - origin.y) };
      place();
    };
    const end = () => {
      pill.classList.remove("dragging");
      pill.removeEventListener("pointermove", move);
      pill.removeEventListener("pointerup", end);
      pill.removeEventListener("pointercancel", end);
      if (moved) onMove(pos);
    };
    pill.addEventListener("pointermove", move);
    pill.addEventListener("pointerup", end);
    pill.addEventListener("pointercancel", end);
  });

  addEventListener("resize", place);
  mountPersistent(host);

  const api = {
    setEnabled(on) {
      toggle.setAttribute("aria-checked", String(on));
      pill.title = on
        ? "Hush is on: detected personal information is replaced with placeholders before sending."
        : "Hush is off: personal information is highlighted but sent as typed.";
    },
    setReveal(on) {
      revealButton.setAttribute("aria-pressed", String(on));
      const label = on
        ? "Showing real values. Click to show what the AI received (placeholders)."
        : "Showing placeholders, as the AI received them. Click to show real values.";
      revealButton.setAttribute("aria-label", label);
      revealButton.title = label;
    },
    setStatus(text, tone) {
      status.textContent = text;
      status.dataset.tone = tone;
      dot.dataset.tone = tone;
      place();
    },
  };
  api.setEnabled(enabled);
  api.setReveal(reveal);
  place();
  return api;
}
