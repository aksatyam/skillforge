# @skillforge/tenant-guard

The ONE way to run a database operation with tenant isolation.

## Why this exists

SkillForge is multi-tenant. Every DB query MUST be scoped to a tenant (`org_id`). The strategic plan lists tenant cross-contamination as a High-severity risk (§10).

This package makes "forgetting to filter by `org_id`" impossible at the application layer, and the Postgres RLS policies in migration `0001_init_rls` make it impossible at the DB layer.

## Usage

```ts
import { withTenant, TenantId } from '@skillforge/tenant-guard';

async function listAssessments(orgIdRaw: string) {
  const orgId = TenantId.from(orgIdRaw); // throws if not a UUID

  return withTenant(orgId, async (tx) => {
    return tx.assessment.findMany({
      // Notice: no `where: { orgId }` needed — RLS handles it.
      // But we still include it in code for defense in depth:
      where: { cycle: { orgId } },
    });
  });
}
```

## Cross-tenant operations

ONLY super_admin operations should cross tenant boundaries (ADR-007). Use `withoutTenant` — it writes an audit log row before running:

```ts
await withoutTenant(
  async (tx) => tx.organization.findMany(),
  { actorId: ctx.userId, reason: 'support escalation #1234' },
);
```

This is NOT to be used for regular application logic. Lint rule should flag any use outside of `services/*/src/admin/` paths.

## Testing

In tests, always call `assertTenantIsolation(orgA, orgB)` after setup to verify RLS is working:

```ts
import { assertTenantIsolation } from '@skillforge/tenant-guard';

beforeAll(async () => {
  // ... create two tenants with data ...
  await assertTenantIsolation(orgA, orgB);
});
```

## Architecture

```
App code
   │
   ▼
withTenant(orgId, fn)           ← application-level filter check
   │
   ▼
Prisma $transaction
   │
   ▼
SET LOCAL app.current_org_id    ← tells Postgres which tenant is active
   │
   ▼
fn(tx)                          ← runs queries
   │
   ▼
Postgres RLS policies           ← defense-in-depth filter
   │
   ▼
rows (tenant-scoped)
```

If application code forgets `withTenant`, queries go through raw `prisma.*` — RLS still filters because the GUC is unset → 0 rows. Fails safely.
