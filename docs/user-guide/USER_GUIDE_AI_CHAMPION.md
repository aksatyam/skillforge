# SkillForge AI — AI Champion Quick Guide

> **For**: AI Champions · **Read time**: ~6 minutes · **Version**: 1.0 · **Last updated**: 2026-04-19
> **Full guide**: [`../USER_GUIDE.md`](../USER_GUIDE.md) · **Support**: `skillforge-support@qualtech.ai`

If your role pill says `AI_CHAMPION`, you're the organizational steward of rubric quality and (in Phase 2) AI-score calibration. Your job splits differently across Phase 1 and Phase 2 — this guide covers both honestly.

---

## Where you fit

- **Phase 1 (now)**: framework co-owner with HR Admin. Rubric quality + score-distribution analysis.
- **Phase 2 (June 2026+)**: calibration dashboard + bias detection + prompt monitoring.

You do NOT own cycles or user invites in Phase 1 — those stay with HR Admin until Phase 2 splits the UIs.

---

## Your Phase-1 responsibilities

### 1. Rubric quality

Every new framework passes through you before it's published.

**The rubric-quality checklist:**
- [ ] Each of the 5 maturity levels has a distinct, concrete descriptor (not *"somewhat better than level 3"*).
- [ ] The gap between level 3 and level 4 is consistent across dimensions (no dimension should make a level 4 uniquely easy or hard to hit).
- [ ] Dimensions are orthogonal — scoring high on *Prompting* shouldn't mechanically mean scoring high on *Evaluation*.
- [ ] Role-target mappings make sense — a Junior Engineer hitting level 5 on *Workflow automation* is aspirational, not expected.
- [ ] Weights sum to 1.0 (the form enforces this; double-check the *distribution* — a framework weighted 80% on one dimension probably wants re-thinking).

### 2. Score-distribution audit

After each cycle finalizes, you pull `/hr/reports` → **Capability heat-map** and look for:

- **Statistical flatness** — every manager in a business unit scores every dimension at level 3. Usually low engagement, not low variance.
- **Ceiling clustering** — 40%+ of employees hitting level 5 on a dimension. Either the rubric is too easy, or the dimension is culturally "the nice one to score high on".
- **Role-target gaps** — ≥40% of a role below target. Feed to L&D.
- **Outlier list** — individual cases. Intended as a conversation-starter with the manager, not a verdict.

> _Screenshot placeholder: `screenshots/ai-01-heat-map.png` — the Capability heat-map with dimension × role grid colored by average composite._

### 3. Training-need feed

The gaps you surface feed Qualtech's L&D pipeline. Your artifact is typically a one-page note per cycle:

```
Cycle: H1 2026 — AI Capability Review
Framework: Engineering AI Capability v2
Gaps ≥ 40% below target:
  • Responsible-AI awareness (Senior Engineer) — 52% below target, composite avg 2.1
  • Evaluation (Product Manager) — 48% below target, composite avg 2.3
Recommended training:
  • Q3 cohort: Responsible-AI workshop (2-day)
  • Q3 self-paced: Evaluation fundamentals course
```

---

## What screens you have access to (Phase 1)

| Screen | Access | Notes |
|---|---|---|
| `/dashboard` | Full | Read-only organization-wide KPIs |
| `/assessments` + `/scorecard` | Full (your own) | You're also an employee |
| `/frameworks` + `/frameworks/new` + `/frameworks/[id]` | Full edit | Create, edit drafts, publish, archive |
| `/hr/reports` | Read | Capability heat-map, cycle-over-cycle delta, role-target gap, outliers |
| `/users` | **Read-only** in Phase 1 | You can see role-target assignments but not change them |
| `/cycles` + `/hr` + `/hr/cycles/[id]` | **No access** in Phase 1 | HR Admin owns these until Phase 2 |
| `/hr/templates` | **No access** in Phase 1 | HR Admin owns CSV templates |

> _Screenshot placeholder: `screenshots/ai-02-framework-editor.png` — the framework editor with dimension list, weight sliders, and maturity-level descriptor text areas._

---

## Phase-2 preview — what you'll actually own

### Calibration dashboard (`/ai/calibration` — coming)

- **Manager-vs-AI delta heat-map** — for each (dimension × manager), the systematic delta between AI suggestion and final manager score. Red cells mean "manager consistently deviates from AI here."
- **Confidence-vs-accuracy curve** — AI suggestions with high confidence that ended up far from the manager's score. Signals to the ML team that confidence is mis-calibrated.
- **Cycle-over-cycle drift** — as frameworks evolve and Claude gets retrained, has the AI↔manager agreement shifted?

### Bias detection panel

Pairs (manager × role) where the manager-AI delta is consistently skewed in one direction. Example: *"Manager-27 consistently scores Product Managers on Evaluation 0.6 points higher than AI suggests."* This is a conversation opener with HR, not an automated action.

### Prompt monitoring

Anonymized samples of Claude input/output — verify PII stripping is working, spot prompts where Claude leans on a dimension-name-keyword rather than the evidence.

### Rubric A/B tester

Pick a dimension with high inter-rater variance. Stand up two alternative level-3-descriptor texts. Route half of new cycles to version A, half to B. Measure whether variance drops. Pick a winner, publish.

---

## Phase-1 → Phase-2 migration checklist

When Phase 2 lands for you, you'll need:

- [ ] An `ai_champion` account separate from your HR Admin account (if you've been dual-hatting).
- [ ] MFA enrolled (required for AI Champion going forward).
- [ ] A baseline snapshot of inter-rater variance per dimension for the *current* framework — that's your before-picture for A/B tests.
- [ ] Agreement with HR Admin on who owns what after the split (frameworks shared? tie-break to AI Champion?).

---

## Cheat sheet

| I want to… | Where | Phase |
|---|---|---|
| Edit a framework | `/frameworks/[id]` | 1 |
| Publish a framework | `/frameworks/[id]` → Publish | 1 |
| See score distributions | `/hr/reports` → Capability heat-map | 1 |
| Find underperforming cohorts | `/hr/reports` → Role-target gap | 1 |
| See AI calibration | `/ai/calibration` | 2 |
| Detect rater bias | Bias panel | 2 |
| Audit Claude prompts | Prompt monitor | 2 |
| A/B a rubric | Rubric tester | 2 |

## Common gotchas

- **"I can't edit this framework"** → it's published. Clone it.
- **"Weights don't sum to 1.0"** → the form blocks save. Adjust until the sum indicator goes green.
- **"Heat-map looks uniform"** → low variance across all dimensions is usually a signal about *rater behavior*, not about *employee capability*. Talk to HR.
- **"I don't see manager-AI deltas"** → that's Phase 2. In Phase 1 there are no AI suggestions to compare against.

## Key invariants you help uphold

1. **AI scores are advisory only.** You calibrate the suggestion engine, but you never write code or configuration that lets AI scores bypass manager review.
2. **PII stripped before Claude.** Part of your Phase-2 prompt-monitoring job is to spot any regression here — if you see a name or email leak into a prompt, file a P0 security ticket immediately.
3. **Framework changes are versioned, not mutated.** You never edit a published rubric; you always clone-edit-publish.

---

## Need help?

| What's wrong | Who to ping |
|---|---|
| Rubric publishing is broken | `skillforge-support@qualtech.ai` |
| Suspected PII leak in a prompt | `skillforge-security@qualtech.ai` (P0) |
| Need access to a Phase-2 screen | Super Admin — role promotion + feature flag |
| Want to discuss calibration approach | `#skillforge-ai` Slack |
