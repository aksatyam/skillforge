---
name: sf-assessment-workflow
description: Generate SkillForge assessment workflow components — self-assessment forms, manager evaluation UIs, peer-review flows, artifact upload, and scoring logic. Use when the user asks about "assessment flow", "self-assessment", "manager scoring", "peer review", "composite score", or mentions the assessment cycle lifecycle.
---

# Assessment Workflow Generator

Scaffolds end-to-end assessment flow: backend state machine, frontend forms, and scoring engine. Matches Phase 1 P0 features #3, #4, #5, #6, #10.

## Assessment cycle state machine

```
draft  ──(open cycle)──▶  open  ──(lock)──▶  locked  ──(finalize)──▶  closed
                          │                     │
                          │                     └──(unlock with audit)──▶  open
                          │
                          └──(no self-assessment by deadline)──▶  auto-reminder
```

- `draft`: HR admin is configuring; no employees can see
- `open`: employees can self-assess, managers can score
- `locked`: no new input, scores fixed, awaiting HR finalize
- `closed`: exported to appraisal, read-only

## Assessment record lifecycle (per user per cycle)

```
not_started → self_submitted → manager_in_progress → peer_submitted 
            → ai_analyzed → manager_scored → composite_computed → finalized
```

Each transition writes an audit-log row (actor, from, to, timestamp, optional rationale).

## Composite score formula

```
composite = (w_self × self) + (w_manager × manager) + (w_peer × peer_avg) + (w_ai × ai)
```

Weights (`w_*`) live in `organization.settings_json.assessment_weights` — tenant-configurable. Defaults:
- `w_self = 0.15`
- `w_manager = 0.50`
- `w_peer = 0.20`
- `w_ai = 0.15`

Sum must equal 1.0 — validate at config time.

## Files to generate

### Backend
```
backend/services/assessment-service/src/
├── cycle/
│   ├── cycle.controller.ts         # HR CRUD on cycles
│   ├── cycle.service.ts
│   ├── cycle-state-machine.ts      # enforces valid transitions
│   └── dto/create-cycle.dto.ts
├── assessment/
│   ├── assessment.controller.ts
│   ├── assessment.service.ts
│   ├── scoring.service.ts          # composite computation
│   └── dto/{submit-self,submit-manager,submit-peer}.dto.ts
└── artifact/
    ├── artifact.controller.ts      # S3 presigned upload
    └── artifact.service.ts
```

### Frontend
```
frontend/web/app/
├── employee/assessments/
│   ├── page.tsx                    # list current cycles + status
│   └── [id]/
│       ├── page.tsx                # self-assessment questionnaire
│       └── artifacts/page.tsx      # artifact upload
├── manager/team-assessments/
│   ├── page.tsx                    # team roster with progress
│   └── [userId]/page.tsx           # score + review artifacts + see AI suggestion
├── peer-review/
│   └── [assessmentId]/page.tsx     # invited peer flow
└── hr/cycles/
    ├── page.tsx                    # cycle list
    ├── new/page.tsx                # cycle config wizard
    └── [id]/dashboard/page.tsx     # completion + analytics
```

## Key UI patterns

- **Self-assessment**: multi-step form, draft auto-save every 30s, submit button disabled until all required fields complete, allow artifact upload mid-flow.
- **Manager scoring**: side panel shows AI suggestion with `<AiSuggestionBadge>`; manager must click "Accept" / "Override" + enter rationale on override.
- **Peer review**: anonymized by default; HR can un-anonymize only for audit.
- **Artifact upload**: S3 presigned URL, content-type validation, virus scan webhook, 25MB limit.

## Critical rules

- Weights editable only while cycle status = `draft`. Attempting during `open` = 409 Conflict.
- Peer reviewers invited via signed token link — no new auth needed, but link expires with the cycle.
- AI analysis runs async after artifact upload — polling or WebSocket notify.
- When manager scores, `ai_score` + `self_score` are visible but `peer_score` is only visible once `peer_submitted` stage reached (avoid anchoring).

## Learning opportunity

**Question**: Big UX call — should the **employee** see their own AI-suggested score during self-assessment?

- (a) **No** — preserves self-assessment integrity; they score independently, AI is manager-only input.
- (b) **Yes, after submitting self-score** — they see how AI evaluated their artifacts, learns calibration.
- (c) **Yes, before submitting** — transparency, but risks anchoring (they'll match AI to avoid conflict).

The plan (§11.2) tracks "75%+ of managers use AI-suggested scores as reference" as a success metric, but doesn't speak to employee visibility. Your call shapes the entire UI flow for employees.
