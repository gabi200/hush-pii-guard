// Attached files are caught on their way in (file picker, drag and drop,
// paste), held back while they are scanned, then handed to the site again as
// a replayed event: as they were, redacted, or not at all.
//
// Only files on <input> elements in the page are seen; an input the site never
// attaches to the document fires its events where these listeners can't hear.

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_EXTENSIONS = new Set([
  "txt", "text", "md", "markdown", "csv", "tsv", "json", "jsonl", "ndjson",
  "xml", "html", "htm", "log", "yaml", "yml", "ini", "toml", "sql", "eml", "vcf", "ics",
]);
const TEXT_TYPES = new Set(["text/plain", "text/csv", "text/tab-separated-values", "text/markdown", "text/html", "text/vcard"]);

export const extensionOf = (name) => name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";

/** "text" | "pdf" | "docx" for files Hush can read, null for anything else (images, archives, …). */
export function kindOf(file) {
  const ext = extensionOf(file.name);
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  if (ext === "docx" || file.type === DOCX_MIME) return "docx";
  if (TEXT_EXTENSIONS.has(ext) || TEXT_TYPES.has(file.type)) return "text";
  return null;
}

/** A text file's contents: UTF-16 when it has a byte-order mark, else UTF-8, else Windows-1252. */
export async function readText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// Extension messages are JSON, so documents travel to the offscreen page as data URLs.
export function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const isFileInput =(el) => el instanceof HTMLInputElement && el.type === "file";

function transfer(files, strings = []) {
  const data = new DataTransfer();
  for (const [type, value] of strings) data.setData(type, value);
  for (const file of files) data.items.add(file);
  return data;
}

/**
 * `active()` says whether to scan at all. `handle(files)` resolves to the files
 * to attach, or null to attach nothing; if it throws, nothing is attached.
 */
export function watchAttachments({ active, handle, onError }) {
  let replaying = false;
  const wanted = (files) => files?.length > 0 && active() && [...files].some(kindOf);

  function replay(dispatch) {
    replaying = true;
    try {
      dispatch();
    } finally {
      replaying = false;
    }
  }

  function run(files, finish) {
    handle(files).then(
      (out) => finish(out?.length ? out : null),
      (err) => {
        onError(err);
        finish(null);
      },
    );
  }

  // File picker. Chrome fires "input" then "change"; both are held and replayed.
  addEventListener(
    "input",
    (event) => {
      if (!replaying && isFileInput(event.target) && wanted(event.target.files)) event.stopImmediatePropagation();
    },
    true,
  );
  addEventListener(
    "change",
    (event) => {
      const input = event.target;
      if (replaying || !isFileInput(input) || !wanted(input.files)) return;
      event.stopImmediatePropagation();
      run([...input.files], (out) => {
        if (!out) {
          input.value = "";
          return;
        }
        input.files = transfer(out).files;
        replay(() => {
          input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    },
    true,
  );

  // Drag and drop. The original event is cancelled so the browser doesn't open
  // the file; the replay goes to the same element (or whatever is there now).
  addEventListener(
    "drop",
    (event) => {
      if (replaying || !wanted(event.dataTransfer?.files)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = event.composedPath()[0];
      const { clientX, clientY, screenX, screenY } = event;
      const init = { bubbles: true, cancelable: true, composed: true, clientX, clientY, screenX, screenY };
      run([...event.dataTransfer.files], (out) => {
        const at = target instanceof Node && target.isConnected ? target : document.elementFromPoint(clientX, clientY);
        if (!at) return;
        // On cancel, a dragleave lets the site take down its drop overlay.
        const replayed = out
          ? new DragEvent("drop", { ...init, dataTransfer: transfer(out) })
          : new DragEvent("dragleave", { ...init, dataTransfer: new DataTransfer() });
        replay(() => at.dispatchEvent(replayed));
      });
    },
    true,
  );

  // Pasted files. Other clipboard formats are read now, while they still can be.
  addEventListener(
    "paste",
    (event) => {
      const clipboard = event.clipboardData;
      if (replaying || !wanted(clipboard?.files)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = event.composedPath()[0];
      const strings = clipboard.types.filter((type) => type !== "Files").map((type) => [type, clipboard.getData(type)]);
      run([...clipboard.files], (out) => {
        if (!out || !(target instanceof Node) || !target.isConnected) return;
        const replayed = new ClipboardEvent("paste", { clipboardData: transfer(out, strings), bubbles: true, cancelable: true, composed: true });
        replay(() => target.dispatchEvent(replayed));
      });
    },
    true,
  );
}
