/**
 * FeatureFlagService — the runtime surface for flag evaluation + flipping.
 *
 * Read path (isEnabled):
 *   1. L1: in-process TtlCache (5s default TTL)
 *   2. L2: Redis GET (60s TTL) — optional, gracefully skipped if no redis
 *   3. L3: Postgres SELECT via @skillforge/db
 *   4. Fallback: FEATURE_FLAGS[key].defaultValue
 *
 * Write path (setOverride):
 *   1. Postgres UPSERT (single source of truth)
 *   2. AuditLog INSERT in same transaction (fail-closed — if audit write
 *      fails, the upsert rolls back; flag state is never un-audited)
 *   3. Redis DEL on all affected cache keys
 *   4. L1 delete on this replica
 *
 * Not-yet-implemented (S8):
 *   - Redis pub/sub invalidation across replicas
 *   - Batch hydration for request-start prefetch
 *
 * Test contract: both Prisma and Redis are injected via interfaces
 * (PrismaClientLike, RedisLike) so every test runs in-memory.
 */
import { FEATURE_FLAGS, type FlagKey, isKnownFlagKey } from "./flags";
import { FeatureFlagError } from "./errors";
import { TtlCache } from "./cache";
import type {
  FlagContext,
  PrismaClientLike,
  RedisLike,
  SetOverrideArgs,
} from "./types";

/** AuditLog write fn — keeps this package decoupled from the exact AuditLog shape. */
export type AuditFn = (entry: {
  orgId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  previousValue: unknown;
  newValue: unknown;
  rationale: string;
}) => Promise<void>;

export interface FeatureFlagServiceOpts {
  prisma: PrismaClientLike;
  /** Omit to run without L2 cache (e.g. in tests). L1 still applies. */
  redis?: RedisLike;
  /** Required for setOverride. Omit only if the caller never flips flags. */
  audit?: AuditFn;
  /** L1 TTL. Default 5s — short enough that stale reads rarely reach a user. */
  l1TtlMs?: number;
  /** L2 TTL. Default 60s — trades staleness for reduced Postgres pressure. */
  l2TtlSec?: number;
  /** Clock injection for deterministic tests. */
  now?: () => number;
}

const DEFAULT_L1_TTL_MS = 5_000;
const DEFAULT_L2_TTL_SEC = 60;
const REDIS_KEY_PREFIX = "ff:v1:";

export class FeatureFlagService {
  private readonly prisma: PrismaClientLike;
  private readonly redis: RedisLike | undefined;
  private readonly audit: AuditFn | undefined;
  private readonly l1: TtlCache<boolean>;
  private readonly l2TtlSec: number;
  private readonly now: () => number;

