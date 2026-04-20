import type { FlagKey } from "./flags";

/**
 * Scope for flag evaluation. `orgId` is always required because even
 * system-shipped defaults may be overridden per-org. `userId` is optional —
 * presence signals "check user-level override first, then org, then default".
 */
export interface FlagContext {
  readonly orgId: string;
  readonly userId?: string;
}

export interface FlagOverride {
  readonly flagKey: FlagKey;
  readonly orgId: string;
  /** null = org-wide override; non-null = single-user override (for canary/A-B) */
  readonly userId: string | null;
  readonly enabled: boolean;
  readonly updatedAt: Date;
}

/** Minimal interface for Redis-like cache. Lets us stub in tests without ioredis. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSec: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

/** Minimal Prisma interface — lets us stub in tests. */
export interface PrismaClientLike {
  featureFlagOverride: {
    findFirst(args: {
      where: { flagKey: FlagKey; orgId: string; userId: string | null };
    }): Promise<FlagOverride | null>;
    upsert(args: {
      where: { flagKey_orgId_userId: { flagKey: FlagKey; orgId: string; userId: string | null } };
      create: {
        flagKey: FlagKey;
        orgId: string;
        userId: string | null;
        enabled: boolean;
        createdById: string;
      };
      update: { enabled: boolean; updatedById: string };
    }): Promise<FlagOverride>;
  };
}

export interface SetOverrideArgs {
  readonly flagKey: FlagKey;
  readonly orgId: string;
  /** null = org-wide override; non-null = single-user override */
  readonly userId: string | null;
  readonly enabled: boolean;
  /** Actor performing the flip — goes into audit log */
  readonly actorId: string;
  /** Human-readable reason — also goes into audit log */
  readonly reason: string;
}
