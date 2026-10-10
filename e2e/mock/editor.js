// Stand-in for logged-in chatgpt.com: a ProseMirror editor with no id inside a
// form, a submit button labelled "Send", and ChatGPT-style message editing (an
// "Edit" button opens a textarea with Cancel / Send). Sent prompts land in
// window.__sent; edits are prefixed with "edit:".
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "prosemirror-schema-basic";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, splitBlock } from "prosemirror-commands";

window.__sent = [];
const form = document.querySelector("form");
const log = document.getElementById("log");
const text = (state) => {
  const lines = [];
  state.doc.forEach((n) => lines.push(n.textContent));
  return lines.join("\n");
};

function reply(prompt) {
  const names = prompt.match(/\[[A-Z_]+_\d+\]/g) ?? [];
  const bot = document.createElement("div");
  bot.className = "msg bot";
  bot.textContent = names.length ? `I received ${names.join(", ")}.` : "I received no placeholders.";
  log.append(bot);
}

function userMessage(prompt) {
  const wrap = document.createElement("div");
  wrap.className = "turn";
  const bubble = document.createElement("div");
  bubble.className = "msg user";
  bubble.textContent = prompt;
  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => {
    const box = document.createElement("div");
    box.className = "edit";
    const area = document.createElement("textarea");
    area.value = bubble.textContent;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const send = document.createElement("button");
    send.type = "button";
    send.textContent = "Send";
    cancel.addEventListener("click", () => box.replaceWith(bubble));
    send.addEventListener("click", () => {
      window.__sent.push(`edit:${area.value}`);
      bubble.textContent = area.value;
      box.replaceWith(bubble);
      reply(area.value);
    });
    box.append(area, cancel, send);
    bubble.replaceWith(box);
    area.focus();
  });
  wrap.append(bubble, edit);
  log.append(wrap);
}

function send() {
  const prompt = text(view.state);
  if (!prompt.trim()) return true;
  window.__sent.push(prompt);
  userMessage(prompt);
  view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
  if (location.pathname === "/") history.pushState({}, "", "/c/abc123");
  reply(prompt);
  return true;
}

const view = new EditorView(form.querySelector(".mount"), {
  state: EditorState.create({ schema, plugins: [keymap({ Enter: send, "Shift-Enter": splitBlock }), keymap(baseKeymap)] }),
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  send();
});
