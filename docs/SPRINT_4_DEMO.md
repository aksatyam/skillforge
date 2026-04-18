# Sprint 4 — Demo Walkthrough

**Sprint window**: 2026-06-01 → 2026-06-12 (Weeks 7–8 — first post-launch sprint)
**Focus**: Dashboards + reporting per BUILD_PLAN §6
**Status**: 3 P1 features landed ✅ + stats backend

## How to run

```bash
make up && pnpm db:generate && pnpm db:migrate:deploy && pnpm db:seed
pnpm dev   # web :3000, assessment-service :4001
```

All three new routes verified loading with HTTP 200 against the running stack.

## New features

### 1. Employee scorecard (`/scorecard`) — BUILD_PLAN §6 #1 (12d)

**What it shows**:
- Header: name, role family, designation, target maturity level pill
- Current cycle panel: composite ring + 4 score pills (self/manager/peer/ai) + maturity target
- Per-dimension radar chart (pure SVG, 3–8 dims, 2–3 series overlay) — falls back to bar table if <3 dims
- Historical trend: SVG line chart across past cycles; "first cycle" empty state for new employees
- Status-aware: hides scores + shows "Awaiting manager review" banner when status < `composite_computed`

**Backend**: `GET /stats/employee/me/scorecard` + `GET /stats/employee/:userId/scorecard`

**Sample live response** (employee dev1 after Sprint 3 E2E):
```
user=Neha Kapoor, target=L3
composite=3.91, 4 per-dimension rows
  Tool Usage: self=4 mgr=4.5
  Output Quality: self=3.5 mgr=4
  Sophistication: self=3 mgr=3.5
  Knowledge Sharing: self=4 mgr=4
```

### 2. Manager team overview (`/team/overview`) — BUILD_PLAN §6 #2 (10d)

**What it shows**:
- 4 KPI tiles: Total reports | Completion rate (with donut) | Pending my review | At-risk (≤3 days)
- Team averages panel: Self / Manager / Composite (shows `—` with "Need 3+ scored" hint when cohort <3 — k-anonymity against inference)
- Score distribution histogram (pure SVG)
- At-risk list: sortable by days-to-deadline, row links to manager-scoring page
- Recent activity feed: latest 10 status transitions with relative timestamps
- Tab bar: Overview ↔ Roster (existing `/team`)

**Backend**: `GET /stats/manager/team-overview`

**Sample live response**:
```
reports=2, completion=0.5, pending=0, at-risk=0
activity: Neha Kapoor: finalized, Karthik Raj: assigned
avg scores: null (N<3, masked)
```

### 3. HR reports (`/hr/reports`) — BUILD_PLAN §6 #3 (8d)

**What it shows**:
- Cycle selector (sorted: open → locked → draft → closed)
- Two side-by-side panels:
  - **Completion report**: CompletionDonut + by-role-family table + by-manager table + Download CSV button
  - **Score distribution**: mean/median/stdDev tiles + full-org histogram + "Compare by role family" toggle → small-multiples grid
- Inline banners for loading + error states

**Backend**: `GET /stats/org/completion?cycleId=...` + `GET /stats/org/score-distribution?cycleId=...`

**Sample live response**:
```
Cycle Q2 2026: 1/5 = 0.2 completion
by role family:
  Design: 0/2 (0.00)
  Engineering: 1/2 (0.50)
  Product: 0/1 (0.00)
distribution (N=1): mean=3.91, median=3.91, stdDev=0
  bucket 3.5-4.0: 1 employee
```

## New backend

### `services/assessment-service/src/stats/`
- `stats.module.ts` — NestJS module
- `stats.service.ts` — 4 public methods (employeeScorecard, managerTeamOverview, orgCompletion, scoreDistribution), plus private helpers (`bucketize`, `stats`, `mapStatusToEvent`)
- `stats.controller.ts` — 5 routes, role-gated, zod-validated query params
- `stats.service.test.ts` — 11 assertions covering happy + edge cases (N<3 masking, empty cohort, NotFound, bucket distribution, history separation)

### Key design call — **k-anonymity for team averages**

Team/role-family averages are `null` when cohort <3. Without this, a manager with 1 report could trivially infer that report's score from the "team average". The 3-person floor matches the common industry pattern for people-analytics.

## AppShell nav (post-merge)

```
Dashboard
My Assessments
My scorecard                ← NEW (all roles)
Team overview               ← NEW (manager + hr_admin)
Team roster                 (renamed from "Team")
Frameworks                  (hr_admin)
Users                       (hr_admin)
Cycles                      (hr_admin)
Reports                     ← NEW (hr_admin)
HR Dashboard                (hr_admin)
```

Three agents raced on `AppShell.tsx`. Last-writer was the HR reports agent; all three entries merged correctly.

## Fix included in this sprint

- **Audit interceptor FK violation on unauthenticated requests** — previously tried to write with a sentinel orgId that doesn't exist in `organizations` table, causing noisy `Foreign key constraint violated` errors on every failed login. Now skips the audit write when `req.user.orgId` is absent (auth layer logs the auth failure itself).

## Running tests

```bash
pnpm --filter @skillforge/assessment-service test
# Expected: ~76 assertions passing across all services
# (Sprint 1-3: ~65 + Sprint 4: +11 stats.service.test.ts)
```

## What's next (Sprint 5)

Per BUILD_PLAN §6 Sprint 5: HR admin dashboard polish + richer email templates. Already partly in place from Sprint 3's HR dashboard. Remaining: individual notification preferences, HTML email templates, Swagger back on via proper `nest build` (Sprint 5 technical debt).
