import { describe, expect, it, vi, beforeEach } from "vitest";
import { FeatureFlagService } from "../src/service";
import { FeatureFlagError } from "../src/errors";
import type { PrismaClientLike, RedisLike, FlagOverride } from "../src/types";

const ORG_A = "00000000-0000-0000-0000-00000000aaaa";
const ORG_B = "00000000-0000-0000-0000-00000000bbbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

/** In-memory stub of the featureFlagOverride model — matches PrismaClientLike. */
function makePrismaStub(initial: FlagOverride[] = []): PrismaClientLike & {
  _rows: FlagOverride[];
} {
  const rows: FlagOverride[] = [...initial];
  return {
    _rows: rows,
    featureFlagOverride: {
      // Real Prisma always returns plain POJOs, not live DB references.
      // Callers can safely hold onto findFirst results across writes.
      async findFirst({ where }) {
        const hit = rows.find(
          (r) =>
            r.flagKey === where.flagKey &&
            r.orgId === where.orgId &&
            r.userId === where.userId,
        );
        return hit ? { ...hit } : null;
      },
      async upsert({ where, create, update }) {
        const { flagKey, orgId, userId } = where.flagKey_orgId_userId;
        const existingIdx = rows.findIndex(
          (r) => r.flagKey === flagKey && r.orgId === orgId && r.userId === userId,
        );
        if (existingIdx >= 0) {
          rows[existingIdx] = {
            ...rows[existingIdx],
            enabled: update.enabled,
            updatedAt: new Date(),
          };
          return { ...rows[existingIdx] };
        }
        const row: FlagOverride = {
          flagKey: create.flagKey,
          orgId: create.orgId,
          userId: create.userId,
          enabled: create.enabled,
          updatedAt: new Date(),
        };
        rows.push(row);
        return { ...row };
      },
    },
  };
}

/** In-memory Redis stub. */
function makeRedisStub(): RedisLike & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(k) {
      return store.get(k) ?? null;
    },
    async set(k, v) {
      store.set(k, v);
      return "OK";
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) {
        if (store.delete(k)) n++;
      }
      return n;
    },
  };
}

describe("FeatureFlagService — isEnabled resolution order", () => {
  it("returns default when no overrides exist", async () => {
    const svc = new FeatureFlagService({ prisma: makePrismaStub() });
    expect(await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A })).toBe(false);
  });

  it("returns org override when present", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: true, updatedAt: new Date() },
    ]);
    const svc = new FeatureFlagService({ prisma });
    expect(await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A })).toBe(true);
  });

  it("user override beats org override", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: true, updatedAt: new Date() },
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: USER_1, enabled: false, updatedAt: new Date() },
    ]);
    const svc = new FeatureFlagService({ prisma });
    expect(await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A, userId: USER_1 })).toBe(false);
  });

  it("isolates tenants — ORG_B sees default when ORG_A is overridden on", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: true, updatedAt: new Date() },
    ]);
    const svc = new FeatureFlagService({ prisma });
    expect(await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A })).toBe(true);
    expect(await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_B })).toBe(false);
  });
});

describe("FeatureFlagService — validation", () => {
  it("throws UNKNOWN_FLAG for unregistered keys", async () => {
    const svc = new FeatureFlagService({ prisma: makePrismaStub() });
    await expect(
      // @ts-expect-error — intentionally testing runtime guard
      svc.isEnabled("totally_fake_flag", { orgId: ORG_A }),
    ).rejects.toBeInstanceOf(FeatureFlagError);
  });

  it("throws INVALID_SCOPE when orgId missing", async () => {
    const svc = new FeatureFlagService({ prisma: makePrismaStub() });
    await expect(
      svc.isEnabled("ai_suggestions_enabled", { orgId: "" }),
    ).rejects.toBeInstanceOf(FeatureFlagError);
  });

  it("throws INVALID_SCOPE when userId is an empty string", async () => {
    const svc = new FeatureFlagService({ prisma: makePrismaStub() });
    await expect(
      svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A, userId: "" }),
    ).rejects.toBeInstanceOf(FeatureFlagError);
  });
});

