# SkillForge AI — HR Admin Quick Guide

> **For**: HR Administrators · **Read time**: ~12 minutes · **Version**: 1.0 · **Last updated**: 2026-04-19
> **Full guide**: [`../USER_GUIDE.md`](../USER_GUIDE.md) · **Support**: `skillforge-support@qualtech.ai`

If your role pill says `HR_ADMIN`, you're the owner of the cycle. This one-pager covers everything you do in a typical 4-week cycle, plus the edge cases that land on your desk.

---

## Your five responsibilities

1. **Run the cycle** — draft → open → lock → bulk-finalize → close.
2. **Manage users** — invites, role changes, reassignments, deactivations.
3. **Own the framework catalog** (shared with AI Champion where that role exists).
4. **Pull reports** and export CSVs for the appraisal system.
5. **Handle exceptions** — reopen scorings, fix rosters, investigate stragglers.

---

## Flow 1 — Create and open a cycle

### Step 1: Create (`/cycles` → **New cycle**)

Fill in:
- **Name** — e.g. *"H1 2026 — AI Capability Review"*.
- **Framework** — pick a Published framework. Draft frameworks don't appear.
- **Participants** — select users. You can filter by role or department.
- **Target maturity per role** — inherited from framework role mappings; override if needed.
- **Deadlines** — `selfAssessmentDeadline`, `managerScoringDeadline`. The system emails reminders at 48h/24h/at-deadline.

Save as **draft**.

> _Screenshot placeholder: `screenshots/hr-01-cycle-draft.png` — the new-cycle form with framework picker, roster, and deadlines._

### Step 2: Review roster, then open

Before opening, walk the roster one more time. **This is where mistakes propagate** — once open, removing a participant leaves an orphaned assessment record.

Click **Open cycle**:
- Status → `open`
- All participants get an email
- Employees see the cycle on `/dashboard` and `/assessments`

---

## Flow 2 — Monitor a running cycle

Sidebar → **HR Dashboard** (`/hr`).

**Your command center:**
- **KPI strip** — open cycles, total users, avg completion %, avg manager-scoring turnaround.
- **Live cycle cards** — completion donut + scoring donut per cycle. Quick-action buttons.
- **Outlier badges** — yellow `● At Risk` pill on any cycle where nothing has moved in 48+ hours.

> _Screenshot placeholder: `screenshots/hr-02-dashboard.png` — KPI strip + cycle cards with progress donuts._

### Find stragglers

Click a cycle card → `/hr/cycles/[id]`. You see every participant row with their current status. Sort by status to find:
- `not_started` — employees who haven't started. Nudge them.
- `self_submitted` but old — managers who are sitting on submissions. Nudge them.

The platform sends automated reminders at 48h/24h/at-deadline — your nudge is for escalation cases.

---

## Flow 3 — Lock, finalize, close

### Lock

After the manager-scoring deadline passes, click **Lock cycle** on `/hr/cycles/[id]`.

- Status → `locked`
- No new scoring edits
- You can unlock back to `open` — as long as you haven't finalized yet

**Warning modal will say:** *"Locking blocks all further edits. Manager scoring drafts will be frozen. Continue?"* Read it.

### Bulk finalize

Click **Bulk finalize**:
- System computes every composite using framework weights.
- Typical time: ~2 seconds per 100 assessments.
- If any assessment is still `self_submitted` (manager never scored), you get a *"Skip unscored?"* prompt — resolve per row or all-at-once.
- Each assessment moves to `composite_computed`.
- Employees get a *"Your assessment is finalized"* email.

> _Screenshot placeholder: `screenshots/hr-03-bulk-finalize.png` — the finalize progress modal with per-row status + skip-unscored toggle._

### Close

Click **Close cycle**:
- Status → `closed`
- Audit log records `cycle.closed` with your user id
- Cycle moves to "Recently closed" on `/hr`
- **One-way** — you cannot reopen a closed cycle

---

## Flow 4 — Export for appraisal

Two paths into the CSV export:

1. **Per cycle**: `/hr/cycles/[id]` → **Export to CSV**
2. **Cross-cycle**: `/hr/reports` → **Export**

### The CSV format

- **RFC 4180** — quoted fields, doubled-quote escaping.
- **UTF-8 with BOM** — Excel renders non-Latin characters correctly out of the box.
- **Fixed column order** — your appraisal system's import template is pinned to this order.
- **One row per (employee, dimension) pair** + a composite row per employee.

### Export templates (`/hr/templates`)

If your appraisal system takes a different column subset or order:

1. `/hr/templates` → **New template**.
2. Name it (e.g. *"Workday H1 2026"*).
3. Pick columns from the allowlist — disallowed fields (`user.password`, `orgId`, `responsesJson`) don't appear in the picker.
4. Order them.
5. Save.

Templates surface as a dropdown on the CSV export screen.

> **Why the allowlist matters**: templates are **default-deny**. We can't accidentally export a field that shouldn't leave the platform. See ADR-012 in `docs/adr/` for the decision rationale.

> _Screenshot placeholder: `screenshots/hr-04-export-templates.png` — the template editor with column picker and live preview._

---

