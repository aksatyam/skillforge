/**
 * @skillforge/feature-flags — public API
 *
 * Usage (service side):
 *   const flags = new FeatureFlagService({ prisma, redis, audit });
 *   if (await flags.isEnabled("ai_suggestions_enabled", { orgId })) { ... }
 *
 * Usage (admin side):
 *   await flags.setOverride({
 *     flagKey: "ai_suggestions_enabled",
 *     orgId, userId: null, enabled: true,
 *     actorId: admin.id, reason: "Qualtech canary — sprint 8 start",
 *   });
 *
 * See ADR-013 §S7.T3 for rollout plan.
 */
export { FEATURE_FLAGS, FLAG_KEYS, isKnownFlagKey } from "./flags";
export type { FlagKey, FlagDefinition } from "./flags";
export { FeatureFlagService } from "./service";
export type { FeatureFlagServiceOpts, AuditFn } from "./service";
export { FeatureFlagError } from "./errors";
export type { FeatureFlagErrorCode } from "./errors";
export type {
  FlagContext,
  FlagOverride,
  RedisLike,
  PrismaClientLike,
  SetOverrideArgs,
} from "./types";
export { TtlCache } from "./cache";
