-- ═══════════════════════════════════════════════════════════════
-- SkillForge AI — Migration 0005: AI evaluation schema (Phase 2.1)
-- ═══════════════════════════════════════════════════════════════
-- Adds two tables powering AiEvaluationModule (ADR-013):
--   • ai_prompt_templates — versioned Claude chain definitions
--   • ai_suggestions       — per-assessment AI output, append-only
--
-- Both tables are gated behind the `ai_suggestions_enabled` feature
-- flag (lands in S7.T3). No service code writes until Sprint 8.

-- ── Enums ─────────────────────────────────────────────────────
CREATE TYPE "AiPromptStatus" AS ENUM ('draft', 'active', 'archived');

CREATE TYPE "AiSuggestionStatus" AS ENUM ('pending', 'succeeded', 'failed', 'superseded');

-- ── ai_prompt_templates ───────────────────────────────────────
-- org_id is NULLABLE:
--   NULL     → system-shipped template, visible to every tenant
--   NOT NULL → per-org override (Phase 2.3 feature — RLS gates reads)
CREATE TABLE "ai_prompt_templates" (
  "id"                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"             UUID        NULL,
  "template_key"       TEXT        NOT NULL,
  "version"            INT         NOT NULL DEFAULT 1,
  "name"               TEXT        NOT NULL,
  "description"        TEXT        NULL,
  "chain_steps_json"   JSONB       NOT NULL,
  "status"             "AiPromptStatus" NOT NULL DEFAULT 'draft',
  "model_version"      TEXT        NOT NULL,
  "author_id"          UUID        NULL,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL,
  "deleted_at"         TIMESTAMPTZ(6) NULL,

  CONSTRAINT "ai_prompt_templates_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,

  CONSTRAINT "ai_prompt_templates_template_version_unique"
    UNIQUE NULLS NOT DISTINCT ("org_id", "template_key", "version")
);

CREATE INDEX "ai_prompt_templates_org_id_idx"          ON "ai_prompt_templates" ("org_id");
CREATE INDEX "ai_prompt_templates_template_status_idx" ON "ai_prompt_templates" ("template_key", "status");

COMMENT ON TABLE "ai_prompt_templates" IS
  'Versioned Claude prompt-chain definitions for AiEvaluationModule. '
  'Distinct from prompt_library_entries (user-facing prompt library). '
  'org_id NULL = system-shipped template shared across tenants.';
COMMENT ON COLUMN "ai_prompt_templates"."chain_steps_json" IS
  'Ordered: [{stepId, role, systemPrompt, userTemplate, outputSchema, modelVersion?, maxTokens?}]';
COMMENT ON COLUMN "ai_prompt_templates"."template_key" IS
  'Stable logical name, e.g. "artifact.summarize", "rubric.match", "score.suggest"';

-- ── ai_suggestions ────────────────────────────────────────────
-- Rows are append-only. Rerun on an assessment INSERTs a new row;
-- prior succeeded row (if any) is UPDATEd to status='superseded' in
-- the same transaction. No deletes — this is the AI audit trail.
CREATE TABLE "ai_suggestions" (
  "id"                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "assessment_id"             UUID        NOT NULL,
  "prompt_template_id"        UUID        NOT NULL,
  "input_hash"                TEXT        NOT NULL,
  "ai_score"                  DECIMAL(5,2) NULL,
  "confidence"                INT         NULL,
  "rationale_text"            TEXT        NULL,
  "rationale_citations_json"  JSONB       NULL,
  "model_version"             TEXT        NOT NULL,
  "prompt_cache_hit"          BOOLEAN     NOT NULL DEFAULT false,
  "cost_cents"                INT         NOT NULL DEFAULT 0,
  "latency_ms"                INT         NULL,
  "status"                    "AiSuggestionStatus" NOT NULL DEFAULT 'pending',
  "error_message"             TEXT        NULL,
  "created_at"                TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "ai_suggestions_assessment_id_fkey"
    FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_suggestions_prompt_template_id_fkey"
    FOREIGN KEY ("prompt_template_id") REFERENCES "ai_prompt_templates"("id") ON DELETE RESTRICT,

  -- Range checks guard against bad Claude outputs / bad service code.
  CONSTRAINT "ai_suggestions_confidence_range"
    CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 100)),
  CONSTRAINT "ai_suggestions_ai_score_range"
    CHECK ("ai_score" IS NULL OR ("ai_score" >= 0 AND "ai_score" <= 100)),
  CONSTRAINT "ai_suggestions_cost_non_negative"
    CHECK ("cost_cents" >= 0),
  CONSTRAINT "ai_suggestions_latency_non_negative"
    CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0)
);

CREATE INDEX "ai_suggestions_assessment_status_created_idx"
  ON "ai_suggestions" ("assessment_id", "status", "created_at" DESC);
CREATE INDEX "ai_suggestions_prompt_template_id_idx" ON "ai_suggestions" ("prompt_template_id");
CREATE INDEX "ai_suggestions_input_hash_idx"         ON "ai_suggestions" ("input_hash");

COMMENT ON TABLE "ai_suggestions" IS
  'Per-assessment Claude output. Source of truth — assessments.ai_score is '
  'denormalized from the latest succeeded row. Append-only audit trail.';
COMMENT ON COLUMN "ai_suggestions"."input_hash" IS
  'sha256 of canonicalized anonymized input — enables dedupe + cache-hit detection';
COMMENT ON COLUMN "ai_suggestions"."rationale_citations_json" IS
  'Structured source refs: [{artifactId, snippet, confidence, stepId}]';

-- ── Row-Level Security ────────────────────────────────────────
-- ai_prompt_templates: NULL org_id rows are cross-tenant (system-shipped).
-- Pattern here is "org_id IS NULL OR org_id = current_org_id()" so reads
-- see globals + their own templates, never another tenant's override.
ALTER TABLE "ai_prompt_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_prompt_templates" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_prompt_templates"
  USING (org_id IS NULL OR org_id = current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = current_org_id());

-- ai_suggestions: scoped via assessment → cycle → org. Matches the
-- artifacts / peer_reviews pattern. The IN-subquery runs against
-- RLS-enforced assessment_cycles, so the policy is transitively safe.
ALTER TABLE "ai_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_suggestions" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_suggestions"
  USING (assessment_id IN (
    SELECT a.id FROM assessments a
    JOIN assessment_cycles c ON c.id = a.cycle_id
    WHERE c.org_id = current_org_id()
  ));
