/**
 * @skillforge/tenant-guard
 *
 * The ONE way to run a database operation with tenant isolation enforced.
 * Every service MUST route DB reads/writes through `withTenant(orgId, fn)`.
 *
 * Under the hood it:
 *   1. Opens a Prisma transaction
 *   2. Runs `SET LOCAL app.current_org_id = '<uuid>'` (consumed by RLS policies in migration 0001)
 *   3. Runs the provided callback with a tenant-scoped client
 *
 * This is defense-in-depth on top of application-level `where: { orgId }` filters.
 * See ADR-002 and memory/feedback_multi_tenant_rules.md.
 */
import { prisma, PrismaClient, Prisma } from '@skillforge/db';

/**
 * Branded type — you cannot construct a TenantId without going through
 * `TenantId.from(...)` which validates UUID shape. Prevents accidentally
 * passing a user ID or random string where a tenant ID is expected.
 */
export type TenantId = string & { readonly __brand: unique symbol };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TenantId = {
  from(value: string): TenantId {
    if (!UUID_RE.test(value)) {
      throw new Error(`Invalid TenantId: ${value.slice(0, 8)}…`);
    }
    return value as TenantId;
  },
};

/**
 * A Prisma transaction client that has `app.current_org_id` set.
 * RLS policies will filter every query automatically.
 */
export type TenantScopedClient = Prisma.TransactionClient;

/**
 * Run `fn` inside a transaction with the tenant context set.
 *
 * @example
 *   const users = await withTenant(orgId, async (tx) => {
 *     return tx.user.findMany({ where: { deletedAt: null } });
 *   });
 */
export async function withTenant<T>(
  orgId: TenantId,
  fn: (tx: TenantScopedClient) => Promise<T>,
  opts?: { client?: PrismaClient; timeoutMs?: number },
): Promise<T> {
  const client = opts?.client ?? prisma;
  return client.$transaction(
    async (tx) => {
      // SET LOCAL so it auto-resets at end of tx; safe against connection pooling.
      // Use $executeRawUnsafe because $executeRaw escapes the UUID as a literal
      // which breaks `SET LOCAL <guc> = ...` syntax.
      await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${orgId}'`);
      return fn(tx);
    },
    {
      // Default 10s; AI-heavy analytics queries can override.
      timeout: opts?.timeoutMs ?? 10_000,
    },
  );
}

/**
 * Escape hatch for super-admin cross-tenant operations.
 * MUST be called with an audit log row recorded separately.
 *
 * This does NOT bypass RLS — it runs queries outside a tenant context,
 * which means RLS policies will return 0 rows unless the DB role has
 * BYPASSRLS (which we only grant to `skillforge_admin`, not `skillforge`).
 *
 * For truly cross-tenant queries (e.g., bias detection cron), use the
 * admin role by instantiating a PrismaClient with the `DATABASE_URL_ADMIN`
 * env var.
 */
export async function withoutTenant<T>(
  fn: (tx: TenantScopedClient) => Promise<T>,
  audit: { actorId: string; reason: string; route?: string },
  opts?: { client?: PrismaClient },
): Promise<T> {
  const client = opts?.client ?? prisma;

  // Emit an audit log row BEFORE the operation. If the audit insert fails,
  // we do not run the operation — fail closed.
  await client.auditLog.create({
    data: {
      // orgId is required on audit_log — use a sentinel UUID for cross-tenant ops.
      // The app treats this as "no tenant" and the RLS policy allows it for admin roles.
      orgId: '00000000-0000-0000-0000-000000000000',
      actorId: audit.actorId,
      action: 'cross_tenant_access',
      entityType: 'system',
      rationale: `${audit.reason}${audit.route ? ` (route: ${audit.route})` : ''}`,
    },
  });

  return client.$transaction(async (tx) => fn(tx));
}

/**
 * Dev-only sanity check. Call this from tests to verify RLS is actually
 * preventing cross-tenant reads.
 */
export async function assertTenantIsolation(
  tenantA: TenantId,
  tenantB: TenantId,
): Promise<void> {
  const [countA, countB] = await Promise.all([
    withTenant(tenantA, async (tx) => tx.user.count()),
    withTenant(tenantB, async (tx) => tx.user.count()),
  ]);
  if (countA === 0 && countB === 0) {
    throw new Error(
      'assertTenantIsolation: both tenants returned 0 users — RLS likely blocking everything. ' +
        'Verify `app.current_org_id` GUC is being set.',
    );
  }
  // Positive control: with no tenant set, RLS should hide all rows.
  const unsetCount = await prisma.user.count();
  if (unsetCount > 0) {
    throw new Error(
      'assertTenantIsolation: unset-tenant query returned rows — RLS is NOT enforced!',
    );
  }
}
