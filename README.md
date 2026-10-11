# Hush - PII Guard (Chrome extension)

Redacts personal information on-device before it is sent to ChatGPT or Claude,
using [`@nationaldesignstudio/rampart`](https://www.npmjs.com/package/@nationaldesignstudio/rampart),
and shows the real values again in the conversation, on your screen only.

## Install (developer mode)

Hush isn't on the Chrome Web Store yet, so it's installed as an "unpacked"
extension in developer mode. You need **Google Chrome 116 or newer**, on any
operating system.

### Option A: from the ready-made zip (no tools needed)

1. Download `hush-<version>.zip` from the
   [latest release](https://github.com/gabi200/hush-pii-guard/releases/latest)
   and unzip it into a folder you'll keep, for example `Documents/hush`.
   Chrome loads the extension from this folder every time it starts, so
   **don't delete or move it** after installing.
2. Continue with [Load it into Chrome](#load-it-into-chrome) below, and pick that folder.

### Option B: build from source

Requires [Node.js](https://nodejs.org/) 20 or newer (which includes npm).

```bash
cd path/to/this/folder
npm install
npm run build
```

This creates the `dist/` folder. That folder is the extension.

### Load it into Chrome

1. Open a new tab and go to `chrome://extensions`.
2. Turn on **Developer mode** with the switch in the top-right corner.
3. Click **Load unpacked** (top-left).
4. Select the folder: `dist/` if you built it, or the folder you unzipped into.
   Pick the folder that directly contains `manifest.json`.
5. **Hush - PII Guard** now appears in the list. Optionally, click the puzzle-piece
   icon in Chrome's toolbar and pin Hush, so its icon (which opens the settings
   page) is always visible.

### Check that it works

1. Open [chatgpt.com](https://chatgpt.com) or [claude.ai](https://claude.ai).
   If either was already open, refresh the tab.
2. A dark **Hush** pill appears in the bottom-right corner. The first time, it
   shows "Loading model…" for a few seconds while it downloads the model
   (about 15 MB, only once).
3. Type `my name is John Doe and my number is +40722567222`. The name and number
   should be highlighted green, and the pill should say "3 to redact".

If the pill doesn't appear, see [Troubleshooting](#troubleshooting).

### Updating to a new version

1. Replace the extension's files: unzip the new version over the same folder,
   or pull the new code and run `npm run build` again.
2. On `chrome://extensions`, click the **reload** icon (circular arrow) on the
   Hush card.
3. Refresh any open ChatGPT or Claude tabs.

Your settings and saved values are kept across updates. They live in Chrome,
not in the folder.

### Uninstalling

On `chrome://extensions`, click **Remove** on the Hush card. This also deletes
all of its settings and saved values from Chrome. You can then delete the folder.

### Troubleshooting

- **No pill on the page:** refresh the tab. Pages that were open before you
  installed or reloaded Hush don't have it yet.
- **The pill says "Error · reload the page"** (or "Hush was updated. Reload
  this page." when you send): refresh the tab. This happens after the extension
  was reloaded or updated while the tab was open.
- **Stuck on "Loading model…":** the model is downloaded from Hugging Face on
  first use, so check your internet connection, or whether a firewall blocks
  `huggingface.co`. The settings page (Hush toolbar icon) shows the model status.
- **"Patterns only" in the pill:** the model failed to load, so only emails,
  URLs, IPs, SSNs and card numbers are detected. The settings page shows the reason.
- **Highlights appear but nothing is replaced when sending:** check that the
  switch on the pill is green. If it is, the site may have changed its page
  layout; see `src/content/sites.js`.
- **Chrome warns about "developer mode extensions" on startup:** this is
  normal for extensions installed this way. Click **Keep** (or close the
  message) to carry on using Hush.
- **"Manifest file is missing or unreadable" when loading:** you selected the
  wrong folder. Pick the one that directly contains `manifest.json`.

Other Chromium browsers (Edge, Brave, Opera) have the same developer-mode
install at `edge://extensions`, `brave://extensions` and so on, but Hush has
only been tested in Chrome.

### Packaging for the Chrome Web Store

`npm run package` builds and writes `hush-<version>.zip` (no source maps), which is
also the zip used in Option A. Bump `version` in `src/manifest.json` before each
upload; the store rejects a version it has already seen. The listing text and
privacy policy are in `store/`.

The icon source is `src/icons/icon.svg`; after editing it, regenerate the PNGs
with `node e2e/render-icons.mjs`.

## Using it

A **Hush** pill appears in the bottom-right of chatgpt.com and claude.ai
(drag it to move it). The first run downloads the ~15 MB model from Hugging
Face; after that it is cached.

- **Switch on (green):** detected items are highlighted green while you type.
  When you send, they are replaced with placeholders like `[GIVEN_NAME_1]`, so
  the AI never sees them. This covers the main message box and the boxes for
  editing an earlier message.
- **Switch off:** detected items are highlighted amber, but the message is sent as typed.
- **Hover a highlight** to see what it is and what the AI will receive. Click
  **Don't redact** to send that value as typed in this conversation (shown with
  a grey dashed underline; hover it again to undo).
- **Restored values** in the conversation have a green tint. Hovering one shows
  the placeholder the AI actually received.
- **Eye button:** switch between real values and placeholders, so you can
  see exactly what the AI received.
- **Gear button:** opens the settings page.

### Attached files

When the switch is on, files you attach (file picker, drag and drop, or paste)
are scanned before the site receives them. Hush reads plain-text formats
(`.txt`, `.md`, `.csv`, `.tsv`, `.json`, `.xml`, `.html`, `.log`, `.yaml`,
`.eml`, `.vcf`, …), PDFs with a text layer, and Word `.docx` files (including
headers, footers, footnotes, comments and deleted tracked changes). It also
checks the file name.

- **Nothing found:** the file is attached as usual.
- **Personal information found:** a dialog lists what was found, per file.
  **Attach redacted copy** replaces each item with the same placeholders used for
  messages, so replies show the real values. A text file keeps its format; a PDF
  or Word file becomes a plain-text copy (`letter.pdf` → `letter.txt`), since
  Hush can't edit those formats in place. **Attach original** sends the file
  unchanged, and **Cancel** (or Escape) attaches nothing.
- **Couldn't scan** (password-protected or scanned-image PDF, damaged file, over
  20 MB or about 300,000 characters): the dialog says so, and the file is attached
  only if you choose **Attach anyway**.

Other files, such as images, spreadsheets and archives, are attached unchecked.
While a file is being scanned the pill shows progress, and sending is held until
it finishes.

If redaction fails for any reason, the message is **not** sent and the pill says why.

## Settings page

- The two switches above, also available here.
- **Scan attached files:** turn off to attach files without checking them.
- **Categories:** uncheck a kind of information (URLs, IP addresses, street
  names, …) to stop detecting it everywhere. Unchecked categories aren't
  highlighted and are sent as typed.
- **Model status and backend:** Automatic (WebGPU when the GPU supports it),
  WebGPU, or WASM. WebGPU has to find the name in a test sentence at startup;
  if it errors or gives wrong results, Hush falls back to WASM and says so here.
- **Saved conversations:** each conversation's placeholders and values, so
  replies can be restored after a reload. View or delete one, or delete all.
  Values are encrypted (AES-GCM) with a key that can't be exported from the
  extension. That keeps plain-text PII out of the browser's storage files; it
  doesn't protect against malware running inside your browser profile.

## How it fits together

| File | Role |
| --- | --- |
| `src/offscreen.js` | Hosts the model (one copy for all tabs), picks WebGPU or WASM, runs detection |
| `src/extract.js` | Text of PDF (PDF.js) and Word files, run in the offscreen page |
| `src/background.js` | Starts the model page, relays messages, encrypts saved tables |
| `src/options.html`, `src/options.js` | Settings page |
| `src/content/index.js` | Finds the boxes to protect, highlights, intercepts send, restores values |
| `src/content/sites.js` | Per-site selectors (update these when a site's UI changes) |
| `src/content/hovercard.js` | The card shown when hovering a highlight |
| `src/content/overlay.js` | Draws highlights over a `<textarea>` |
| `src/content/table.js` | Placeholder table: tokens, values, skipped items |
| `src/content/attachments.js` | Holds attached files (picker, drop, paste) while they are scanned, then replays them |
| `src/content/filedialog.js` | The dialog shown when an attachment contains personal information |

## Tests

```bash
npm run build                       # tests load dist/
cd e2e && npm install && npm run build:mock
export CHROME=/path/to/chromium
node features.mjs        # every feature, against a mock of logged-in ChatGPT
GPU=1 node features.mjs  # same, with a (software) WebGPU adapter available
node mock-chatgpt.mjs    # basic redact-and-restore flow
node real-chatgpt.mjs    # live, logged-out chatgpt.com; the request is blocked, nothing is sent
```

## Limitations

- Images, spreadsheets, slides and voice input are not checked. Scanned PDFs
  (images of text, no text layer) can't be checked and need **Attach anyway**.
- A redacted PDF or Word file is sent as plain text, without layout or images.
- Files are caught only through file inputs on the page, drops and pastes. A site
  that uploads through an input it never adds to the page bypasses the check.
- Copy buttons on the sites copy the placeholder text, not the real values.
- "Don't redact" applies per conversation; in a new chat it starts unskipped.
- The sites' markup changes often; when the pill stops reacting, the selectors in
  `src/content/sites.js` need updating. Claude has not been tested logged in.
- Non-Latin-script names are poorly detected (see Rampart's own README).