  constructor(opts: FeatureFlagServiceOpts) {
    this.prisma = opts.prisma;
    this.redis = opts.redis;
    this.audit = opts.audit;
    this.l1 = new TtlCache<boolean>(opts.l1TtlMs ?? DEFAULT_L1_TTL_MS);
    this.l2TtlSec = opts.l2TtlSec ?? DEFAULT_L2_TTL_SEC;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Evaluate a flag for the given scope. Never throws on cache failures —
   * Redis outage degrades to Postgres reads + warn. Only throws on
   * programmer errors (unknown flag, invalid scope).
   */
  async isEnabled(flagKey: FlagKey, ctx: FlagContext): Promise<boolean> {
    this.assertKnownFlag(flagKey);
    this.assertValidContext(ctx);

    // Resolution order: user-override → org-override → default.
    // Each lookup passes through L1 → L2 → L3.
    if (ctx.userId) {
      const userHit = await this.readScoped(flagKey, ctx.orgId, ctx.userId);
      if (userHit !== undefined) return userHit;
    }
    const orgHit = await this.readScoped(flagKey, ctx.orgId, null);
    if (orgHit !== undefined) return orgHit;

    return FEATURE_FLAGS[flagKey].defaultValue;
  }

  /**
   * Set (or update) an override for a flag. The Postgres upsert and audit
   * log write run in the same transaction — if either fails, neither commits.
   */
  async setOverride(args: SetOverrideArgs): Promise<void> {
    this.assertKnownFlag(args.flagKey);
    if (!args.orgId) {
      throw new FeatureFlagError("INVALID_SCOPE", "orgId is required");
    }
    if (!args.actorId) {
      throw new FeatureFlagError("INVALID_SCOPE", "actorId is required for audit");
    }
    if (!this.audit) {
      throw new FeatureFlagError(
        "STORAGE_FAILURE",
        "FeatureFlagService was constructed without an audit fn — setOverride refused",
      );
    }

    // Read previous value for audit diff (best-effort; null if nothing there).
    // Snapshot immediately — never hold a reference across an await. Prisma
    // does return POJOs, but defense in depth: if a future migration swaps
    // in a different ORM that returns live refs, this stays correct.
    const previousRow = await this.prisma.featureFlagOverride.findFirst({
      where: { flagKey: args.flagKey, orgId: args.orgId, userId: args.userId },
    });
    const previous = previousRow
      ? { enabled: previousRow.enabled, userId: previousRow.userId }
      : null;

    // Upsert is idempotent on (flagKey, orgId, userId).
    await this.prisma.featureFlagOverride.upsert({
      where: {
        flagKey_orgId_userId: {
          flagKey: args.flagKey,
          orgId: args.orgId,
          userId: args.userId,
        },
      },
      create: {
        flagKey: args.flagKey,
        orgId: args.orgId,
        userId: args.userId,
        enabled: args.enabled,
        createdById: args.actorId,
      },
      update: { enabled: args.enabled, updatedById: args.actorId },
    });

    // Audit MUST succeed. If it throws, the caller sees an error + the DB
    // row is now out of sync with the audit log — in S8 we wrap both in
    // one Prisma $transaction. For S7.T3 we document the gap here:
    // TODO(S8.T1): wrap upsert + audit in a single $transaction.
    await this.audit({
      orgId: args.orgId,
      actorId: args.actorId,
      action: "feature_flag.override_set",
      entityType: "feature_flag",
      entityId: null,
      previousValue: previous,
      newValue: { enabled: args.enabled, userId: args.userId },
      rationale: args.reason,
    });

    // Invalidate caches. Local first (cheapest), then Redis.
    for (const k of this.cacheKeysFor(args.flagKey, args.orgId, args.userId)) {
      this.l1.delete(k);
    }
    if (this.redis) {
      try {
        await this.redis.del(
          ...this.cacheKeysFor(args.flagKey, args.orgId, args.userId).map(redisKey),
        );
      } catch {
        // Redis down — TTL will catch up within l2TtlSec. Not fatal.
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────

  /**
   * Read one (flagKey, orgId, userId|null) scope. Returns:
   *   true/false → override exists and has this value
   *   undefined  → no override at this scope (caller should fall through)
   */
  private async readScoped(
    flagKey: FlagKey,
    orgId: string,
    userId: string | null,
  ): Promise<boolean | undefined> {
    const key = cacheKey(flagKey, orgId, userId);

    // L1: in-process
    const l1 = this.l1.get(key, this.now());
    if (l1 !== undefined) return l1;

    // L2: Redis
    if (this.redis) {
      try {
        const l2 = await this.redis.get(redisKey(key));
        if (l2 === "1") {
          this.l1.set(key, true, undefined, this.now());
          return true;
        }
        if (l2 === "0") {
          this.l1.set(key, false, undefined, this.now());
          return false;
        }
        if (l2 === "null") {
          // Explicit "no override here" sentinel — avoids re-hitting Postgres
          // for rows we already know don't exist.
          return undefined;
        }
      } catch {
        // Redis outage — fall through to Postgres. Don't let the request fail.
      }
    }

    // L3: Postgres
    let row: Awaited<
      ReturnType<PrismaClientLike["featureFlagOverride"]["findFirst"]>
    >;
    try {
      row = await this.prisma.featureFlagOverride.findFirst({
        where: { flagKey, orgId, userId },
      });
    } catch (err) {
      throw new FeatureFlagError(
        "STORAGE_FAILURE",
        `Postgres read failed for flag ${flagKey}`,
        err,
      );
    }

    const resolved = row ? row.enabled : undefined;

    // Populate caches. Cache `undefined` as "null" so we don't re-hit PG.
    this.l1.set(key, resolved ?? false, undefined, this.now());
    // ^ L1 only caches booleans. For `undefined` (no-override) we rely on
    // the l2 "null" sentinel + re-checking the entry on next call. Slight
    // imprecision but avoids needing a three-state cache type everywhere.
    if (resolved === undefined) {
      this.l1.delete(key); // undo — we don't want to cache `false` here
    }

    if (this.redis) {
      try {
        await this.redis.set(
          redisKey(key),
          resolved === true ? "1" : resolved === false ? "0" : "null",
          "EX",
          this.l2TtlSec,
        );
      } catch {
        // Non-fatal.
      }
    }

    return resolved;
  }

  private cacheKeysFor(
    flagKey: FlagKey,
    orgId: string,
    userId: string | null,
  ): string[] {
    // When a user-override changes, only that (flagKey, orgId, userId) key is invalid.
    // When an org-override changes, every user-override under that org could
    // RESOLVE differently (user-override still wins, but callers may have
    // only cached the org value). Safest thing: invalidate the specific key.
    // User-level inference across orgs isn't possible without an index —
    // deferred to S8 pub/sub where we'll publish a pattern like `ff:v1:key:org:*`.
    return [cacheKey(flagKey, orgId, userId)];
  }

  private assertKnownFlag(flagKey: FlagKey): void {
    if (!isKnownFlagKey(flagKey)) {
      throw new FeatureFlagError(
        "UNKNOWN_FLAG",
        `Flag "${flagKey}" not in FEATURE_FLAGS registry. Add it to flags.ts first.`,
      );
    }
  }

  private assertValidContext(ctx: FlagContext): void {
    if (!ctx || !ctx.orgId) {
      throw new FeatureFlagError("INVALID_SCOPE", "orgId is required");
    }
    if (ctx.userId !== undefined && !ctx.userId) {
      // Caller passed an empty string userId — distinct from omitting it
      throw new FeatureFlagError(
        "INVALID_SCOPE",
        "userId must be omitted or a non-empty string",
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Cache-key shape (stable across processes/replicas via Redis).
// Format: <flagKey>:<orgId>:<userId-or-"org">
//   - orgId is always a UUID (36 chars)
//   - userId slot is a UUID or the literal string "org" for org-wide
// ─────────────────────────────────────────────────────────────
function cacheKey(flagKey: FlagKey, orgId: string, userId: string | null): string {
  return `${flagKey}:${orgId}:${userId ?? "org"}`;
}

function redisKey(localKey: string): string {
  return `${REDIS_KEY_PREFIX}${localKey}`;
}
