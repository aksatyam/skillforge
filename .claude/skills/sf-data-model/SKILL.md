---
name: sf-data-model
description: Generate or update SkillForge database entities, migrations, and Prisma/TypeORM schemas based on the 10-entity core data model from the plan. Use when the user asks to "create a migration", "add an entity", "update the schema", "generate DTO", or mentions any of the core entities (Organization, User, Competency Framework, Role Mapping, Assessment Cycle, Assessment, Artifact, Peer Review, Learning Recommendation, Prompt Library Entry).
---

# Data Model Generator

Generates migrations, entities, and DTOs aligned with the canonical data model defined in memory (`reference_data_model.md`).

## Core entities (canonical list)

| Entity | Table | Tenant column | Notable columns |
|---|---|---|---|
| Organization | `organizations` | self | `name`, `domain`, `subscription_plan`, `settings_json` |
| User | `users` | `org_id` | `email`, `role_family`, `designation`, `manager_id` |
| Competency Framework | `competency_frameworks` | `org_id` | `name`, `version`, `maturity_levels_json`, `status` |
| Role Mapping | `role_mappings` | via framework | `role_family`, `target_level`, `assessment_criteria_json` |
| Assessment Cycle | `assessment_cycles` | `org_id` | `name`, `start_date`, `end_date`, `status` |
| Assessment | `assessments` | via cycle | `user_id`, `self_score`, `manager_score`, `peer_score`, `ai_score`, `composite_score`, `status` |
| Artifact | `artifacts` | via assessment | `file_url`, `artifact_type`, `ai_analysis_json` |
| Peer Review | `peer_reviews` | via assessment | `reviewer_id`, `ratings_json`, `comments` |
| Learning Recommendation | `learning_recommendations` | via assessment | `skill_gap`, `recommended_resource`, `priority` |
| Prompt Library Entry | `prompt_library_entries` | `org_id` | `title`, `prompt_text`, `category`, `rating`, `usage_count` |

## Standard columns on every table

- `id` — UUID primary key, default `gen_random_uuid()`
- `org_id` — UUID, FK to `organizations(id)` with `ON DELETE CASCADE` (except `organizations` itself)
- `created_at` — `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at` — `TIMESTAMPTZ NOT NULL DEFAULT now()` with trigger to auto-update
- `created_by` — UUID FK to `users(id)`, nullable for system-created rows
- `deleted_at` — `TIMESTAMPTZ NULL` — soft delete
- `version` — `INTEGER NOT NULL DEFAULT 1` — optimistic locking

## Required indexes

- Every `org_id` column → B-tree index
- Every FK column → B-tree index
- `users.email` → unique per `(org_id, email)`
- `assessments(cycle_id, user_id)` → unique (one assessment per user per cycle)
- `artifacts.ai_analysis_json` → GIN if we query JSONB fields frequently

## Row-Level Security (RLS)

All tenant-scoped tables should have RLS enabled with policy:

```sql
CREATE POLICY tenant_isolation ON <table>
  USING (org_id = current_setting('app.current_org_id')::uuid);
```

Application sets `app.current_org_id` per-connection at the start of each request — belt and suspenders on top of application-level filters.

## Workflow

1. Ask what entity to generate/modify.
2. Generate the migration SQL with standard columns, indexes, RLS policy.
3. Generate the TypeORM/Prisma entity class under `backend/services/<service>/src/<domain>/entities/`.
4. Generate matching DTOs (`create.dto.ts`, `update.dto.ts`, `response.dto.ts`) with `class-validator`.
5. Suggest the TanStack Query hooks needed on the frontend side.

## Critical rules

- **Never** add a table without `org_id` (except `organizations`).
- **Never** add a foreign key without an index.
- **Never** skip the `deleted_at` soft-delete column — DPDP right-to-erasure may require hard deletes later, but default to soft.
- JSONB columns must have a zod/TypeScript type contract documented alongside the entity.

## Learning opportunity

**Question**: Two decisions I want your call on before generating migrations:

1. **ORM**: TypeORM (mature, decorators, used in NestJS examples) vs Prisma (better DX, generated types, migration tooling). The plan doesn't specify. Which do you want the reference implementation to use?

2. **Tenant isolation strategy**: 
   - (a) **Schema-per-tenant** — one Postgres schema per org. True isolation, harder to query cross-tenant for aggregations, harder to migrate.
   - (b) **Row-level tenancy with RLS** — single schema, `org_id` everywhere, RLS policies. Easier ops, cheaper migrations, slightly higher risk of leak if RLS misconfigured.
   - The plan says schema-per-tenant in §3.3 but row-level is more common for early-stage SaaS.

Pick per project context — these choices lock in how every subsequent migration is written.
