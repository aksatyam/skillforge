# ADR-002: Multi-tenant isolation via Postgres RLS on a single schema

- **Status**: Proposed (default pick)
- **Date**: 2026-04-18
- **Deciders**: Tech Lead
- **Context tag**: D2

## Context

Plan §3.3 suggests "schema-per-tenant in PostgreSQL." Phase 1 has exactly one tenant (Qualtech), and Phase 3 will add external clients. We need to pick the tenancy model that supports Phase 3 without making Phase 1 operationally expensive.

## Options considered

### Option A — Schema-per-tenant
- Pros: strongest isolation; simplest to reason about; Postgres-native backup/restore per tenant.
- Cons: N-fold migration complexity; cross-tenant analytics needs union-all views; code must manage connection routing; Prisma support is weak.

### Option B — Row-level security (RLS) on single schema (chosen)
- Pros: single migration runs once; cross-tenant analytics is a normal SQL query (for authorized roles); Prisma works cleanly; ops is simpler.
- Cons: application bugs can leak if RLS policies are misconfigured; requires setting `app.current_org_id` on every connection.

### Option C — Hybrid (schema-per-tenant for PII-heavy, shared for catalog)
- Pros: best of both.
- Cons: highest complexity; Phase 1 doesn't need it.

## Decision

Use **Option B — RLS on single schema**.

Every tenant-scoped table has:
1. `org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
2. RLS enabled with policy: `USING (org_id = current_setting('app.current_org_id')::uuid)`
3. Application sets `SET LOCAL app.current_org_id = '<uuid>'` at the start of every request transaction (via NestJS interceptor).

The `tenant-guard` shared package enforces that `app.current_org_id` is set before any DB query fires. Queries without it will fail at the DB level (defense-in-depth).

For Phase 3 external clients requiring hard isolation (regulated industries), we can migrate individual tenants to dedicated databases — but only after the RLS approach proves insufficient.

## Consequences

**Easier**:
- Migrations run once.
- Bias detection, cross-org analytics (for authorized super-admin roles) are normal queries.
- Prisma works without modification.

**Harder**:
- Every query path must go through the tenant-context middleware — enforce via CI scan (`sf-tenant-check`).
- RLS policies must be audited during every security review (`sf-security-audit`).

**Risks**:
- Misconfigured RLS is the #1 leak vector — add integration tests that assert cross-tenant queries return 0 rows.

**Follow-ups**:
- Write RLS integration tests in Sprint 1.
- Document the `SET LOCAL app.current_org_id` pattern in the tenant-guard package README.
