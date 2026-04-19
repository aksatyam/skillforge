# SkillForge AI — Leadership Quick Guide

> **For**: Leadership (VP+, practice-area leads, functional heads) · **Read time**: ~5 minutes · **Version**: 1.0 · **Last updated**: 2026-04-19
> **Full guide**: [`../USER_GUIDE.md`](../USER_GUIDE.md) · **Support**: `skillforge-support@qualtech.ai`

If your role pill says `LEADERSHIP`, you read, you don't write. SkillForge is your organizational capability telescope — aggregate views, trends, and gap analysis. Your day-to-day touch is low by design.

---

## What you have access to

| Screen | What you'll use it for |
|---|---|
| `/dashboard` | Read-only org-wide KPI strip — total users, open cycles, composite avg across last finalized cycle |
| `/assessments` + `/scorecard` | Your own — you're also an employee |
| `/team` + `/team/overview` | If you have direct reports, you inherit the manager view for your own team |
| `/settings/notifications` | Tune your emails |

## What you explicitly do NOT have

- Cycle management (draft / open / lock / close) — HR owns.
- User invites and role changes — HR owns.
- Framework editing — HR + AI Champion own.
- CSV export — ask HR to run it. This is intentional; data export is an audited event with a specific actor.
- Override a manager score — you cannot, even if you're the manager's manager. Escalate through HR if a score is disputed.

---

## Your three use-cases

### 1. See the capability of your org

`/dashboard` + your direct reports' `/team/overview`.

The dashboard KPI strip answers:
- How many people completed the last cycle?
- What's our composite-score average?
- How has it moved vs. last cycle?

### 2. See the capability of your own team (if you manage)

`/team/overview`. You see:
- **Team radar** — where you're strong, where you have gaps.
- **Per-person mini-cards** — click through to each person's scorecard.
- **Completion donut** — cycle-level progress.

### 3. Read reports HR prepares for you

For most leadership, capability reports come as a quarterly deliverable from HR — a packet of heat-maps, role-gap tables, outlier commentaries. You read, respond, fund training where needed.

If you want real-time access instead of the quarterly packet, ask HR to run `/hr/reports` exports on demand.

> _Screenshot placeholder: `screenshots/leadership-01-dashboard.png` — the leadership landing view with KPI strip and your own team's summary tiles._

---

## What's coming in Phase 2 for you

Phase 2 adds a dedicated **Leadership dashboard** at `/leadership`:

- **Org-wide capability heat-map over time** — animated across cycles. Watch where the org is growing, where it's stuck.
- **Role-group capability scorecards** — your VPs of Engineering, Product, Data each get a scorecard summary; you get the roll-up.
- **Training ROI tracker** — for cohorts that took an L&D program in cycle N-1, how did their composite move in cycle N? Delta × headcount × salary = rough ROI.
- **Capability-to-strategy mapping** — if your org strategy names *"AI-first product development"* as a pillar, which dimensions in the framework feed that pillar? How are we tracking?

---

## Cheat sheet

| I want to… | Go to… |
|---|---|
| See org-wide KPIs | `/dashboard` |
| See my own scorecard | `/scorecard` |
| See my direct reports | `/team/overview` |
| See my own assessment | `/assessments` |
| Manage emails | `/settings/notifications` |

## Common questions

**"Can I see everyone's individual scores?"**
No — only your own direct reports' scores. Organization-wide data is available in aggregate only. HR can run a targeted export for you if a specific business question requires individual detail.

**"Can I override a score in my reporting line?"**
No. Overrides stay with the direct manager. If a score is genuinely disputed, escalate through HR — they can reopen the scoring with an audit trail.

**"Can I invite a new user?"**
No. Your HR Admin does that. If you need someone onboarded urgently, a Slack to HR is the fastest path.

**"Who's looking at my own scorecard?"**
Your direct manager (if any), HR Admin, AI Champion, and Super Admin. Not your peers. Not your direct reports. Not other leadership in sibling practices.

**"Can I export my org's data?"**
Ask HR to run the export. Leadership-direct CSV access was intentionally left out — every export is an audited event, and we want the actor and reason trail to be clean.

---

## Need help?

| What's wrong | Who to ping |
|---|---|
| Want a specific report | Your HR Admin |
| Want Phase-2 Leadership dashboard access | Project lead — it ships June 2026+ |
| Suspected security issue | `skillforge-security@qualtech.ai` |
| Platform outage | Status page: `https://status.skillforge.qualtech.ai` |
