# End-to-End Smoke Test — Results

**Date**: 2026-04-18
**Environment**: Local dev (commit `848eb2a`)
**Outcome**: ✅ All 10 steps passed

Ran the full Hyper-MVP flow against the live dev servers via curl + psql.

## The flow

| Step | Actor | Action | Result |
|---|---|---|---|
| 1 | Employee (dev1) | `POST /auth/login` | JWT issued, 15min TTL |
| 2 | Employee | `GET /assessments/me` | Returned 1 assessment, `status=not_started` |
| 3 | Employee | `POST /assessments/self/submit` (4 dims × scores) | `selfScore=3.63`, `status=self_submitted` |
| 4 | Manager (eng.manager) | `GET /assessments/team/list` | 2 direct reports returned |
| 5 | Manager | `POST /assessments/manager/submit` (scores + rationale) | `managerScore=4`, **`composite=3.91`**, `status=composite_computed` |
| 6 | HR (hr@qualtech) | `GET /cycles` + `GET /cycles/:id/progress` | 5 total / 1 submitted / `completionRate=0.2` |
| 7 | HR | `PATCH /cycles/:id/status {status:'locked'}` | cycle status → `locked` |
| 8 | HR | `POST /cycles/:id/close` | cycle status → `closed`, assessment → `finalized` |
| 9 | HR | `GET /cycles/:id/export.csv` | UTF-8 BOM present (`EF BB BF`), 6 rows, correct filename `skillforge-cycle-qualtech-ai-capability-april-june-2026-20260418.csv` |
| 10 | — | Audit log inspection | 6 ordered entries covering every mutation |

## Composite math verified

`composite = (w_self × self + w_manager × manager) / (w_self + w_manager)`
`         = (0.15 × 3.63 + 0.50 × 4.00) / 0.65`
`         = 3.91`

Matches the server-computed value exactly. Peer + AI weights are dropped because no peer/AI scores are present (Phase 2 feature).

## Audit trail (most recent first)

```
 CycleController.transition:success         cycle       23:36:58
 cycle.bulk_finalized                       cycle       23:36:58
 cycle.closed                               cycle       23:36:58
 CycleController.close:success              cycle       23:36:58
 AssessmentController.submitManager:success assessment  23:36:43
 AssessmentController.submitSelf:success    assessment  23:36:30
```

Both the HTTP-layer audit (via `AuditLogInterceptor`) and the business-event audit (`cycle.bulk_finalized`, `cycle.closed`) are present — as designed.

## Append-only enforcement

```sh
psql -U skillforge -d skillforge -c "UPDATE audit_log SET action='tampered' WHERE action='cycle.closed';"
# → UPDATE 0
```

The RLS policy on `audit_log` has `FOR INSERT` and `FOR SELECT` policies but NO `FOR UPDATE` policy, so UPDATEs affect zero rows. Immutability confirmed.

## Final state

```
assessments — 1 finalized
  status        = finalized
  self_score    = 3.63
  manager_score = 4.00
  composite     = 3.91
  finalized_at  = 2026-04-18 23:36:58

assessment_cycles
  name   = Qualtech AI Capability — April–June 2026
  status = closed
```

## Reproducing

```bash
make up
pnpm db:generate && pnpm db:migrate:deploy && pnpm db:seed
pnpm dev     # starts :3000 + :4001

# Run steps 1–10 — see this doc's script above or open http://localhost:3000
```

The Hyper-MVP is functionally complete. Next:
- Sprint 4 hardening (httpOnly cookies, Swagger back via tsc builder, S3 presigned URLs)
- UAT with 20 pilot users (2026-05-18 → 05-27)
- Production cutover (2026-05-29)
