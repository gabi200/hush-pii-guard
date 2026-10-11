import { adoptStyles, mountPersistent } from "./mount.js";

// Asks what to do with attachments that contain personal information (or that
// couldn't be scanned). A modal <dialog> in a shadow root: it sits in the top
// layer above the site's own overlays, traps focus and closes on Escape.

const CSS = `
:host { all: initial; }
dialog {
  box-sizing: border-box;
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 18px;
  border-radius: 14px;
  background: #18181b;
  color: #fafafa;
  border: 1px solid rgb(255 255 255 / 0.14);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.35);
  font: 400 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
dialog::backdrop { background: rgb(0 0 0 / 0.45); }
h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
.lede { margin: 0 0 14px; color: #a1a1aa; }
ul { list-style: none; margin: 0 0 16px; padding: 0; }
li { padding: 10px 0; border-top: 1px solid rgb(255 255 255 / 0.1); }
li:last-child { border-bottom: 1px solid rgb(255 255 255 / 0.1); }
.file { display: flex; align-items: baseline; gap: 8px; }
.name { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.summary { flex: none; margin-left: auto; color: #a1a1aa; }
.summary[data-tone="found"] { color: #86efac; }
.summary[data-tone="error"] { color: #fca5a5; }
.found { margin: 6px 0 0; color: #d4d4d8; overflow-wrap: anywhere; }
.found b { font-weight: 600; color: #a1a1aa; }
.note { margin: 4px 0 0; color: #a1a1aa; font-size: 12px; }
code { font: 500 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #86efac; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
button {
  all: unset;
  box-sizing: border-box;
  padding: 7px 12px;
  border-radius: 8px;
  background: #3f3f46;
  color: #fafafa;
  font-weight: 600;
  cursor: pointer;
}
button:hover { background: #52525b; }
button.primary { background: #16a34a; }
button.primary:hover { background: #15803d; }
button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
button[hidden] { display: none; }
`;

function el(tag, props = {}, ...children) {
  const { dataset, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
}

export function createFileDialog() {
  let dialog = null;
  let queue = Promise.resolve();

  function build() {
    const host = document.createElement("rampart-files");
    const root = host.attachShadow({ mode: "open" });
    adoptStyles(root, CSS);
    dialog = el("dialog");
    dialog.innerHTML = `
      <h2 id="title"></h2>
      <p class="lede"></p>
      <ul></ul>
      <div class="actions">
        <button type="button" value="cancel">Cancel</button>
        <button type="button" value="original"></button>
        <button type="button" value="redact" class="primary"></button>
      </div>`;
    dialog.setAttribute("aria-labelledby", "title");
    root.append(dialog);
    mountPersistent(host);
  }

  /**
   * rows: [{ name, tone: "found" | "clean" | "error", summary, found?: [label, values[]][], note? }]
   * Resolves to "redact", "original" or "cancel".
   */
  function show({ title, lede, rows, redactLabel, originalLabel }) {
    if (!dialog) build();
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector(".lede").textContent = lede;
    dialog.querySelector("ul").replaceChildren(
      ...rows.map((row) =>
        el(
          "li",
          {},
          el(
            "div",
            { className: "file" },
            el("span", { className: "name", textContent: row.name }),
            el("span", { className: "summary", textContent: row.summary, dataset: { tone: row.tone } }),
          ),
          ...(row.found?.length
            ? [el("p", { className: "found" }, ...row.found.flatMap(([label, values], i) => [i ? " · " : "", el("b", { textContent: `${label}: ` }), values.join(", ")]))]
            : []),
          ...(row.note ? [el("p", { className: "note" }, ...row.note)] : []),
        ),
      ),
    );
    const redact = dialog.querySelector('[value="redact"]');
    redact.hidden = !redactLabel;
    redact.textContent = redactLabel ?? "";
    dialog.querySelector('[value="original"]').textContent = originalLabel;

    return new Promise((resolve) => {
      const buttons = [...dialog.querySelectorAll("button")];
      const done = (choice) => {
        for (const button of buttons) button.onclick = null;
        dialog.oncancel = null;
        dialog.close();
        resolve(choice);
      };
      for (const button of buttons) button.onclick = () => done(button.value);
      dialog.oncancel = (event) => {
        event.preventDefault();
        done("cancel");
      };
      dialog.showModal();
      (redactLabel ? redact : buttons[0]).focus();
    });
  }

  return {
    // One dialog at a time; a second batch of files waits for the first.
    ask(options) {
      const result = queue.then(() => show(options));
      queue = result.catch(() => {});
      return result;
    },
  };
}
