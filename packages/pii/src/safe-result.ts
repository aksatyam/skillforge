import type { AnonymizeResult, Replacement } from "./types";

/**
 * Concrete result type for the anonymizer.
 *
 * The raison d'être of this class is **log-time safety**. The `replacements`
 * array contains original PII substrings — the whole reason we anonymized in
 * the first place. If it leaks into logs, we've defeated our own purpose.
 *
 * Node.js loggers (pino, winston) reach into objects via one of three code
 * paths:
 *
 *   1. `JSON.stringify(obj)` — calls `obj.toJSON()` if present
 *   2. `util.inspect(obj)` (console.log, util.inspect) — calls
 *      `obj[util.inspect.custom]` if present
 *   3. ``${obj}`` or `String(obj)` — calls `obj.toString()`
 *
 * We override all three to redact `replacements` by default. Audit code that
 * genuinely needs the raw data calls `result.replacements` explicitly; no log
 * path will ever reach it.
 */

// Re-export the conventional symbol name without taking a runtime import of
// `util` in environments (e.g. browser-side tests) where it's unavailable.
// Node's global `Symbol.for('nodejs.util.inspect.custom')` is what `util.inspect`
// actually checks, so using `Symbol.for()` directly is equivalent.
const INSPECT_SYMBOL = Symbol.for("nodejs.util.inspect.custom");

export class SafeAnonymizeResult implements AnonymizeResult {
  readonly clean: string;
  readonly replacements: readonly Replacement[];

  constructor(clean: string, replacements: readonly Replacement[]) {
    this.clean = clean;
    this.replacements = Object.freeze([...replacements]);
  }

  /** Used by `JSON.stringify` and most structured loggers. */
  toJSON(): { clean: string; replacements: Array<Omit<Replacement, "original"> & { original: "<redacted>" }> } {
    return {
      clean: this.clean,
      replacements: this.replacements.map((r) => ({
        class: r.class,
        placeholder: r.placeholder,
        start: r.start,
        end: r.end,
        original: "<redacted>" as const,
      })),
    };
  }

  /** Used by `util.inspect` and therefore by `console.log` in Node. */
  [INSPECT_SYMBOL](): string {
    return `SafeAnonymizeResult { clean: ${JSON.stringify(this.clean)}, replacements: [${this.replacements.length} <redacted>] }`;
  }

  /** Used by template literals and `String(result)`. */
  toString(): string {
    return `SafeAnonymizeResult(clean-len=${this.clean.length}, replacements=${this.replacements.length} <redacted>)`;
  }
}