describe("FeatureFlagService — L1 cache", () => {
  it("second call does not re-hit Postgres within TTL", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: true, updatedAt: new Date() },
    ]);
    const spy = vi.spyOn(prisma.featureFlagOverride, "findFirst");
    const svc = new FeatureFlagService({ prisma, l1TtlMs: 1_000 });

    await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });
    await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });

    // Only the first call hits PG; the second is served from L1.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("re-hits Postgres after L1 TTL expires", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: true, updatedAt: new Date() },
    ]);
    const spy = vi.spyOn(prisma.featureFlagOverride, "findFirst");
    let clock = 1_000_000;
    const svc = new FeatureFlagService({ prisma, l1TtlMs: 100, now: () => clock });

    await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });
    clock += 200; // beyond TTL
    await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("FeatureFlagService — L2 Redis", () => {
  it("populates Redis on first miss and serves from it on subsequent non-L1 lookups", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: true, updatedAt: new Date() },
    ]);
    const redis = makeRedisStub();
    const setSpy = vi.spyOn(redis, "set");
    let clock = 1_000_000;
    const svc = new FeatureFlagService({
      prisma, redis, l1TtlMs: 50, l2TtlSec: 300, now: () => clock,
    });

    await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect([...redis._store.keys()][0]).toMatch(/^ff:v1:ai_suggestions_enabled/);

    // Expire L1, keep L2.
    clock += 1_000;
    const pgSpy = vi.spyOn(prisma.featureFlagOverride, "findFirst");
    const result = await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });
    expect(result).toBe(true);
    expect(pgSpy).not.toHaveBeenCalled(); // served from Redis
  });

  it("falls back to Postgres when Redis is down", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: true, updatedAt: new Date() },
    ]);
    const redis: RedisLike = {
      get: vi.fn(async () => { throw new Error("ECONNREFUSED"); }),
      set: vi.fn(async () => { throw new Error("ECONNREFUSED"); }),
      del: vi.fn(async () => { throw new Error("ECONNREFUSED"); }),
    };
    const svc = new FeatureFlagService({ prisma, redis });
    const result = await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });
    expect(result).toBe(true);
  });

  it("caches the 'no override' state via the 'null' sentinel", async () => {
    const prisma = makePrismaStub([]); // no overrides at all
    const redis = makeRedisStub();
    let clock = 1_000_000;
    const svc = new FeatureFlagService({
      prisma, redis, l1TtlMs: 50, l2TtlSec: 300, now: () => clock,
    });

    await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });
    // After first miss, Redis should hold "null" for this key
    const key = [...redis._store.keys()][0];
    expect(redis._store.get(key)).toBe("null");

    // Expire L1 and confirm Postgres is NOT re-hit (the null sentinel hits first)
    clock += 1_000;
    const pgSpy = vi.spyOn(prisma.featureFlagOverride, "findFirst");
    const result = await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A });
    expect(result).toBe(false); // resolves to default
    expect(pgSpy).not.toHaveBeenCalled();
  });
});

describe("FeatureFlagService — setOverride", () => {
  const auditCalls: unknown[] = [];
  const audit = vi.fn(async (entry: unknown) => { auditCalls.push(entry); });

  beforeEach(() => {
    auditCalls.length = 0;
    audit.mockClear();
  });

  it("inserts a new override + emits audit entry", async () => {
    const prisma = makePrismaStub();
    const svc = new FeatureFlagService({ prisma, audit });

    await svc.setOverride({
      flagKey: "ai_suggestions_enabled",
      orgId: ORG_A, userId: null, enabled: true,
      actorId: ADMIN, reason: "Qualtech canary start",
    });

    expect(prisma._rows).toHaveLength(1);
    expect(prisma._rows[0].enabled).toBe(true);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({
      action: "feature_flag.override_set",
      orgId: ORG_A,
      actorId: ADMIN,
      newValue: { enabled: true, userId: null },
      previousValue: null,
      rationale: "Qualtech canary start",
    });
  });

  it("updates an existing override + records previousValue in audit", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: false, updatedAt: new Date() },
    ]);
    const svc = new FeatureFlagService({ prisma, audit });

    await svc.setOverride({
      flagKey: "ai_suggestions_enabled",
      orgId: ORG_A, userId: null, enabled: true,
      actorId: ADMIN, reason: "enabling",
    });

    expect(prisma._rows).toHaveLength(1);
    expect(prisma._rows[0].enabled).toBe(true);
    expect(audit.mock.calls[0][0]).toMatchObject({
      previousValue: { enabled: false, userId: null },
      newValue: { enabled: true, userId: null },
    });
  });

  it("invalidates L1 + Redis caches after set", async () => {
    const prisma = makePrismaStub([
      { flagKey: "ai_suggestions_enabled", orgId: ORG_A, userId: null, enabled: false, updatedAt: new Date() },
    ]);
    const redis = makeRedisStub();
    const svc = new FeatureFlagService({ prisma, redis, audit });

    // Warm the caches with enabled=false
    expect(await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A })).toBe(false);
    expect(redis._store.size).toBe(1);

    // Flip via setOverride — caches must be invalidated
    await svc.setOverride({
      flagKey: "ai_suggestions_enabled",
      orgId: ORG_A, userId: null, enabled: true,
      actorId: ADMIN, reason: "flip",
    });

    expect(redis._store.size).toBe(0); // L2 deleted

    // Next read must reflect the new value (from PG since both caches cleared)
    expect(await svc.isEnabled("ai_suggestions_enabled", { orgId: ORG_A })).toBe(true);
  });

  it("refuses setOverride when constructed without audit fn", async () => {
    const svc = new FeatureFlagService({ prisma: makePrismaStub() });
    await expect(
      svc.setOverride({
        flagKey: "ai_suggestions_enabled",
        orgId: ORG_A, userId: null, enabled: true,
        actorId: ADMIN, reason: "no-audit-should-fail",
      }),
    ).rejects.toBeInstanceOf(FeatureFlagError);
  });
});
