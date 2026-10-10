import { mountPersistent } from "./mount.js";

// Highlights for a <textarea>, which the CSS Highlight API can't paint into.
// A mirror box with the textarea's exact text metrics sits on top of it with
// transparent text, so only the marks behind detected spans show through.

const COPIED = [
  "boxSizing", "width", "height",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch",
  "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "textTransform",
  "textAlign", "direction", "tabSize", "whiteSpace", "wordBreak", "overflowWrap",
];

const CSS = `
:host { all: initial; }
.mirror {
  position: fixed;
  z-index: 2147483645;
  pointer-events: none;
  overflow: hidden;
  color: transparent;
  border-style: solid;
  border-color: transparent;
  background: transparent;
  margin: 0;
}
mark { color: transparent; border-radius: 2px; }
mark[data-tone="protected"] {
  background: rgb(34 197 94 / 0.25);
  text-decoration: underline 2px rgb(22 163 74);
}
mark[data-tone="exposed"] {
  background: rgb(245 158 11 / 0.3);
  text-decoration: underline wavy rgb(217 119 6);
}
mark[data-tone="skipped"] {
  background: transparent;
  text-decoration: underline dashed rgb(113 113 122);
}
`;

export function createTextareaOverlay({ onStale }) {
  const host = document.createElement("rampart-overlay");
  const root = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets = [sheet];
  const mirror = document.createElement("div");
  mirror.className = "mirror";
  root.append(mirror);
  mountPersistent(host);

  let target = null;
  let renderedText = "";
  let marks = [];
  let frame = 0;

  // Follow the textarea every frame while marks are shown: it moves with
  // layout, resizes as it grows, and scrolls internally.
  function track() {
    frame = 0;
    if (!target) return;
    // The site rewrote the value (e.g. cleared it after sending) without an
    // input event: these marks no longer line up.
    if (target.value !== renderedText) {
      api.clear();
      onStale();
      return;
    }
    const rect = target.getBoundingClientRect();
    if (!target.isConnected || rect.width === 0) {
      mirror.hidden = true;
    } else {
      mirror.hidden = false;
      const style = getComputedStyle(target);
      for (const prop of COPIED) mirror.style[prop] = style[prop];
      // Textareas always wrap; mirror that even if white-space says otherwise.
      if (style.whiteSpace === "normal") mirror.style.whiteSpace = "pre-wrap";
      mirror.style.left = `${rect.left}px`;
      mirror.style.top = `${rect.top}px`;
      mirror.style.width = `${rect.width}px`;
      mirror.style.height = `${rect.height}px`;
      mirror.scrollTop = target.scrollTop;
      mirror.scrollLeft = target.scrollLeft;
    }
    frame = requestAnimationFrame(track);
  }

  const api = {
    /** `items`: sorted, non-overlapping `{ start, end, tone }`. */
    render(textarea, items) {
      if (items.length === 0) {
        this.clear();
        return;
      }
      const text = textarea.value;
      mirror.replaceChildren();
      marks = [];
      let cursor = 0;
      for (const { start, end, tone } of items) {
        mirror.append(text.slice(cursor, start));
        const mark = document.createElement("mark");
        marks.push(mark);
        mark.dataset.tone = tone;
        mark.textContent = text.slice(start, end);
        mirror.append(mark);
        cursor = end;
      }
      // A trailing newline needs a character after it to take up a line.
      mirror.append(`${text.slice(cursor)}\u200b`);
      target = textarea;
      renderedText = text;
      if (!frame) track();
    },
    /** Screen boxes of the i-th rendered item, for hover hit-testing. */
    rectsFor(index) {
      return marks[index] && !mirror.hidden ? [...marks[index].getClientRects()] : [];
    },
    clear() {
      target = null;
      marks = [];
      mirror.replaceChildren();
      mirror.hidden = true;
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
  return api;
}
