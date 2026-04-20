-- ═══════════════════════════════════════════════════════════════
-- SkillForge AI — Migration 0006: feature flag overrides (S7.T3)
-- ═══════════════════════════════════════════════════════════════
-- Per-org / per-user overrides for flags defined in
-- packages/feature-flags/src/flags.ts. Flag *definitions* live in
-- code; this table stores only *deviations* from default.
--
-- user_id NULL     → org-wide override
-- user_id NOT NULL → per-user override (A/B, canary)
--
-- RLS: standard org-scope. Even super-admin flag flips should be
-- attributed to a specific org — cross-org flag changes are done
-- one-org-at-a-time via the admin service.

CREATE TABLE "feature_flag_overrides" (
  -- Synthetic PK — needed because Prisma disallows nullable user_id in
  -- composite @@id. Real uniqueness is on (flag_key, org_id, user_id)
  -- enforced by the COALESCE index below.
  "id"            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  "flag_key"      TEXT           NOT NULL,
  "org_id"        UUID           NOT NULL,
  "user_id"       UUID           NULL,
  "enabled"       BOOLEAN        NOT NULL,
  "created_by"    UUID           NOT NULL,
  "updated_by"    UUID           NULL,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "feature_flag_overrides_org_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "feature_flag_overrides_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Prisma-visible unique (treats NULLs as distinct in Prisma semantics).
-- This is what Prisma's generated client uses as the `where` arg for upsert.
CREATE UNIQUE INDEX "feature_flag_overrides_flag_key_org_id_user_id_key"
  ON "feature_flag_overrides" ("flag_key", "org_id", "user_id");

-- TRUE uniqueness — collapses NULLs so only one org-wide row exists per
-- (flag, org). This is the actual business rule. Prisma upserts against
-- the key above won't trip this because Prisma always supplies user_id
-- (either UUID or NULL) in the where clause, and the service always
-- maps the scope correctly before upserting.
CREATE UNIQUE INDEX "feature_flag_overrides_unique_scope"
  ON "feature_flag_overrides" ("flag_key", "org_id", COALESCE("user_id", '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX "feature_flag_overrides_org_id_idx"   ON "feature_flag_overrides" ("org_id");
CREATE INDEX "feature_flag_overrides_flag_key_idx" ON "feature_flag_overrides" ("flag_key");

COMMENT ON TABLE "feature_flag_overrides" IS
  'Per-org / per-user deviations from code-side flag defaults. Source of '
  'truth for flag *values*; flag definitions live in @skillforge/feature-flags.';
COMMENT ON COLUMN "feature_flag_overrides"."flag_key" IS
  'Must match a key in FEATURE_FLAGS in packages/feature-flags/src/flags.ts. '
  'Not FK-enforced (flags live in code). Orphan rows for removed flags are '
  'expected — cleaned up by a GC job that reads the current registry.';
COMMENT ON COLUMN "feature_flag_overrides"."user_id" IS
  'NULL = org-wide override. Non-null = per-user override, wins over org-wide.';

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_overrides" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "feature_flag_overrides"
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());