## Flow 5 — Manage users (`/users`)

### Invite a new user

1. **Invite user** button.
2. Fill in email, role, manager, target maturity.
3. Click send — system generates a 7-day one-time link and emails it.

### Edit a user

- **Change role** — cannot demote yourself; cannot promote to super_admin (that's Super Admin territory).
- **Change manager** — reassigns all their assessments under the new manager.
- **Change target maturity** — affects future cycles, not past.
- **Cannot change email** — deactivate + reinvite if an email really changes.

### Deactivate

Soft-delete. Their history stays on-record; they can't sign in or receive new assessments.

> _Screenshot placeholder: `screenshots/hr-05-users-table.png` — user list with filter, role column, last-sign-in column, and the invite dialog._

---

## Flow 6 — Own the framework catalog (`/frameworks`)

A framework is *what you measure*. Dimensions (up to 20), weights summing to 1.0, 5 maturity-level descriptors each, and role→target mappings.

### Lifecycle

| Status | Editable? | Usable in cycles? |
|---|---|---|
| `draft` | Yes | No |
| `published` | No (immutable snapshot) | Yes |
| `archived` | No | No (but old cycles still reference their snapshot) |

**Publish is one-way.** Need to change a published framework? Clone it, edit the clone, publish the new version with an incremented name. New cycles use the new version; old cycles keep their snapshot.

### Dimension descriptors

The rubric text is what employees read while scoring. **Write it like a user manual, not a spec.** Each of the 5 maturity levels should be distinguishable by someone reading them for the first time. If two adjacent levels feel interchangeable, employees land between them and under-use the scale.

---

## Flow 7 — Handle exceptions

### Reopen scoring for one person

`/hr/cycles/[id]` → find the row → **Reopen manager scoring** (or **Reopen self**). The action is audit-logged with your user id and (in Phase 2) a required reason field.

### An employee left mid-cycle

`/users` → deactivate. Their assessment is excluded from the completion count. Their partial data remains for historical completeness.

### A manager is on leave and scoring is stalled

`/users` → temporarily reassign their direct reports to a backup manager. When they return, reassign back — draft scorings travel with the assessment, not with the manager.

### Force-close a data-quality-compromised cycle

Only Super Admin can force-close. Escalate via email.

---

## Cheat sheet

| I want to… | Go to… |
|---|---|
| See platform health | `/hr` |
| Create a new cycle | `/cycles` → New cycle |
| Open a cycle | `/hr/cycles/[id]` → Open |
| Find stragglers | `/hr/cycles/[id]` → sort by status |
| Lock after deadline | `/hr/cycles/[id]` → Lock |
| Bulk-finalize | `/hr/cycles/[id]` → Bulk finalize |
| Close a cycle | `/hr/cycles/[id]` → Close |
| Invite someone | `/users` → Invite user |
| Change someone's role | `/users` → edit row |
| Pull cross-cycle report | `/hr/reports` |
| Export CSV | `/hr/cycles/[id]` or `/hr/reports` → Export |
| Create an export template | `/hr/templates` |
| Publish a framework | `/frameworks/[id]` → Publish |

## Metrics you should watch

| Metric | Target | Where |
|---|---|---|
| Self-assessment completion by deadline | >95% | `/hr` cycle card donut |
| Manager-scoring turnaround | <5 business days from self_submitted | `/hr` KPI strip |
| Re-opened assessments per cycle | <2% | Audit log |
| Average composite vs. role target (gap) | <10% | `/hr/reports` → Role-target gap |
| Outliers (>2σ below peer avg) | Tracked, not targeted | `/hr/reports` → Outlier list |

## Common gotchas

- **"My framework edit doesn't save"** → it's published. Clone it.
- **"The export CSV has mojibake in Excel"** → open with Data → From Text/CSV and set UTF-8, or upgrade Excel. Our BOM should fix it automatically.
- **"A user isn't getting reminder emails"** → check `/settings/notifications` for them (Super Admin can see). They may have turned off deadline reminders.
- **"The completion donut hasn't moved in 2 days"** → yellow At-Risk badge appears. Time to nudge.
- **"I can't promote someone to super_admin"** → correct. Only an existing Super Admin can do that.

## What Phase 2 adds for you

- **HRMS integration** — bi-directional sync with your HRIS. No more CSV copy-paste.
- **Audit log viewer in-app** — today you query the database; Phase 2 adds a searchable UI.
- **Bulk-invite from CSV** — upload a CSV of new hires; one-shot invites.
- **Scheduled cycle runs** — "every 6 months, on these dates, open a cycle with this framework."
- **PDF report export** — `/hr/reports` gets a "Download as PDF" button alongside CSV.

---

## Need help?

| What's wrong | Who to ping |
|---|---|
| Cycle won't open / finalize / close | `skillforge-support@qualtech.ai` with request-ID |
| Need a new export column | `skillforge-support@qualtech.ai` (schema change; sprint-planned) |
| Suspected data leak or cross-tenant | `skillforge-security@qualtech.ai` **immediately** |
| Force-close a cycle | Super Admin |
| HRMS integration timing | Phase 2 — see `BUILD_PLAN.md` §4.2 |
