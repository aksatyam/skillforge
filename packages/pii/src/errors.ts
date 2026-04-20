/**
 * Errors thrown by anonymizer implementations.
 *
 * Why a dedicated class: NestJS exception filters + audit logging can
 * distinguish anonymizer failures from generic Errors, and the AI-evaluation
 * module's circuit breaker uses `instanceof AnonymizerError` to decide whether
 * to retry or hard-fail the suggestion.
 */

export type AnonymizerErrorCode =
  | "DETECTOR_CRASH"
  | "INPUT_TOO_LARGE"
  | "INVALID_OPTIONS"
  | "GAZETTEER_MISSING";

export class AnonymizerError extends Error {
  readonly code: AnonymizerErrorCode;
  readonly cause?: unknown;

  constructor(code: AnonymizerErrorCode, message: string, cause?: unknown) {
    super(`[${code}] ${message}`);
    this.name = "AnonymizerError";
    this.code = code;
    this.cause = cause;

    // Preserve prototype chain across extended classes in transpiled CommonJS.
    Object.setPrototypeOf(this, AnonymizerError.prototype);
  }
}
