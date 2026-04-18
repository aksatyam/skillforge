---
name: sf-tenant-check
description: Scan SkillForge backend code for missing tenant (org_id) filters in database queries, repositories, and SQL migrations. Use when the user asks to "check tenant isolation", "find missing org_id", "tenant leak check", or before a release.
---

# Tenant Isolation Checker

Scans the codebase for queries and migrations that risk cross-tenant data leakage. Multi-tenant isolation is the #1 invariant per `feedback_multi_tenant_rules.md`.

## What this skill checks

### Pattern 1 — Missing `org_id` in WHERE clauses

Flags queries that reference tenant-scoped tables without `org_id` / `orgId` in the filter:

- TypeORM: `repository.find({ where: { ... } })` without `orgId`
- Prisma: `prisma.<model>.findMany({ where: { ... } })` without `orgId`
- Raw SQL: `SELECT ... FROM <table>` without `WHERE ... org_id = ...`

### Pattern 2 — Controller methods without `@CurrentTenant()` / `TenantGuard`

Every controller method must either use the global `TenantGuard` OR explicitly declare `@AllowCrossTenant()`.

### Pattern 3 — Migrations missing `org_id`

For tables other than `organizations`, a `CREATE TABLE` migration lacking `org_id UUID NOT NULL REFERENCES organizations(id)` is a bug.

### Pattern 4 — React Query keys missing orgId

Frontend TanStack Query keys like `['assessments']` leak cache across tenants. Must be `['assessments', orgId, ...]`.

### Pattern 5 — Claude prompt templates with raw PII

Claude calls must strip names/emails. Flag any `prompts/**/*.md` or `*.ts` that references `user.name`, `user.email`, `user.phone` directly without going through `anonymize()`.

## Scan commands

```bash
# Pattern 1 — TypeORM/Prisma queries missing orgId
rg -t ts -n "\.(find|findOne|findMany|findFirst|update|delete|count|aggregate)\s*\(\s*\{[^}]*\}" backend/ \
  | rg -v "orgId"

# Pattern 2 — Controller methods without guards
rg -t ts -B2 "^\s*(Get|Post|Put|Patch|Delete)\s*\(" backend/ \
  | rg -B3 -A1 -v "TenantGuard|AllowCrossTenant"

# Pattern 3 — Migrations missing org_id
rg -l "CREATE TABLE" backend/migrations/ \
  | xargs -I{} sh -c 'grep -L "org_id" {} && echo "MISSING: {}"'

# Pattern 4 — Query keys without orgId
rg -t tsx -t ts -n "queryKey:\s*\[['\"]" frontend/ \
  | rg -v "orgId"

# Pattern 5 — PII in prompts
rg -n "user\.(name|email|phone)" backend/services/ai-evaluation/prompts/ backend/services/ai-evaluation/src/ \
  | rg -v "anonymize|stripPii|sha256"
```

## Workflow

1. Run each pattern scan.
2. For each hit, read the surrounding code to check if the filter is implicit (e.g., query goes through a base repository that injects `orgId`).
3. Produce a findings table: `file:line`, pattern, severity (Critical/High), suggested fix.
4. If any Critical findings: do NOT mark as safe for release. Fix first, rescan.

## Allowlist (legitimate exceptions)

Some queries legitimately cross tenants:
- Super-admin analytics that aggregate across orgs (must use `@AllowCrossTenant()` + audit log)
- Org registration flow (creates the first tenant row)
- Bias-detection cron job (reads many orgs' scoring patterns, anonymized)

Annotate these with a comment: `// @allow-cross-tenant: <reason>` — the scan should skip lines with this marker.

## Output

A markdown report at `reports/SF-TENANT-CHECK-<YYYYMMDD>.md` with:
- Total lines scanned
- Findings grouped by pattern
- Critical count (must be 0 to pass)
- File:line links

## Red flags that stop a release

- Any **Critical** (missing filter on tenant-scoped write operation)
- More than **5 High** (missing filter on read operations)
- Any migration creating a tenant-scoped table without `org_id`
