# ADR-001: Use Prisma as the ORM

- **Status**: Proposed (default pick pending Architecture Workshop 2026-04-20)
- **Date**: 2026-04-18
- **Deciders**: Tech Lead (pre-workshop default by Ashish Kumar Satyam)
- **Context tag**: D1

## Context

We need an ORM for PostgreSQL across ~5 NestJS services. The team is expected to include devs of mixed seniority, and the 6-week hyper-MVP deadline puts a premium on ramp-up speed and safe schema evolution.

## Options considered

### Option A — TypeORM
- Pros: decorator-based, feels native in NestJS, mature, supports schema-per-tenant cleanly via per-request `DataSource`.
- Cons: types drift from schema easily, migration tooling is weaker than Prisma, repository API has known sharp edges (partial updates, find options).

### Option B — Prisma (chosen)
- Pros: generated types always in sync with schema; migration tooling is the best in the ecosystem (`prisma migrate dev/deploy`); excellent DX; large community + tutorials for onboarding mid-level devs.
- Cons: multi-tenant via schema-per-tenant is awkward (have to generate N clients or use raw SQL); adds a codegen step (`prisma generate`) to the build pipeline.

### Option C — Drizzle
- Pros: lightest, pure TS, no codegen.
- Cons: smaller community, fewer tutorials; mid-level devs will onboard slower.

## Decision

Use **Prisma** with `schema.prisma` at the monorepo root (single source of truth), generated client published as `@skillforge/db`.

This decision is paired with **ADR-002 (tenancy via RLS on single schema)** — Prisma's weakness on schema-per-tenant is neutralized because we're not using schema-per-tenant.

## Consequences

**Easier**:
- New-dev onboarding; type safety across FE/BE through shared generated types.
- Schema migrations (one command, rollback support).
- Review diffs — schema.prisma is highly readable.

**Harder**:
- Some advanced Postgres features (partial indexes with specific expressions) need raw SQL in migrations.
- If we ever move to schema-per-tenant, migration will be painful — ADR-002 must be revisited together.

**Follow-ups**:
- Set up `prisma generate` in CI and pre-commit (so committed types match schema).
- Document the "always filter by org_id" invariant with a lint rule if possible.
