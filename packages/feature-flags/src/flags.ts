/**
 * Flag registry — SOURCE OF TRUTH for every flag in the product.
 *
 * Adding a flag = code change (PR review is the approval gate). The DB
 * stores only per-org / per-user *deviations* from the default here.
 * This inversion of the usual "all config in DB" pattern is deliberate:
 * any production flag configuration must be knowable from reading this
 * file + the audit log of overrides. Never guessable.
 *
 * Rules for adding a new flag:
 *   1. Add the key to the FLAG_KEYS union below
 *   2. Add an entry to FEATURE_FLAGS with default=false (fail-closed) and
 *      a one-line description explaining WHAT it gates, not HOW
 *   3. PR description must include the rollout plan: which orgs first,
 *      success criteria, abort criteria
 *   4. Service code checks via `featureFlags.isEnabled(key, { orgId, userId })`
 *   5. Flag removal = another PR that deletes the key + its overrides row
 */

// The string literal union is the type system's enforcement that callers
// pass a known flag key. Typos become compile errors, not silent "false".
export type FlagKey =
  | "ai_suggestions_enabled";

export interface FlagDefinition {
  readonly key: FlagKey;
  readonly description: string;
  /** Fail-closed: unknown scope returns this value. Every new flag defaults false. */
  readonly defaultValue: boolean;
  /**
   * Rollout strategy hint — informational, not enforced at the service level.
   * 'canary_by_org' means the operator flips it per-org; 'canary_by_user' means
   * per-user (A/B) overrides are expected.
   */
  readonly rollout: "canary_by_org" | "canary_by_user" | "global_only";
}

export const FEATURE_FLAGS: Readonly<Record<FlagKey, FlagDefinition>> = {
  ai_suggestions_enabled: {
    key: "ai_suggestions_enabled",
    description:
      "Gates ALL Phase 2.1 AI suggestion surfaces: artifact analysis calls, " +
      "AiSuggestion row writes, manager-facing suggestion badge. When false, " +
      "the system behaves exactly as Phase 1.0 (pure manager scoring).",
    defaultValue: false,
    rollout: "canary_by_org",
  },
};

export const FLAG_KEYS: readonly FlagKey[] = Object.keys(FEATURE_FLAGS) as FlagKey[];

export function isKnownFlagKey(key: string): key is FlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, key);
}
