# Sprint 2 — Demo Walkthrough

**Sprint window**: 2026-05-04 → 2026-05-15 (Weeks 3–4)
**Exit criteria** (BUILD_PLAN.md §5): *Employees self-assess and upload artifacts. Managers see their team's submission status.*
**Status**: all 6 P0 features landed ✅

## How to run

```bash
pnpm install                    # picks up bullmq, ioredis, nodemailer
make up                         # Postgres + Redis via brew
pnpm db:generate
pnpm db:migrate:dev             # applies 0001_init, 0002_enable_rls, 0003_add_responses_json
pnpm db:seed                    # Qualtech + 10 users, framework, open cycle
pnpm dev                        # web:3000, assessment-service:4001
```

## Demo script (15 minutes)

### 1. HR activates the cycle (2 min)
- Sign in as `hr@qualtech.com` / `Passw0rd!`
- Go to **Cycles** → click the seeded "Qualtech AI Capability — April–June 2026" cycle (status `open` via seed)
- In Sprint 2 HR can also create a fresh draft cycle → click **Activate** → assessments materialize for every employee

**Under the hood**: `POST /cycles/:id/status {status:'open'}` runs `CycleService.activate()` which does `createMany({ skipDuplicates: true })` for every eligible user → `Assessment` rows with `status='not_started'`.

### 2. Employee self-assesses (5 min)
- Sign in as `dev1@qualtech.com` / `Passw0rd!`
- Dashboard → **My Assessments** → shows the Q2 2026 cycle card
- Click **Start self-assessment** → `/assessments/[id]` opens
- Form renders one row per rubric dimension from the `RoleMapping` for the employee's role family (Engineering → Tool Usage, Output Quality, Sophistication, Knowledge Sharing)
- Enter scores 0–5 + optional comments
- **Draft auto-saves every 30 seconds** (visible via "Saved X ago" indicator)
- Upload an artifact via the side panel (PDF/docx/etc., ≤25MB) → drag-drop or file picker → progress bar → artifact row appears
- Submit → redirects back to `/assessments` → status badge flips to `● Self submitted`

**Under the hood**:
- `POST /assessments/self/draft` writes `responsesJson.self = { responses, savedAt }` without touching `status`
- `POST /assessments/self/submit` validates that every required rubric dimension has a score, sets `selfScore` (unweighted average), `status='self_submitted'`, `submittedAt`
- Artifact flow: `POST /artifacts/upload-url` → HMAC-signed URL → `PUT /artifacts/:id/upload?token=...` (public, token-gated) → stored at `STORAGE_LOCAL_PATH/<artifactId>.bin`

### 3. Manager sees the team roster (2 min)
- Sign out → sign in as `eng.manager@qualtech.com` / `Passw0rd!`
- Go to **Team**
- Table shows direct reports with status badges:
  - Neha Kapoor → ● Self submitted (just submitted)
  - Karthik Raj → ● Not started (red)
- Filter **"Pending my review"** → only employees who have submitted to you

**Under the hood**: `GET /assessments/team/list` finds users where `managerId = <current user>`, joins `assessments` for each, orders by cycle start + name.

### 4. Cycle progress for HR (1 min)
- Back as HR → Cycles → click the cycle → "Progress" section shows completion breakdown
- `GET /cycles/:id/progress` returns `{ total, submitted, completionRate, byStatus }`

### 5. Reminder cron (background — 5 min)

This is the BullMQ daily-digest job. For demo, trigger manually:

```bash
# In a separate terminal with the dev server running:
curl -X POST http://localhost:4001/admin/reminders/run \
  -H "Authorization: Bearer <super_admin JWT>"
# (admin trigger is wired in Sprint 3; for Sprint 2 the cron fires at 09:00 UTC)
```

For Sprint 2 demo: wait for the scheduled run, or set `REMINDER_CRON='* * * * *'` temporarily to fire every minute.

**Console output** (EMAIL_MODE=console):
```
[Mailer] [console-mail] to=dev2@qualtech.com subject="Reminder: your self-assessment for Qualtech AI Capability — April–June 2026 is due in 7 day(s)"
Hi Karthik Raj,

Your self-assessment for the "Qualtech AI Capability — April–June 2026" cycle is still not started. ...
```

**Under the hood**:
- BullMQ repeatable job → worker iterates `open` cycles with `endDate` within 7 days
- For each cycle, finds assessments with `status='not_started'`
- `SET NX EX 86400` claims the idempotency key `reminder:sent:<userId>:<YYYYMMDD>` in Redis
- Mail sent via mode-aware `MailerService` (console / smtp / ses)
- Audit row written: `action='reminder.sent'` or `'reminder.failed'`

## Sprint 2 ticket status

| # | Feature | Backend | Frontend | Tests |
|---|---|---|---|---|
| 7 | Cycle lifecycle (draft→open→locked→closed) | `cycle.service.ts:activate/transition/getProgress` | `/cycles/[id]` progress shown | `cycle.service.test.ts` (9 cases) |
| 8 | Self-assessment module | `assessment.service.ts:saveSelfDraft/submitSelf` | `/assessments/[id]` multi-step form + auto-save | `assessment.service.test.ts` (12 cases) |
| 9 | Artifact upload | `artifact.service.ts` + controller with public PUT | `ArtifactUploader.tsx` drag-drop | `artifact.service.test.ts` (8 cases) |
| 10 | Self-assessment UI | (see #8) | `/assessments/[id]` + `ArtifactUploader.tsx` | Manual |
| 11 | Manager roster | `assessment.service.ts:listForManager` | `/team` page with filters + badges | (covered by #8 tests) |
| 12 | Email reminders | `notifications/*` — BullMQ worker + scheduler + mailer | — | `reminder.worker.test.ts` (4 cases) |

**Total test assertions added**: ~33 new cases (9 cycle + 12 assessment + 8 artifact + 4 reminder), bringing Sprint 1+2 total to ~44.

## New artifacts in this sprint

- `docs/design/reminder-idempotency.md` — Redis vs new-table decision record
- `packages/db/prisma/migrations/0003_add_responses_json` — adds `responses_json` JSONB to `assessments`
- `services/assessment-service/src/notifications/` — 4 files for the reminder subsystem
- `apps/web/components/ArtifactUploader.tsx` — reusable drag-drop uploader
- `apps/web/app/(app)/assessments/` — employee-facing self-assessment pages
- `apps/web/app/(app)/team/page.tsx` — manager roster

## Known gaps (deferred to Sprint 3)

- **S3 presigned URLs** — Sprint 2 uses local filesystem + HMAC token; `STORAGE_MODE=s3` switches in S3 presigned URL generator
- **httpOnly cookies for session** — sessionStorage is still the dev stub
- **Per-tenant timezone** for reminders — all Sprint 2 cron runs at UTC
- **Richer email templates (HTML + i18n)** — Sprint 2 sends text/plain
- **Admin UI for triggering a reminder cron run** — currently waits for scheduled fire
- **Manager assessment scoring UI** — backend exists (`POST /assessments/manager/submit`); UI is Sprint 3

## Sprint 2 retro prompts

1. Is the 30-second draft-save cadence right, or too chatty?
2. Does the rubric-dimension-driven form feel natural for employees, or do we need a richer per-dimension guide?
3. Should the reminder cron be one job per tenant (Phase 3 timezone support) or keep the global UTC job?
4. Are we comfortable with HMAC-token uploads as the Sprint 2→3 bridge, or should we jump to S3 presigned now?
