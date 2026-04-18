-- ═══════════════════════════════════════════════════════════════
-- SkillForge AI — Migration 0002: enable Row-Level Security
-- ═══════════════════════════════════════════════════════════════
-- Applies RLS policies on every tenant-scoped table. See ADR-002.
-- Application code MUST run: SET LOCAL app.current_org_id = '<uuid>'
-- at the start of every request transaction (see @skillforge/tenant-guard).

-- Helper function to read the current tenant GUC.
-- Returns NULL if unset, which makes "org_id = current_org_id()" → "unknown"
-- → filtered out. Safe default.
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_org_id', true), '')::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── Enable + FORCE RLS on every tenant-scoped table ───────────
-- FORCE ensures even table owners are subject to policies — only
-- roles with BYPASSRLS (skillforge_admin) can bypass.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (org_id = current_org_id());

ALTER TABLE competency_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_frameworks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON competency_frameworks
  USING (org_id = current_org_id());

ALTER TABLE role_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_mappings
  USING (framework_id IN (SELECT id FROM competency_frameworks WHERE org_id = current_org_id()));

ALTER TABLE assessment_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_cycles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assessment_cycles
  USING (org_id = current_org_id());

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assessments
  USING (cycle_id IN (SELECT id FROM assessment_cycles WHERE org_id = current_org_id()));

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON artifacts
  USING (assessment_id IN (
    SELECT a.id FROM assessments a
    JOIN assessment_cycles c ON c.id = a.cycle_id
    WHERE c.org_id = current_org_id()
  ));

ALTER TABLE peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON peer_reviews
  USING (assessment_id IN (
    SELECT a.id FROM assessments a
    JOIN assessment_cycles c ON c.id = a.cycle_id
    WHERE c.org_id = current_org_id()
  ));

ALTER TABLE learning_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON learning_recommendations
  USING (assessment_id IN (
    SELECT a.id FROM assessments a
    JOIN assessment_cycles c ON c.id = a.cycle_id
    WHERE c.org_id = current_org_id()
  ));

ALTER TABLE prompt_library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_library_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON prompt_library_entries
  USING (org_id = current_org_id());

-- audit_log: append-only. INSERT + SELECT policies; NO update/delete.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON audit_log
  FOR SELECT USING (org_id = current_org_id());
CREATE POLICY tenant_isolation_insert ON audit_log
  FOR INSERT WITH CHECK (org_id = current_org_id());
-- NO UPDATE/DELETE policies → strictly append-only (ISO 27001 A.12.4)

-- refresh_tokens: scoped via user
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON refresh_tokens
  USING (user_id IN (SELECT id FROM users WHERE org_id = current_org_id()));

-- ── Admin-role bypass ─────────────────────────────────────────
-- Pre-tenant flows (login, refresh, accept-invite) and append-only
-- paths (audit log writes) use DATABASE_URL_ADMIN with the
-- skillforge_admin role which has BYPASSRLS. See tools/local-up.sh.
-- The application prisma client uses DATABASE_URL with the normal
-- skillforge role — queries through it are always RLS-enforced.

COMMENT ON FUNCTION current_org_id() IS
  'Returns the current tenant UUID from app.current_org_id GUC, or NULL if unset. '
  'Set via withTenant() helper in @skillforge/tenant-guard.';
