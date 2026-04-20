/**
 * @skillforge/pii — types
 *
 * Stable interface boundary. Per ADR-013 §Decision 2 (option 2d), we ship a regex
 * anonymizer today and reserve the Presidio sidecar as a drop-in replacement if the
 * recall test fails. Both implementations MUST implement `IAnonymizer`.
 *
 * Do not add fields to `PiiClass` without updating:
 *   - every IAnonymizer implementation
 *   - the fixture corpus under test/fixtures/
 *   - the AI Champion review checklist (docs/ops/ai-champion-review.md)
 */

/**
 * The closed set of PII classes we recognize. Ordered by detection priority:
 * earlier classes are checked first, so more-specific patterns (e.g. Aadhaar)
 * win over broader ones (e.g. generic phone) when a run of digits matches both.
 */
export type PiiClass =
  | "email"
  | "phone_in" // Indian mobile/landline
  | "phone_intl" // non-Indian international format
  | "pan" // Indian PAN, 10 alphanumeric
  | "aadhaar" // Indian Aadhaar, 12 digit
  | "employee_id" // internal e.g. QT-12345
  | "person_name"
  | "url_with_user";

/**
 * One anonymization hit. Offsets refer to the INPUT string (pre-anonymization)
 * so auditors can overlay redactions without re-running the anonymizer.
 */
export interface Replacement {
  class: PiiClass;
  /** Original substring that was redacted. Never logged; kept in-memory only. */
  original: string;
  /** Placeholder that replaced it, e.g. "<EMAIL_1>". Stable within one call. */
  placeholder: string;
  /** Inclusive start offset in the input string. */
  start: number;
  /** Exclusive end offset in the input string. */
  end: number;
}

/**
 * Options passed per-call. Implementations MAY ignore any of these but MUST
 * document which they respect in their JSDoc.
 */
export interface AnonymizeOptions {
  /**
   * Additional allowlist of names to recognize as PII beyond the gazetteer.
   * Typically populated from the current org's user directory (first names).
   */
  extraNames?: readonly string[];

  /**
   * If true, replacements reuse the SAME placeholder for the SAME original value
   * within one call — e.g. two mentions of "Ravi Kumar" both become "<NAME_1>".
   * If false, each occurrence gets a fresh index: "<NAME_1>", "<NAME_2>".
   *
   * Default: true (better for LLM reasoning coherence).
   */
  consistentPlaceholders?: boolean;

  /**
   * If provided, PII classes NOT in this set are left untouched. Use to narrow
   * the anonymizer for a specific call site — e.g. a URL-validation prompt that
   * genuinely needs email addresses in-tact.
   *
   * CAUTION: bypassing a class here is an auditable decision. Every caller
   * passing this option must cite the ADR-013 exception in a code comment.
   */
  onlyClasses?: readonly PiiClass[];
}

/**
 * Result of an anonymization call. Implementations MUST guarantee:
 *   - `clean` contains no original PII substrings that the implementation claimed to redact
 *   - `replacements` covers every substitution made in `clean`
 *   - applying each `replacement` in reverse offset order to `original` reproduces `clean`
 */
export interface AnonymizeResult {
  clean: string;
  replacements: readonly Replacement[];
}

/**
 * Stable interface across implementations. The regex impl is v1; Presidio sidecar
 * is the v2 upgrade path per ADR-014 (placeholder). Downstream code MUST depend on
 * this interface, not the concrete class — otherwise the swap becomes expensive.
 */
export interface IAnonymizer {
  /**
   * Anonymize `input` for outbound AI calls. Contract decisions (locked 2026-04-20,
   * ADR-013-amend-1):
   *
   *   1. **Async** — returns `Promise<AnonymizeResult>`. Keeps the Presidio sidecar
   *      swap (ADR-014 placeholder) mechanical: RegexAnonymizer just resolves
   *      synchronously-produced data, Presidio awaits the RPC.
   *
   *   2. **Throws on internal failure** — any detector-level failure surfaces as
   *      a thrown `AnonymizerError` (see ./errors.ts). Call sites wrapping AI
   *      invocations MUST let this propagate — a detector crash MUST NOT
   *      silently produce an empty-replacements result that then sends raw PII
   *      to Claude. NestJS global exception filter logs + returns 5xx; the
   *      specific AI call is retried without anonymization only if a break-glass
   *      flag is set (not in Phase 2.1).
   *
   *   3. **`replacements` is exposed** but lives inside `SafeAnonymizeResult`,
   *      which overrides `toJSON()`, `toString()`, and the Node
   *      `util.inspect.custom` symbol to redact originals. Auditors reach the
   *      raw data via `result.replacements` explicitly; logs, JSON dumps,
   *      template literals all get redacted forms by default.
   *
   * @throws AnonymizerError when a detector misbehaves mid-run. Callers in the
   *         AI-evaluation path MUST NOT catch-and-continue.
   */
  anonymize(input: string, options?: AnonymizeOptions): Promise<AnonymizeResult>;
}

/**
 * Placeholder string shape. Downstream prompts should prefer these tokens over
 * ad-hoc "[REDACTED]" strings so the LLM can reason about references:
 *   "<EMAIL_1>", "<NAME_1>", "<PAN_1>", ...
 *
 * The number is 1-indexed within each class per call.
 */
export const PLACEHOLDER_PREFIX: Record<PiiClass, string> = {
  email: "EMAIL",
  phone_in: "PHONE",
  phone_intl: "PHONE",
  pan: "PAN",
  aadhaar: "AADHAAR",
  employee_id: "EMP_ID",
  person_name: "NAME",
  url_with_user: "URL",
};
