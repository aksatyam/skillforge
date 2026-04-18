-- ═══════════════════════════════════════════════════════════════
-- SkillForge AI — Migration 0001: initial schema
-- ═══════════════════════════════════════════════════════════════
-- Mirrors packages/db/prisma/schema.prisma. RLS policies come in 0002.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ─────────────────────────────────────────────────────
CREATE TYPE "UserRole" AS ENUM (
  'employee',
  'manager',
  'hr_admin',
  'ai_champion',
  'leadership',
  'super_admin'
);

CREATE TYPE "CycleStatus"      AS ENUM ('draft', 'open', 'locked', 'closed');
CREATE TYPE "AssessmentStatus" AS ENUM (
  'not_started', 'self_submitted', 'manager_in_progress',
  'peer_submitted', 'ai_analyzed', 'manager_scored',
  'composite_computed', 'finalized'
);
CREATE TYPE "FrameworkStatus" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "ArtifactType"    AS ENUM ('document', 'code', 'presentation', 'prompt', 'other');
CREATE TYPE "ResourceType"    AS ENUM ('course', 'book', 'article', 'video', 'workshop', 'mentor');
CREATE TYPE "Priority"        AS ENUM ('low', 'medium', 'high');

-- ── organizations (tenant root) ───────────────────────────────
CREATE TABLE "organizations" (
  "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
  "name"              TEXT          NOT NULL,
  "domain"            TEXT          NOT NULL,
  "subscription_plan" TEXT          NOT NULL DEFAULT 'internal',
  "settings_json"     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "deleted_at"        TIMESTAMPTZ(6),
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_domain_key" ON "organizations" ("domain");

-- ── users ─────────────────────────────────────────────────────
CREATE TABLE "users" (
  "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
  "org_id"                UUID          NOT NULL,
  "email"                 TEXT          NOT NULL,
  "name"                  TEXT          NOT NULL,
  "role_family"           TEXT          NOT NULL,
  "designation"           TEXT          NOT NULL,
  "role"                  "UserRole"    NOT NULL DEFAULT 'employee',
  "manager_id"            UUID,
  "auth_provider_id"      TEXT,
  "password_hash"         TEXT,
  "invite_token_hash"     TEXT,
  "invite_expires_at"     TIMESTAMPTZ(6),
  "invite_accepted_at"    TIMESTAMPTZ(6),
  "mfa_enabled"           BOOLEAN       NOT NULL DEFAULT false,
  "last_login_at"         TIMESTAMPTZ(6),
  "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"            UUID,
  "deleted_at"            TIMESTAMPTZ(6),
  "version"               INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_org_id_email_key" ON "users" ("org_id", "email");
CREATE UNIQUE INDEX "users_invite_token_hash_key" ON "users" ("invite_token_hash") WHERE "invite_token_hash" IS NOT NULL;
CREATE INDEX "users_org_id_idx"    ON "users" ("org_id");
CREATE INDEX "users_manager_id_idx" ON "users" ("manager_id");

-- ── competency_frameworks ─────────────────────────────────────
CREATE TABLE "competency_frameworks" (
  "id"                     UUID             NOT NULL DEFAULT gen_random_uuid(),
  "org_id"                 UUID             NOT NULL,
  "name"                   TEXT             NOT NULL,
  "version"                INTEGER          NOT NULL DEFAULT 1,
  "status"                 "FrameworkStatus" NOT NULL DEFAULT 'draft',
  "maturity_levels_json"   JSONB            NOT NULL,
  "created_at"             TIMESTAMPTZ(6)    NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ(6)    NOT NULL DEFAULT now(),
  "created_by"             UUID,
  "deleted_at"             TIMESTAMPTZ(6),
  PRIMARY KEY ("id")
);
CREATE INDEX "competency_frameworks_org_id_idx" ON "competency_frameworks" ("org_id");

-- ── role_mappings ─────────────────────────────────────────────
CREATE TABLE "role_mappings" (
  "id"                        UUID           NOT NULL DEFAULT gen_random_uuid(),
  "framework_id"              UUID           NOT NULL,
  "role_family"               TEXT           NOT NULL,
  "target_level"              INTEGER        NOT NULL,
  "assessment_criteria_json"  JSONB          NOT NULL,
  "created_at"                TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "role_mappings_framework_id_role_family_key" ON "role_mappings" ("framework_id", "role_family");
CREATE INDEX "role_mappings_framework_id_idx" ON "role_mappings" ("framework_id");

-- ── assessment_cycles ─────────────────────────────────────────
CREATE TABLE "assessment_cycles" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"       UUID           NOT NULL,
  "framework_id" UUID           NOT NULL,
  "name"         TEXT           NOT NULL,
  "start_date"   DATE           NOT NULL,
  "end_date"     DATE           NOT NULL,
  "status"       "CycleStatus"  NOT NULL DEFAULT 'draft',
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"   UUID,
  "deleted_at"   TIMESTAMPTZ(6),
  PRIMARY KEY ("id")
);
CREATE INDEX "assessment_cycles_org_id_idx"          ON "assessment_cycles" ("org_id");
CREATE INDEX "assessment_cycles_framework_id_idx"    ON "assessment_cycles" ("framework_id");
CREATE INDEX "assessment_cycles_org_id_status_idx"   ON "assessment_cycles" ("org_id", "status");

-- ── assessments ───────────────────────────────────────────────
CREATE TABLE "assessments" (
  "id"                 UUID               NOT NULL DEFAULT gen_random_uuid(),
  "cycle_id"           UUID               NOT NULL,
  "user_id"            UUID               NOT NULL,
  "self_score"         DECIMAL(5, 2),
  "manager_score"      DECIMAL(5, 2),
  "peer_score"         DECIMAL(5, 2),
  "ai_score"           DECIMAL(5, 2),
  "ai_confidence"      INTEGER,
  "composite_score"    DECIMAL(5, 2),
  "status"             "AssessmentStatus" NOT NULL DEFAULT 'not_started',
  "manager_rationale"  TEXT,
  "created_at"         TIMESTAMPTZ(6)     NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6)     NOT NULL DEFAULT now(),
  "submitted_at"       TIMESTAMPTZ(6),
  "finalized_at"       TIMESTAMPTZ(6),
  "deleted_at"         TIMESTAMPTZ(6),
  "version"            INTEGER            NOT NULL DEFAULT 1,
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assessments_cycle_id_user_id_key" ON "assessments" ("cycle_id", "user_id");
CREATE INDEX "assessments_cycle_id_idx" ON "assessments" ("cycle_id");
CREATE INDEX "assessments_user_id_idx"  ON "assessments" ("user_id");
CREATE INDEX "assessments_status_idx"   ON "assessments" ("status");

-- ── artifacts ─────────────────────────────────────────────────
CREATE TABLE "artifacts" (
  "id"                  UUID            NOT NULL DEFAULT gen_random_uuid(),
  "assessment_id"       UUID            NOT NULL,
  "user_id"             UUID            NOT NULL,
  "file_url"            TEXT            NOT NULL,
  "file_name"           TEXT            NOT NULL,
  "file_size_bytes"     INTEGER         NOT NULL,
  "mime_type"           TEXT            NOT NULL,
  "artifact_type"       "ArtifactType"  NOT NULL,
  "ai_analysis_json"    JSONB,
  "ai_analyzed_at"      TIMESTAMPTZ(6),
  "created_at"          TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  "deleted_at"          TIMESTAMPTZ(6),
  PRIMARY KEY ("id")
);
CREATE INDEX "artifacts_assessment_id_idx" ON "artifacts" ("assessment_id");
CREATE INDEX "artifacts_user_id_idx"       ON "artifacts" ("user_id");

-- ── peer_reviews ──────────────────────────────────────────────
CREATE TABLE "peer_reviews" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "assessment_id" UUID           NOT NULL,
  "reviewer_id"   UUID           NOT NULL,
  "ratings_json"  JSONB          NOT NULL,
  "comments"      TEXT,
  "submitted_at"  TIMESTAMPTZ(6),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "deleted_at"    TIMESTAMPTZ(6),
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "peer_reviews_assessment_id_reviewer_id_key" ON "peer_reviews" ("assessment_id", "reviewer_id");
CREATE INDEX "peer_reviews_assessment_id_idx" ON "peer_reviews" ("assessment_id");
CREATE INDEX "peer_reviews_reviewer_id_idx"   ON "peer_reviews" ("reviewer_id");

-- ── learning_recommendations ──────────────────────────────────
CREATE TABLE "learning_recommendations" (
  "id"                   UUID            NOT NULL DEFAULT gen_random_uuid(),
  "assessment_id"        UUID            NOT NULL,
  "skill_gap"            TEXT            NOT NULL,
  "recommended_resource" TEXT            NOT NULL,
  "resource_url"         TEXT,
  "resource_type"        "ResourceType"  NOT NULL,
  "priority"             "Priority"      NOT NULL DEFAULT 'medium',
  "created_at"           TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE INDEX "learning_recommendations_assessment_id_idx" ON "learning_recommendations" ("assessment_id");

-- ── prompt_library_entries ────────────────────────────────────
CREATE TABLE "prompt_library_entries" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"      UUID           NOT NULL,
  "author_id"   UUID           NOT NULL,
  "title"       TEXT           NOT NULL,
  "prompt_text" TEXT           NOT NULL,
  "category"    TEXT           NOT NULL,
  "rating"      DECIMAL(3, 2)  NOT NULL DEFAULT 0,
  "usage_count" INTEGER        NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "deleted_at"  TIMESTAMPTZ(6),
  PRIMARY KEY ("id")
);
CREATE INDEX "prompt_library_entries_org_id_idx"    ON "prompt_library_entries" ("org_id");
CREATE INDEX "prompt_library_entries_author_id_idx" ON "prompt_library_entries" ("author_id");
CREATE INDEX "prompt_library_entries_category_idx"  ON "prompt_library_entries" ("category");

-- ── audit_log ─────────────────────────────────────────────────
CREATE TABLE "audit_log" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"         UUID           NOT NULL,
  "actor_id"       UUID,
  "action"         TEXT           NOT NULL,
  "entity_type"    TEXT           NOT NULL,
  "entity_id"      UUID,
  "previous_value" JSONB,
  "new_value"      JSONB,
  "rationale"      TEXT,
  "ip_address"     TEXT,
  "user_agent"     TEXT,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE INDEX "audit_log_org_id_created_at_idx"  ON "audit_log" ("org_id", "created_at");
CREATE INDEX "audit_log_actor_id_idx"           ON "audit_log" ("actor_id");
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log" ("entity_type", "entity_id");
CREATE INDEX "audit_log_action_idx"             ON "audit_log" ("action");

-- ── refresh_tokens ────────────────────────────────────────────
CREATE TABLE "refresh_tokens" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     UUID           NOT NULL,
  "token_hash"  TEXT           NOT NULL,
  "expires_at"  TIMESTAMPTZ(6) NOT NULL,
  "revoked_at"  TIMESTAMPTZ(6),
  "replaced_by" UUID,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens" ("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx"    ON "refresh_tokens" ("user_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" ("expires_at");

-- ── Foreign keys ──────────────────────────────────────────────
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey"
  FOREIGN KEY ("manager_id") REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "competency_frameworks" ADD CONSTRAINT "competency_frameworks_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;

ALTER TABLE "role_mappings" ADD CONSTRAINT "role_mappings_framework_id_fkey"
  FOREIGN KEY ("framework_id") REFERENCES "competency_frameworks" ("id") ON DELETE CASCADE;

ALTER TABLE "assessment_cycles" ADD CONSTRAINT "assessment_cycles_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;
ALTER TABLE "assessment_cycles" ADD CONSTRAINT "assessment_cycles_framework_id_fkey"
  FOREIGN KEY ("framework_id") REFERENCES "competency_frameworks" ("id") ON DELETE RESTRICT;

ALTER TABLE "assessments" ADD CONSTRAINT "assessments_cycle_id_fkey"
  FOREIGN KEY ("cycle_id") REFERENCES "assessment_cycles" ("id") ON DELETE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments" ("id") ON DELETE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments" ("id") ON DELETE CASCADE;
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "learning_recommendations" ADD CONSTRAINT "learning_recommendations_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments" ("id") ON DELETE CASCADE;

ALTER TABLE "prompt_library_entries" ADD CONSTRAINT "prompt_library_entries_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;
ALTER TABLE "prompt_library_entries" ADD CONSTRAINT "prompt_library_entries_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL;
