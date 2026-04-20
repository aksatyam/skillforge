/**
 * @skillforge/pii — public surface
 *
 * Per ADR-013 §Decision 2 (option 2d): regex anonymizer now, Presidio sidecar
 * as a drop-in replacement behind `IAnonymizer` if the recall test fails.
 *
 * Usage — always depend on `IAnonymizer`, never the concrete class:
 *
 *   import { createAnonymizer, type IAnonymizer } from "@skillforge/pii";
 *
 *   const anonymizer: IAnonymizer = createAnonymizer();
 *   const { clean, replacements } = await anonymizer.anonymize(transcript);
 *   // `clean` is safe to send to Claude; `replacements` stays server-side for audit.
 */
export { PLACEHOLDER_PREFIX } from "./types";
export type { IAnonymizer, AnonymizeOptions, AnonymizeResult, Replacement, PiiClass } from "./types";
export { RegexAnonymizer } from "./regex-anonymizer";
export { SafeAnonymizeResult } from "./safe-result";

import { RegexAnonymizer } from "./regex-anonymizer";
import type { IAnonymizer } from "./types";

/**
 * Factory for the default anonymizer. Callers MUST type the result as
 * `IAnonymizer` so the Presidio swap (ADR-014 placeholder) stays mechanical.
 *
 * Usage:
 *   const anonymizer: IAnonymizer = createAnonymizer();
 */
export function createAnonymizer(): IAnonymizer {
  return new RegexAnonymizer();
}
