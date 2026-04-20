export type FeatureFlagErrorCode =
  | "UNKNOWN_FLAG"        // key not in FEATURE_FLAGS registry
  | "INVALID_SCOPE"       // missing orgId, or userId without orgId
  | "CACHE_UNAVAILABLE"   // Redis down — fell back to Postgres
  | "STORAGE_FAILURE";    // Postgres read/write failed

export class FeatureFlagError extends Error {
  readonly code: FeatureFlagErrorCode;
  readonly cause?: unknown;
  constructor(code: FeatureFlagErrorCode, message: string, cause?: unknown) {
    super(`[${code}] ${message}`);
    this.name = "FeatureFlagError";
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, FeatureFlagError.prototype);
  }
}
