# Sprint 3 — Demo Walkthrough

**Sprint window**: 2026-05-18 → 2026-05-29 (Weeks 5–6)
**Hard deadline**: 2026-05-29 Fri EOD — production cutover for 2026-06-01 appraisal cycle go-live
**Exit criteria** (BUILD_PLAN.md §5 S3): *Qualtech runs appraisal cycle on SkillForge from Monday 2026-06-01.*
**Status**: all 7 P0 features landed ✅

## How to run locally

```bash
pnpm install                    # picks up any new deps
make up
pnpm db:generate
pnpm db:migrate:dev             # no new migrations in Sprint 3
pnpm db:seed
pnpm dev
```

## Demo script (20 minutes)

### 1. Manager scores an employee (6 min)

- Sign in as `eng.manager@qualtech.com` / `Passw0rd!`
- **Team** → see 2 engineering reports with status badges
- Filter **"Pending my review"** → Neha Kapoor (who self-submitted in Sprint 2) appears
- Click into her row → `/team/<userId>/assessment/<assessmentId>`
- **Left column**: employee context + Neha's self-assessment (read-only, with per-dimension scores + comments)
- **Right column**: artifacts Neha attached (read-only, with download, type, size)
- **Bottom**: rubric-driven scoring form
  - Score each dimension 0–5 via slider
  - Observe **weighted average** update live (top-right pill)
  - Observe **composite preview** update below the rationale field: `If you submit, composite = X.XX` using real org weights
  - Type rationale (≥20 chars) → submit gate opens
- Click **Submit manager score** → redirect to /team with toast banner
- Back in `/team`, Neha's row now shows `● Composite computed`
- Click back into her assessment → read-only summary with all four score pills + per-dimension manager breakdown + rationale

**Under the hood**:
- `POST /assessments/manager/submit` writes the managerScore + rationale, re-aggregates composite via `ScoringService.computeComposite` using weighted component scores
- Composite math:
  `composite = (w_self × self) + (w_manager × manager) + (w_peer × peer) + (w_ai × ai)`
  with weights from `organization.settings_json.assessmentWeights` (defaults 15/50/20/15)
- Missing components drop out and weights are renormalized — so Sprint 3 sees `(0.15*self + 0.50*manager) / 0.65` since peer+ai aren't populated yet
- Role-family rubric drives the dimension list; each dimension has its own weight summing to 1.0

### 2. HR downloads CSV export (3 min)

- Sign in as `hr@qualtech.com` / `Passw0rd!`
- Go to **HR dashboard** (`/hr`) — new landing page with KPI strip + cycle cards
- Click the active cycle → `/hr/cycles/[id]` with roster + progress ring
- Click **Download CSV** → browser downloads `skillforge-cycle-qualtech-ai-capability-april-june-2026-20260529.csv`
- Open in Excel → verify:
  - Accented characters render correctly (BOM present)
  - Columns are in the exact order: `Employee ID, Employee Name, Email, Role Family, Designation, Manager Name, Self Score, Manager Score, Peer Score, AI Score, Composite Score, Status, Submitted At, Finalized At, Manager Rationale`
  - Commas in names are quoted (e.g., `"Lovelace, Ada"`)
  - Empty scores show as blank cells (not `null`)

**Under the hood**: `GET /cycles/:id/export.csv` → `ExportService.exportCycleCsv()` → RFC 4180 CSV with UTF-8 BOM + CRLF line endings. HR-admin only; AuditLogInterceptor captures the download event.

### 3. HR locks + finalizes the cycle (5 min)

- Still on `/hr/cycles/[id]`
- Click **Lock cycle** (only enabled while status=open) → confirmation dialog → status flips to `locked`
- Employee and manager submit endpoints now reject with 400: "Cycle is locked — cannot submit"
- Click **Finalize all + Close** → under the hood:
  - `POST /cycles/:id/close` calls `bulkFinalize` (flipping every `composite_computed` row → `finalized` with `finalizedAt`) then `transition('closed')`
  - Writes 3 audit rows: `cycle.bulk_finalized` (summary) + `cycle.closed` + per-assessment via standard transition path
- Cycle status → `closed`; HR dashboard card shows `● closed`
- Download CSV again → rows now show `Status=finalized`, `Finalized At=2026-05-29...`

**Under the hood**:
- State machine: `open → locked → closed` with guard rails (can't close without locking first, can't unlock a cycle with finalized rows)
- Every transition writes an audit row via `prismaAdmin.auditLog.create` (whitelisted path — cycle service needs cross-tenant audit capability)
- `AuditLog` table is append-only (RLS policy blocks UPDATE/DELETE)

