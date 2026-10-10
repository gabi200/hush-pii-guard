// Per-site DOM hooks. These selectors are the part most likely to break when
// ChatGPT or Claude ship a UI update; each list is tried in order.

export const SITES = [
  {
    name: "chatgpt",
    hosts: ["chatgpt.com", "chat.openai.com"],
    composer: [
      'textarea[name="prompt"]',
      "textarea[data-mobile-composer-prompt]",
      '#prompt-textarea[contenteditable="true"]',
      "textarea#prompt-textarea",
      // Logged-in builds have shipped the editor with no id or test id.
      'form div.ProseMirror[contenteditable="true"]',
      'form [contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"]',
    ],
    send: [
      "button[data-composer-submit]",
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
    ],
    conversationId: () => location.pathname.match(/\/c\/([\w-]+)/)?.[1] ?? null,
  },
  {
    name: "claude",
    hosts: ["claude.ai"],
    composer: [
      'div[contenteditable="true"][data-testid="chat-input"]',
      'fieldset div.ProseMirror[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
    ],
    send: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'button[data-testid="send-button"]',
    ],
    conversationId: () => location.pathname.match(/\/chat\/([\w-]+)/)?.[1] ?? null,
  },
];

export function currentSite() {
  return SITES.find((site) => site.hosts.includes(location.hostname)) ?? null;
}

// The main composer sits below the conversation, so when a selector also
// matches inline "edit message" editors, the last match is the composer.
// Hidden fallback inputs (display:none textareas kept for no-JS or drafts) are
// skipped: the visible editor is the one the user types into.
export function findComposer(site) {
  for (const selector of site.composer) {
    const matches = [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length > 0);
    if (matches.length > 0) return matches[matches.length - 1];
  }
  return null;
}

// Prefer a send button in the composer's own form, then anywhere on the page,
// then whatever submits that form.
export function findSendButton(site, composer = findComposer(site)) {
  const form = composer?.closest("form");
  for (const scope of form ? [form, document] : [document]) {
    for (const selector of site.send) {
      const button = scope.querySelector(selector);
      if (button && !button.hidden) return button;
    }
  }
  return form?.querySelector('button[type="submit"]:not([hidden])') ?? null;
}
