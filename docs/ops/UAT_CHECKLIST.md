# SkillForge AI — UAT Checklist

**Sprint 3 feature #18 — Bug bash + UAT with 20 pilot users**
**Target window**: 2026-05-18 → 2026-05-27 (9 working days)
**Sign-off deadline**: 2026-05-28 EOD (so deploy can proceed 05-29)

## Pilot cohort (20 users)

| Role mix | Count |
|---|---|
| Employees (IC) | 12 |
| Managers | 5 |
| HR Admins | 2 |
| Leadership | 1 |

Selection criteria: mix of engineering, product, design role families; both new hires (≤1y) and tenured (≥3y); include at least one manager with ≥5 direct reports for roster stress-test.

## Test environment

- URL: `https://staging.skillforge.qualtech.internal`
- Data: synthetic tenant cloned weekly from prod schema, zero real PII
- Feature flags: all Sprint 1+2+3 features enabled; Phase 2 (AI) flags OFF

## Test scenarios

### S1 — Employee first-time self-assessment (all 12 employees)
- [ ] Click invite link from email → land on accept-invite page
- [ ] Set password meeting strength rules → redirects to dashboard
- [ ] Dashboard shows "My Assessments" with one open cycle
- [ ] Click into the cycle → self-assessment form renders with rubric dimensions matching role family
- [ ] Score each dimension (0–5), add comments on at least 2
- [ ] Upload an artifact (PDF or DOCX ≤25MB)
- [ ] Wait 30 seconds → observe "Draft saved" status update without manual action
- [ ] Close the browser tab; reopen the form → responses restored from draft
- [ ] Submit → redirect to /assessments; status flips to "Self submitted"
- [ ] Attempt to edit after submission → form is read-only (expected)

### S2 — Manager scoring flow (all 5 managers)
- [ ] Log in, navigate to **Team**
- [ ] Filter "Pending my review" shows only reports with `self_submitted` or higher
- [ ] Click into a report → see employee's self-assessment + their artifacts (read-only)
- [ ] Score each rubric dimension → observe composite preview updating live
- [ ] Enter rationale (≥20 chars) → submit
- [ ] Back on `/team`, the row status shows "Composite computed"
- [ ] Attempt to re-score the same employee → read-only summary shown
- [ ] Verify override audit trail: query `audit_log` in Prisma Studio for that assessment → see entries

### S3 — HR admin cycle management (both HR admins)
- [ ] Log in, navigate to `/hr`
- [ ] KPI strip shows correct active users + open cycles + pending assessments
- [ ] Create a new framework with 5 maturity levels + role mappings for 3 role families
- [ ] Publish the framework → previous framework (if any) auto-archives
- [ ] Create a new cycle using the published framework, startDate=today, endDate=today+7
- [ ] Activate the cycle → assessments materialize for all employees
- [ ] Invite 2 additional test users → copy invite links → both accept
- [ ] Wait for some employees to self-submit → watch completion donut climb
- [ ] Download CSV export → open in Excel → verify all columns + UTF-8 BOM
- [ ] Lock the cycle → self-assessment form blocked (verify as an employee)
- [ ] `Finalize all + Close` → composite_computed rows flip to finalized, cycle → closed

### S4 — Access control smoke test (per-role, sample of 5)
- [ ] Employee cannot see `/hr`, `/users`, `/frameworks`, `/frameworks/new`, `/cycles`
- [ ] Manager cannot see `/hr`, `/users`, `/frameworks/new`
- [ ] HR cannot see another org's data (cross-tenant) — attempt by crafting a URL with a different org_id in path → 404
- [ ] Super admin can access all pages
- [ ] Deactivated user cannot log in → shows "Invalid credentials" (no enumeration leak)

### S5 — Email reminder cron (ops to trigger)
- [ ] DevOps temporarily sets `REMINDER_CRON=* * * * *` (every minute)
- [ ] Verify console-mail output in CloudWatch shows reminders going to `not_started` employees within the 7-day deadline window
- [ ] Verify second run within same 24h skips the same users (idempotency)
- [ ] Verify audit_log has `action='reminder.sent'` entries
- [ ] Reset cron to `0 9 * * *`

### S6 — Edge cases / error paths
- [ ] Upload file >25MB → rejected with clear message
- [ ] Upload unsupported MIME (e.g. `.exe`) → rejected
- [ ] Submit self-assessment missing one rubric dimension → rejected with list of missing dimensions
- [ ] Submit manager assessment with rationale <20 chars → rejected
- [ ] Re-use an already-accepted invite link → rejected "Invite already accepted"
- [ ] Expired invite link (manually set `invite_expires_at` in the past) → rejected "Invite expired"
- [ ] Manager attempts to score an employee who is not their direct report → 403
- [ ] HR attempts to transition closed → open → rejected (terminal state)
- [ ] HR attempts to unlock a locked cycle with finalized assessments → rejected

### S7 — Performance smoke (DevOps, not pilots)
- [ ] k6 test: 200 concurrent employee self-assessment submits over 10 min → p95 <500ms, 0 errors
- [ ] 10 concurrent HR CSV exports (5000-row cycle) → all complete, no OOM
- [ ] Postgres slow-query log: no queries >500ms in the hour after the load test

## Bug reporting format

One GitHub issue per bug, tagged `uat-sprint3`. Template:
```
Title: [S<scenario>] <short description>
Severity: Critical / High / Medium / Low
Reproducer:
  1. ...
  2. ...
Expected:
Actual:
Environment: staging, user: <pilot email>
Screenshot/video: (link)
```

## Exit criteria for sign-off

To sign off Sprint 3 UAT and proceed to 05-29 deploy:

- [ ] All 20 pilot users have completed at least S1 (self-assessment)
- [ ] All 5 managers have completed S2 at least once
- [ ] Both HR admins have completed S3 end-to-end
- [ ] S4 access-control results: zero violations
- [ ] S5 reminder cron: idempotent
- [ ] S7 performance: p95 <500ms at 200 users
- [ ] **Open P0/Critical bugs: 0**
- [ ] **Open P1/High bugs: ≤5 with documented workarounds**

## Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Tech Lead | TBD | | |
| Product Owner | TBD | | |
| QA Lead | TBD | | |
| HR Representative | Priya Sharma | | |
| Security Lead | TBD | | |

Once signed, attach this file (filled) as the UAT evidence in the release runbook.