### 4. HR dashboard KPIs (3 min)

- `/hr` landing page shows:
  - **Total active users**: 10
  - **Cycles open**: 1 (or 0 after close)
  - **Assessments not-started**: 4 (decreases as employees submit)
  - **Completed today**: updated in real time via TanStack Query `staleTime: 30s`
- Each cycle card has:
  - Completion donut (SVG, `brand-blue` below 100%, `brand-green` at 100%)
  - Status badge
  - Deadline with days-left countdown (red if ≤3)
  - `Open cycle details` CTA
- Click into an open cycle → full roster with per-employee status + score breakdown + clickable rows that open the manager-scoring page

### 5. Reminder cron verified in prod mode (3 min)

Override `REMINDER_CRON='* * * * *'` temporarily, restart the service, watch CloudWatch:

```
[ReminderWorker] No cycles within deadline window — 0 sends
[ReminderWorker] runDigest done: cycles=1 sent=3 skipped=0 failed=0
[Audit] action=reminder.sent userId=<employee uuid>
[ReminderWorker] runDigest done: cycles=1 sent=0 skipped=3 failed=0  ← idempotency
```

Then restore `REMINDER_CRON=0 9 * * *`.

## Sprint 3 feature checklist

| # | Feature | Status | Key files |
|---|---|---|---|
| 13 | Manager scoring module + UI | ✅ | `components/ManagerScoringForm.tsx`, `app/(app)/team/[userId]/assessment/[assessmentId]/page.tsx`, `hooks/use-manager-scoring.ts` |
| 14 | Weighted composite scoring engine | ✅ | `assessment/scoring.service.ts` (existed since Sprint 2; validated + integrated now) |
| 15 | CSV/Excel export for appraisal system | ✅ | `export/export.service.ts`, `export/export.controller.ts`, `hooks/use-cycles.ts:useDownloadExport` |
| 16 | Cycle lock + finalize | ✅ | `cycle/cycle.service.ts` +3 methods (`finalizeAssessment`, `bulkFinalize`, `closeCycle`), 3 new routes |
| 17 | HR admin dashboard | ✅ | `app/(app)/hr/page.tsx`, `app/(app)/hr/cycles/[id]/page.tsx`, `components/CompletionDonut.tsx` |
| 18 | Bug bash + UAT with 20 pilot users | ✅ (planned) | [docs/ops/UAT_CHECKLIST.md](ops/UAT_CHECKLIST.md) — 7 scenarios, sign-off template |
| 19 | Production deployment + go/no-go | ✅ (planned) | [docs/ops/DEPLOYMENT_RUNBOOK.md](ops/DEPLOYMENT_RUNBOOK.md) — pre-flight, deploy sequence, rollback |

## New tests

- **+10 assertions** in `export/export.service.test.ts` (escape edge cases, BOM, CSV structure)
- **+11 assertions** in `cycle/cycle.service.finalize.test.ts` (state machine guards, audit writes)
- Running total across Sprint 1+2+3: **~65 unit assertions**

## Known gaps (for Phase 2 / Sprint 4+)

- **S3 presigned URLs** — Sprint 3 still uses local filesystem + HMAC. Phase 3 swap planned.
- **httpOnly cookies** — sessionStorage remains the dev stub.
- **Per-tenant timezone** for reminders — still UTC.
- **HTML email templates** — plain text only in Sprint 3.
- **Custom modal for confirmation dialogs** — Sprint 3 uses `window.confirm()` for lock/close; shadcn/ui dialog in Sprint 4+.
- **AI scoring** — all Phase 2 work. `AiSuggestionBadge` is a stub that reads "No AI suggestion yet (Phase 2)".

## Deploy Day (2026-05-29)

Follow [DEPLOYMENT_RUNBOOK.md](ops/DEPLOYMENT_RUNBOOK.md) steps 1-8. Pre-flight gates G1–G7 must all be green before tagging `v1.0.0-hyper-mvp`.

## Go-live checklist (Monday 2026-06-01)

1. 08:00 IST — Final health check on prod
2. 08:30 IST — HR sends launch email to 500+ employees
3. 09:00 IST — HR clicks **Activate cycle** in `/hr/cycles/[id]`
4. 09:00–09:30 IST — Tech Lead watches dashboards
5. 17:00 IST — End-of-day adoption report in `#skillforge-eng`

**The Hyper-MVP is live.**
