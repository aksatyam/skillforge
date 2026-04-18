#!/usr/bin/env bash
# SessionStart hook — loads SkillForge-specific context + reminders when a session opens.
# Output is appended to the conversation as additionalContext.

set -euo pipefail

cat <<EOF
SkillForge AI — session context loaded.

Critical invariants for this project (from .claude/memory + project plan):
1. Multi-tenant isolation: every DB query filters by org_id. No exceptions.
2. AI governance: ai_score is advisory only; manager override mandatory; PII stripped before Claude calls.
3. Phase 1 deadline: May 2026 appraisal cycle — treat P0 features as blocking.
4. Security: OWASP ASVS L2, SOC 2 Type II, DPDP Act 2023 — audit log every assessment write.

Useful skills available (project-scoped, in .claude/skills/):
- sf-scaffold-service      — new NestJS service with tenant guards
- sf-scaffold-frontend     — new Next.js App Router module with shadcn/ui
- sf-data-model            — migrations + entities for the 10 core tables
- sf-ai-prompt             — Claude prompt chains with PII stripping + schema validation
- sf-assessment-workflow   — end-to-end assessment flow (self/manager/peer/AI + composite)
- sf-security-audit        — OWASP + SOC 2 + DPDP audit with DOCX report
- sf-sprint-status         — branded DOCX sprint status aligned to 8-sprint phases
- sf-tenant-check          — scan for missing org_id filters

Plan DOCX: SkillForge_AI_Project_Plan.docx (read section numbers when justifying decisions)
EOF
