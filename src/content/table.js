// Per-conversation placeholder table. ChatGuard keeps its table private and
// in memory, so replies would stop being revealed after a reload. This one is
// plain data, persisted (encrypted, via the background) per conversation.

export const PLACEHOLDER_PATTERN = /\[[A-Z][A-Z_]*_\d+\]/g;

const normalize = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const keyOf = (label, value) => `${label}|${normalize(value)}`;

export class PlaceholderTable {
  constructor(data = {}) {
    this.values = data.values ?? {}; // "[GIVEN_NAME_1]" -> "Alex"
    this.tokens = data.tokens ?? {}; // "GIVEN_NAME|alex" -> "[GIVEN_NAME_1]"
    this.counters = data.counters ?? {}; // "GIVEN_NAME" -> 1
    this.skipped = new Set(data.skipped ?? []); // "GIVEN_NAME|alex": user chose not to redact
  }

  get size() {
    return Object.keys(this.values).length;
  }

  /** The token this value has, or would get on its next redaction. */
  peekToken(label, value) {
    return this.tokens[keyOf(label, value)] ?? `[${label}_${(this.counters[label] ?? 0) + 1}]`;
  }

  tokenFor(label, value) {
    const key = keyOf(label, value);
    let token = this.tokens[key];
    if (token === undefined) {
      const n = (this.counters[label] ?? 0) + 1;
      this.counters[label] = n;
      token = `[${label}_${n}]`;
      this.tokens[key] = token;
      this.values[token] = value;
    }
    return token;
  }

  isSkipped(label, value) {
    return this.skipped.has(keyOf(label, value));
  }

  setSkipped(label, value, skipped) {
    if (skipped) this.skipped.add(keyOf(label, value));
    else this.skipped.delete(keyOf(label, value));
  }

  /** `spans` must be sorted and non-overlapping (the offscreen detector guarantees it). */
  redact(text, spans) {
    let out = "";
    let cursor = 0;
    for (const { start, end, label } of spans) {
      out += text.slice(cursor, start) + this.tokenFor(label, text.slice(start, end));
      cursor = end;
    }
    return out + text.slice(cursor);
  }

  lookup(token) {
    return Object.hasOwn(this.values, token) ? this.values[token] : undefined;
  }

  toJSON() {
    return { values: this.values, tokens: this.tokens, counters: this.counters, skipped: [...this.skipped] };
  }
}
