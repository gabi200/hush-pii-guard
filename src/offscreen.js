// Hosts the Rampart classifier. Content scripts can't run it themselves: the
// chat sites' CSPs and per-tab memory cost make an extension page the right home.

import { env } from "@huggingface/transformers";
import {
  applyPolicy,
  detectHeuristics,
  detectNer,
  loadNerClassifier,
  premask,
  projectMaskedSpan,
} from "@nationaldesignstudio/rampart";
import { extractText } from "./extract.js";

// MV3 forbids remotely hosted code, so ONNX Runtime's wasm is bundled in ort/.
// Model weights are data and still download from Hugging Face (then cached).
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("ort/");
// SharedArrayBuffer needs cross-origin isolation, which extension pages lack.
env.backends.onnx.wasm.numThreads = 1;

const params = new URLSearchParams(location.search);
// "fellBack" records what was asked for when WebGPU failed and we reloaded as WASM.
const preference = params.get("fellBack") ?? params.get("device") ?? "auto";
const device = params.get("device") === "wasm" ? "wasm" : null;
const fallback = params.get("why"); // why WebGPU was abandoned, if it was
let status = { phase: "loading", device: null, preference, fallback };

async function webgpuAvailable() {
  try {
    return Boolean(await navigator.gpu?.requestAdapter());
  } catch {
    return false;
  }
}

// A sentence the model reliably labels; WebGPU must reproduce the name in it.
const CANARY = "My name is Alex Rivera and my email is alex@example.com.";
const CANARY_NAME = { start: CANARY.indexOf("Alex"), end: CANARY.indexOf("Alex") + 4 };

// WebGPU is used when asked for (or on "auto") and the GPU offers an adapter.
// Some GPUs create a session and run without errors yet return wrong results
// for the q4 kernels (seen as "no entities at all"), which would silently turn
// redaction off. So the warm-up must actually find the canary's name.
// A failed WebGPU attempt can leave ONNX Runtime unusable in this page, so the
// fallback is a fresh page running WASM (offscreen pages can't navigate).
async function loadClassifier() {
  if (device !== "wasm" && preference !== "wasm" && (await webgpuAvailable())) {
    let why;
    try {
      const classifier = await loadNerClassifier({ device: "webgpu" });
      const spans = await detectNer(CANARY, classifier);
      if (spans.some((s) => s.start <= CANARY_NAME.start && s.end >= CANARY_NAME.end)) {
        status = { phase: "ready", device: "webgpu", preference, fallback };
        return classifier;
      }
      why = "wrong-results";
      console.warn("Hush: WebGPU returned wrong results, restarting on WASM", spans);
    } catch (err) {
      why = "error";
      console.warn("Hush: WebGPU failed, restarting on WASM", err);
    }
    // The background closes this page and opens a WASM one; requests in
    // flight are retried there.
    chrome.runtime.sendMessage({ target: "background", type: "offscreen:fallback", why });
    return new Promise(() => {});
  }
  const classifier = await loadNerClassifier({ device: "wasm" });
  status = { phase: "ready", device: "wasm", preference, fallback };
  return classifier;
}

const classifierReady = loadClassifier().catch((err) => {
  console.error("Hush: model failed to load, falling back to pattern detection", err);
  status = { phase: "heuristics", device: null, preference, reason: String(err?.message ?? err) };
  return null;
});

// Mirrors ChatGuard's private detect(): heuristics first, then the model on the
// premasked text, then the default-deny policy. We need the spans themselves
// (for highlighting and our own persisted placeholder table), not just the
// scrubbed string ChatGuard.protect() returns.
async function detect(text) {
  const heuristic = detectHeuristics(text);
  let spans = heuristic;
  const classifier = await classifierReady;
  if (classifier) {
    const map = premask(text, heuristic);
    const masked = await detectNer(map.masked, classifier);
    const contextual = masked.map((s) => projectMaskedSpan(s, text, map)).filter((s) => s !== null);
    spans = [...heuristic, ...contextual];
  }
  return applyPolicy(spans)
    .map(({ start, end, label }) => ({ start, end, label }))
    .sort((a, b) => a.start - b.start);
}

// ONNX Runtime sessions don't accept concurrent runs; serialize requests.
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return;
  if (message.type === "status") {
    sendResponse(status);
    return;
  }
  if (message.type === "detect") {
    enqueue(() => detect(message.text)).then(
      (spans) => sendResponse({ spans, phase: status.phase }),
      (err) => sendResponse({ error: String(err?.message ?? err) }),
    );
    return true;
  }
  // Not queued behind the model: extraction doesn't touch ONNX Runtime.
  if (message.type === "extract") {
    fetch(message.data)
      .then((response) => response.arrayBuffer())
      .then((buffer) => extractText(message.kind, new Uint8Array(buffer), message.limit))
      .then(
        (text) => sendResponse({ text }),
        (err) => sendResponse({ error: String(err?.message ?? err) }),
      );
    return true;
  }
});
