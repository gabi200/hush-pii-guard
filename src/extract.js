// Plain text of attached documents, so they can be scanned like a message.
// Runs in the offscreen page: PDF.js needs a worker, which the chat sites'
// pages can't start from extension code.

import { strFromU8, unzipSync } from "fflate";

export async function extractText(kind, bytes, limit) {
  if (kind === "pdf") return extractPdf(bytes, limit);
  if (kind === "docx") return extractDocx(bytes);
  throw new Error(`Unsupported document type: ${kind}`);
}

// ---- PDF -------------------------------------------------------------------

let pdfjs = null;

// Loaded on first use and kept out of the bundle: it is large and only PDFs need it.
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(chrome.runtime.getURL("pdfjs/pdf.mjs"));
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdfjs/pdf.worker.mjs");
  }
  return pdfjs;
}

async function extractPdf(bytes, limit) {
  const { getDocument } = await loadPdfjs();
  const task = getDocument({
    data: bytes,
    // CID fonts (common in CJK documents) need their CMaps to map glyphs to text.
    cMapUrl: chrome.runtime.getURL("pdfjs/cmaps/"),
    cMapPacked: true,
    isEvalSupported: false,
  });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (err) {
    await task.destroy();
    if (err?.name === "PasswordException") throw new Error("it is password-protected");
    throw new Error("it isn't a readable PDF");
  }
  try {
    let text = "";
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { items } = await page.getTextContent();
      page.cleanup();
      if (n > 1) text += "\n\n";
      for (const item of items) text += (item.str ?? "") + (item.hasEOL ? "\n" : "");
      // Stop early instead of extracting hundreds of pages that won't be scanned.
      if (text.length > limit) break;
    }
    return text;
  } finally {
    await task.destroy();
  }
}

// ---- Word (.docx) ------------------------------------------------------------

// Every part a reader of the document can see, body first. Headers often hold
// a letterhead with the author's name and contact details.
const DOCX_PARTS = ["document", "header", "footer", "footnotes", "endnotes", "comments"];
const DOCX_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;
// Formatting containers; their <w:tab> children are tab stops, not tabs.
const DOCX_SKIP = new Set(["pPr", "rPr", "sectPr", "tblPr", "trPr", "tcPr"]);

function extractDocx(bytes) {
  let parts;
  try {
    parts = unzipSync(bytes, { filter: (file) => DOCX_PART.test(file.name) });
  } catch {
    throw new Error("it isn't a readable Word document");
  }
  if (!parts["word/document.xml"]) throw new Error("it isn't a readable Word document");
  const rank = (name) => DOCX_PARTS.findIndex((part) => name.startsWith(`word/${part}`));
  return Object.keys(parts)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((name) => wordText(strFromU8(parts[name])))
    .join("\n\n");
}

function wordText(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("it isn't a readable Word document");
  let out = "";
  const walk = (node) => {
    for (const child of node.children) {
      switch (child.localName) {
        // Deleted tracked changes are invisible in Word but still in the file.
        case "t":
        case "delText":
          out += child.textContent;
          break;
        case "tab":
          out += "\t";
          break;
        case "br":
        case "cr":
          out += "\n";
          break;
        default:
          if (DOCX_SKIP.has(child.localName)) break;
          walk(child);
          if (child.localName === "p" && !out.endsWith("\n")) out += "\n";
      }
    }
  };
  walk(doc.documentElement);
  return out;
}
