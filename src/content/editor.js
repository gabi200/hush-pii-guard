// Reading and rewriting the chat composer. Both sites use ProseMirror, which
// owns its DOM: writes must go through events the editor already handles
// (insertText / paste) rather than direct DOM edits it would discard.

const BLOCKS = new Set([
  "P", "DIV", "LI", "UL", "OL", "PRE", "BLOCKQUOTE", "TR",
  "H1", "H2", "H3", "H4", "H5", "H6",
]);

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Plain text of the composer plus the text nodes it came from, so detected
 * spans (string offsets) can be mapped back to DOM ranges for highlighting.
 * Paragraph boundaries become "\n" (innerText would give "\n\n" per <p>).
 */
export function readComposer(el) {
  if (el instanceof HTMLTextAreaElement) return { text: el.value, segments: null };

  let text = "";
  const segments = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        segments.push({ node: child, start: text.length });
        text += child.nodeValue;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === "BR") {
          text += "\n";
          continue;
        }
        const block = BLOCKS.has(child.tagName);
        if (block && text && !text.endsWith("\n")) text += "\n";
        walk(child);
        if (block && text && !text.endsWith("\n")) text += "\n";
      }
    }
  };
  walk(el);
  return { text: text.replace(/\n+$/, ""), segments };
}

export function rangeFor(segments, start, end) {
  const from = locate(segments, start, false);
  const to = locate(segments, end, true);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

function locate(segments, offset, isEnd) {
  for (const { node, start } of segments) {
    const end = start + node.nodeValue.length;
    if (isEnd ? offset > start && offset <= end : offset >= start && offset < end) {
      return { node, offset: offset - start };
    }
  }
  return null;
}

const collapse = (s) => s.replace(/\s+/g, " ").trim();

/** True when the composer now holds exactly `text` (modulo whitespace). */
export function composerHolds(el, text) {
  return collapse(readComposer(el).text) === collapse(text);
}

/**
 * Replace the composer's contents with `text`. Returns false if no strategy
 * produced the expected contents, in which case the caller must not send.
 */
export async function writeComposer(el, text) {
  if (el instanceof HTMLTextAreaElement) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setValue.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await nextFrame();
    return composerHolds(el, text);
  }

  // Paste keeps paragraph structure for multi-line text; insertText is the
  // most faithful for a single line. Each falls back to the other.
  const strategies = text.includes("\n") ? [paste, insertText] : [insertText, paste];
  for (const write of strategies) {
    await selectAll(el);
    write(el, text);
    await nextFrame();
    await nextFrame();
    if (composerHolds(el, text)) return true;
  }
  return false;
}

async function selectAll(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  // ProseMirror syncs its own selection from the DOM on selectionchange.
  await nextFrame();
}

function insertText(_el, text) {
  document.execCommand("insertText", false, text);
}

function paste(el, text) {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}
