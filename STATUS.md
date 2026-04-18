# SkillForge — Current Status

**Last update**: 2026-04-18 (late)

## Done

- ✅ **Sprint 0**: monorepo scaffold, CI/CD, local-dev scripts, 10 ADRs
- ✅ **Sprint 1 P0**: auth + RBAC, competency framework engine, user invite flow, HR admin UI, baseline + RLS migrations
- ✅ **Post-Sprint-1 hardening** (commit `99bc173`): prismaAdmin client, transactional auth flows, frontend route guard, cache clear, role gates, zod-validated weights, BYPASSRLS admin role
- ✅ **Memory + skills synced** (commit `2c2b2aa`): project_sprint_progress, reference_admin_client_pattern, feedback_transaction_scope, sf-tenant-check patterns 6+7
- ✅ **Sprint 2 P0** (this commit): cycle state machine + `activate()`, self-assessment backend with draft save + submit, artifact upload with HMAC token, self-assessment multi-step UI, ArtifactUploader component, manager roster page, BullMQ reminder subsystem (worker + scheduler + mailer)
- ✅ **DOCX plans** moved to `docs/plans/`
- ✅ **Tests**: ~33 new unit assertions across cycle, assessment, artifact, reminder services

## Sprint 2 — delivered features

| # | Feature | Files |
|---|---|---|
| 7 | Cycle lifecycle + activate/progress | `services/assessment-service/src/cycle/cycle.service.ts`, `cycle.service.test.ts` |
| 8 | Self-assessment backend | `assessment.service.ts:saveSelfDraft/submitSelf`, `assessment.service.test.ts` |
| 9 | Artifact upload | `artifact.service.ts` + public PUT controller route, `artifact.service.test.ts` |
| 10 | Self-assessment UI + auto-save | `apps/web/app/(app)/assessments/[id]/page.tsx`, `ArtifactUploader.tsx`, `use-assessments.ts` |
| 11 | Manager roster | `apps/web/app/(app)/team/page.tsx` |
| 12 | Email reminder (BullMQ) | `services/assessment-service/src/notifications/{module,mailer,worker,scheduler}.ts`, `reminder.worker.test.ts`, `docs/design/reminder-idempotency.md` |

## Next

Sprint 3 (weeks 5–6) — **Hyper-MVP close**:
- Manager scoring UI (backend exists)
- Weighted composite + CSV export for appraisal system
- Assessment cycle lock + finalize (HR)
- Basic HR dashboard (completion % per team)
- Pilot UAT with 20 employees
- Production deployment runbook + go/no-go gate

Sprint 3 is the final sprint before the 2026-05-31 appraisal-cycle deadline.
