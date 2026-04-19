# SkillForge AI — Manager Quick Guide

> **For**: People managers · **Read time**: ~10 minutes · **Version**: 1.0 · **Last updated**: 2026-04-19
> **Full guide**: [`../USER_GUIDE.md`](../USER_GUIDE.md) · **Support**: `skillforge-support@qualtech.ai`

If your role pill says `MANAGER`, this one-pager covers your core workflow. You also do everything an employee does — see [Employee Quick Guide](USER_GUIDE_EMPLOYEE.md) for that half.

---

## What you'll do on SkillForge

1. **Review your reports' self-assessments** and supporting artifacts.
2. **Score each dimension** with a rationale — your number is the one that sticks.
3. **Override AI suggestions** (Phase 2) with written justification when you disagree.
4. **Read team overview charts** to spot capability patterns.

---

## The one rule you need to remember

> **AI scores are advisory. Your number wins. Every time.**

When Phase-2 AI suggestions arrive, they show up as a badge next to your input. You decide — agree, adjust up, adjust down. If you adjust by more than 0.5 points, the platform requires a written rationale and logs it. This is the invariant that keeps SkillForge human-in-the-loop.

---

## Flow 1 — Find who needs scoring

Sidebar → **Team roster** (`/team`).

**What you'll see:**
- Your direct reports with their current-cycle assessment status.
- A **Pending / All** filter — default is Pending, which is usually what you want.
- Target maturity level per report.

> _Screenshot placeholder: `screenshots/manager-01-team-roster.png` — the roster filtered to Pending with rows showing status pills._

**Statuses that mean "you're up":**
- `self_submitted` — employee finished their side
- `manager_in_progress` — you started but didn't submit
- `ai_analyzed` (Phase 2) — AI has analyzed, now awaiting you

Click a row → lands you on the manager scoring form.

---

## Flow 2 — Score a report

Path: `/team/[userId]/assessment/[assessmentId]`

### The form at a glance

| Column | What's in it |
|---|---|
| **Left nav** | Dimension list — click to jump |
| **Main body** | Per-dimension card: employee's self-score + comment + artifacts, AI suggestion (Phase 2), your manager-score input, mandatory rationale |
| **Right sidebar** | Live composite preview — updates as you score |
| **Footer** | Save draft / Submit scores |

> _Screenshot placeholder: `screenshots/manager-02-scoring-form.png` — the full scoring page with employee self-score, AI suggestion badge, manager input, rationale, and sticky composite preview._

### Per dimension

1. **Read the employee's self-score + comment** (muted grey, can't be edited by you).
2. **Click any attached artifact** to preview/download — evidence counts.
3. **Check the AI suggestion** (Phase 2 — placeholder today).
4. **Set your manager score** — `0.00` to `5.00`, step of `0.01`.
5. **Write your rationale** — minimum 20 characters. Required.

**If you override an AI suggestion by >0.5**, the form flags the delta and requires a longer rationale. This isn't a speed bump for its own sake — the audit log uses it to feed the Phase-2 bias-detection panel that compares your deltas across reports.

### Save or submit

- **Save draft** — parks everything. Come back later. Auto-save also runs every 30s.
- **Submit scores** — final. Status moves to `manager_scored`. You can't edit after this.

**Before Submit is enabled**, every dimension must have a score AND a rationale.

---

## Flow 3 — Read your team's shape

Sidebar → **Team overview** (`/team/overview`).

**Three views on the same page:**
- **Team radar** — average self-score vs. average manager-score, overlaid. Gaps between the two are your signal:
  - Self > Manager by a lot → your team over-rates themselves (common on *Prompting*).
  - Manager > Self by a lot → your team under-rates themselves (common on *Responsible-AI awareness*).
- **Per-person mini-cards** — one radar tile per report. Click for their full scorecard.
- **Completion donut** — filterable by cycle.

> _Screenshot placeholder: `screenshots/manager-03-team-overview.png` — dual-layer radar + mini-card grid + completion donut._

---

## Flow 4 — Handle the edge cases

### I need to fix a score I already submitted

1. Ask your HR Admin to **Reopen manager scoring** for that report.
2. They'll do it from `/hr/cycles/[id]` — one click.
3. Your user id is logged as the requester.
4. Make your edit, re-submit.

### A report submitted their self-assessment after I started scoring

You'll see a banner at the top of the form: *"Updated 3 min ago — refresh to see changes"*. Refresh. Your in-progress draft is preserved. Their new evidence appears in the artifact slots.

### I'm leaving the org — how do I hand off my team?

HR Admin re-parents your reports under the new manager via `/users`. Your draft scorings travel with the assessment record (not with you), so the new manager inherits your partial work and can finish it.

### I want to score someone who isn't my direct report

You can't. The server checks ownership on every read. Only HR Admin or Super Admin can score cross-team, and their actions are audit-logged with elevated flags.

---

## Cheat sheet

| I want to… | Go to… |
|---|---|
| See who needs scoring | `/team` → filter Pending |
| Score a report | Click the row → the scoring form |
| See my team's capability shape | `/team/overview` |
| Read a report's history | `/team/overview` → click their mini-card |
| Fix a submitted score | Ask HR to reopen |
| See my own assessments | `/assessments` (you're an employee too) |
| Change my notifications | `/settings/notifications` |

## Composite calculation — how your scores roll up

The composite score per assessment is a **dimension-weight-weighted average** of your manager scores:

```
composite = Σ (manager_score[i] × weight[i])   where Σ weight[i] = 1.0
```

Weights come from the framework definition (`/frameworks/[id]` if you want to see them — you have read access even without edit access). A framework weighted 40% Prompting + 30% Evaluation + 30% Responsible-AI gives you a preview on the right sidebar that you can watch update live as you score.

---

## Common gotchas

- **"Submit is disabled"** → a dimension is missing either a score or a rationale. Red dots in the left nav show which.
- **"Composite preview looks wrong"** → check the framework weights. If they don't match expectations, the framework may have been cloned; ask HR.
- **"I can't see this person's artifacts"** → the employee may not have uploaded any. Or your session may be expired — refresh.
- **"AI suggestion says 'not yet available'"** → you're pre-Phase-2. This is expected. Score manually as usual.
- **"The rationale counter is red"** → you're under the 20-character minimum. Add more detail.

## What Phase 2 adds for you

- **AI-suggested scores** with confidence bands (e.g. *"3.5, 85% confident, ±0.3"*).
- **Artifact auto-summaries** — Claude reads the 5 files the employee uploaded and highlights the three most relevant passages, so you don't have to read them all.
- **Rationale template suggestions** — Claude proposes a 2-3 sentence scaffold you can edit, so you're never staring at an empty box.
- **Calibration nudges** — if your scores are systematically higher/lower than peer managers', the Team overview shows a gentle callout.

---

## Need help?

| What's wrong | Who to ping |
|---|---|
| Scoring form broken | `skillforge-support@qualtech.ai` |
| Want to reopen a submission | Your HR Admin |
| Report left mid-cycle | HR Admin (they'll deactivate + cycle-exclude) |
| Suspected security issue | `skillforge-security@qualtech.ai` |
