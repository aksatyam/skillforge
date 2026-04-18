# SkillForge AI — Build Plan v1.0

**Document ID**: SF-BUILD-PLAN-2026-001
**Date**: 2026-04-18
**Author**: Ashish Kumar Satyam (TechDigital WishTree)
**For**: Qualtech
**Classification**: Internal — Confidential
**Source of truth**: `SkillForge_AI_Project_Plan.docx` v1.0

---

## 1. Execution Summary

SkillForge AI must support the **Qualtech April–June 2026 appraisal cycle** (assessments due end of May). With **today = 2026-04-18**, we have **~6 calendar weeks** before the appraisal window closes.

This forces a three-track build:

| Track | Window | Goal | Scope |
|---|---|---|---|
| **Hyper-MVP** | Weeks 1–6 (by end-May 2026) | Run the appraisal cycle on the platform | Self-assessment + manager scoring + CSV export only |
| **Full Phase 1** | Weeks 1–16 | Plan §4.1 deliverable | All P0 + P1 Phase-1 features |
| **Phase 2 + 3** | Weeks 17–48 | AI intelligence + SaaS productization | Plan §4.2 + §4.3 as-is |

The hyper-MVP and full Phase 1 run in parallel: the same team, but Weeks 1–6 defer P1 work (dashboards, SSO, notifications) to Weeks 7–16.

## 2. Deadline math

- **Today**: 2026-04-18 (Saturday)
- **Monday kickoff candidate**: 2026-04-20 (Week 1, Sprint 1 Day 1)
- **Appraisal assessments due**: 2026-05-31
- **Working days between**: 30 (6 weeks × 5 days)
- **Sprints in window**: 3 two-week sprints
- **Person-days available**: 9 devs × 30 days = 270 person-days
- **Hyper-MVP P0 estimate** (see §5): ~95 person-days
- **Buffer**: ~65% (healthy — accounts for ramp, UAT, production issues)

## 3. Three-phase roadmap (high-level)

### Phase 1 — MVP (Weeks 1–16) — 167 person-days
Ship the internal appraisal cycle. Core assessment/scoring/export + dashboards.

### Phase 2 — AI Intelligence (Weeks 17–32) — 165 person-days
Claude-powered artifact analysis, score suggestion, learning paths, mobile, HRMS bi-directional sync, bias detection.

### Phase 3 — SaaS & Scale (Weeks 33–48) — 150 person-days
Multi-tenant productization: self-service onboarding, billing, marketplace, SOC 2 / ISO 27001, white-label.

---

## 4. Sprint 0 — Foundation (Week 0, 2026-04-20 to 2026-04-24)

**Goal**: Dev-ready. By end of Week 0, any engineer can `git clone && docker compose up && npm run dev` and see a running app.

| Day | Activity | Owner | Done when |
|---|---|---|---|
| Mon | Architecture workshop (Day 1) | Tech Lead + AI Engineer + Frontend Lead | Decisions in §10 resolved; ADRs drafted |
| Tue | Architecture workshop (Day 2) + repo init | Tech Lead | Monorepo scaffolded, CODEOWNERS set |
| Wed | CI/CD pipeline, Docker compose, local DB | DevOps | `push → build → test → lint` green |
| Thu | Design system setup (shadcn/ui tokens, Tailwind config) | UI/UX + Frontend | Storybook running with primitives |
| Fri | DB schema v0 (Organization, User, Framework), auth skeleton | Backend Lead | Migration runs; login returns JWT |

**Sprint 0 exit criteria**:
- [ ] All 10 open decisions in `OPEN_DECISIONS.md` answered
- [ ] Monorepo pushed to GitHub with `main` branch protection
- [ ] CI runs on every PR: typecheck + lint + unit test + build
- [ ] Docker compose stack boots: postgres + redis + api + web
- [ ] `.claude/` skills + hooks validated
- [ ] Team onboarded to Jira/Linear, Confluence, Slack channels

---

## 5. Hyper-MVP — Weeks 1–6 (end-May 2026 appraisal cycle)

**Goal**: Run the actual appraisal cycle on SkillForge. Employees submit self-assessments, managers score, HR exports to the existing appraisal system. That's it.

### Sprint 1 (Weeks 1–2, 2026-04-20 → 2026-05-01)

| # | Feature | Owner | Days | Status |
|---|---|---|---|---|
| 1 | User management + RBAC (employee, manager, hr_admin) | BE-1 | 8 | P0 |
| 2 | Competency Framework Engine — minimal (maturity levels, role mappings) | BE-2 | 6 | P0 |
| 3 | Auth flow (email+password, JWT, refresh) | BE-1 + FE-1 | 4 | P0 |
| 4 | Layout shell + login/logout UI | FE-1 | 3 | P0 |
| 5 | User admin UI (HR invites employees, assigns roles) | FE-2 | 5 | P0 |
| 6 | Migration tooling + seed script with Qualtech roles | BE-2 | 2 | P0 |

**Sprint 1 exit**: HR can log in, define a framework, invite employees. Employees can log in.

### Sprint 2 (Weeks 3–4, 2026-05-04 → 2026-05-15)

| # | Feature | Owner | Days | Status |
|---|---|---|---|---|
| 7 | Assessment cycle lifecycle (draft → open → locked → closed) | BE-1 | 4 | P0 |
| 8 | Self-assessment module (questionnaire render + submit + draft save) | BE-2 + FE-1 | 10 | P0 |
| 9 | Artifact upload (S3 presigned URL, 25MB, content-type validation) | BE-1 | 4 | P0 |
| 10 | Self-assessment UI (multi-step, artifact upload) | FE-2 | 6 | P0 |
| 11 | Manager roster view (team list + submission status) | FE-1 | 3 | P0 |
| 12 | Email reminders (daily digest to incomplete self-assessments) | BE-2 | 3 | P0 |

**Sprint 2 exit**: Employees self-assess and upload artifacts. Managers see their team's submission status.

### Sprint 3 (Weeks 5–6, 2026-05-18 → 2026-05-29)

| # | Feature | Owner | Days | Status |
|---|---|---|---|---|
| 13 | Manager scoring module (review + rubric scores + evidence review) | BE-1 + FE-1 | 8 | P0 |
| 14 | Weighted composite scoring engine | BE-2 | 4 | P0 |
| 15 | CSV/Excel export for appraisal system | BE-2 | 3 | P0 |
| 16 | Assessment lock + finalize (HR closes cycle) | BE-1 | 2 | P0 |
| 17 | Basic HR dashboard (completion % per team, download export) | FE-2 | 5 | P0 |
| 18 | Bug bash + UAT with 20 pilot users | Everyone | 6 | P0 |
| 19 | Production deployment + go/no-go | Tech Lead + DevOps | 3 | P0 |

**Sprint 3 exit (2026-05-29, Friday)**: Qualtech runs appraisal cycle on SkillForge from Monday 2026-06-01.

**Hyper-MVP total: ~95 person-days against 270 available. Buffer absorbs ramp-up + UAT churn.**

---

## 6. Full Phase 1 — Weeks 7–16 (fast-follow)

Complete remaining P0/P1 features from plan §4.1 after the hyper-MVP is live.

### Sprint 4 (Weeks 7–8)
- Employee scorecard dashboard (P1, 12d)
- Manager team dashboard (P1, 10d)
- Basic reporting (completion rates, score distribution) (P1, 8d)

### Sprint 5 (Weeks 9–10)
- HR admin dashboard (org-wide view) (P1, 12d)
- Email notifications — richer templates (P1, 6d, remaining work)

### Sprint 6 (Weeks 11–12)
- SSO integration (SAML 2.0 + OIDC) (P1, 8d)
- Advanced CSV export (multi-tenant-ready columns) (P0, 5d)

### Sprint 7 (Weeks 13–14)
- UAT, bug fixes, hardening (P0, 20d)
- Performance testing (200+ concurrent users)
- Security audit (internal — run `sf-security-audit` skill)

### Sprint 8 (Weeks 15–16)
- Production hardening, runbook, on-call docs
- Release to staging for Phase 2 prep

---

## 7. Phase 2 — AI Intelligence (Weeks 17–32, 165 person-days)

Picks up where hyper-MVP's `ai_score = null` left off.

| Sprint | Deliverables |
|---|---|
| S9 (W17–18) | AI Artifact Analysis (Claude) backbone, Peer Feedback module |
| S10 (W19–20) | AI-Suggested Scores with confidence, Peer Review rollout |
| S11 (W21–22) | Skill Gap Detection, Learning Path Recommendations |
| S12 (W23–24) | Prompt Library, Advanced Analytics heatmaps |
| S13 (W25–26) | HRMS API bi-directional integration, Mobile RN start |
| S14 (W27–28) | LMS integration, Bias detection, Mobile dashboards |
| S15 (W29–30) | Mobile assessments, Bias detection v2 |
| S16 (W31–32) | UAT, security audit, performance testing |

**Key dependencies**:
- Sprint 9 requires `sf-ai-prompt` chain design (decision D5 in §10) locked.
- HRMS integration in S13 requires 2-week discovery in S9 to map target HRMS APIs.

---

## 8. Phase 3 — SaaS & Scale (Weeks 33–48, 150 person-days)

Productize for external sale.

| Sprint | Deliverables |
|---|---|
| S17–18 | Multi-tenant provisioning, org onboarding wizard |
| S19–20 | Subscription + billing (Stripe/Razorpay), tenant config UI |
| S21–22 | White-label (domain mapping, branding), marketplace scaffolding |
| S23–24 | Marketplace for templates + prompt libraries |
| S25–26 | API docs portal (Swagger/Redoc), developer onboarding |
| S27–28 | SOC 2 Type II audit prep, ISO 27001 gap analysis |
| S29–30 | Performance for 10K concurrent users, caching, CDN |
| S31–32 | First external client pilot deployment |

**Gating**: Phase 3 starts only if Phase 2 AI adoption ≥ 60% (per plan §11.2 success metrics).

---

## 9. Monorepo structure (proposed)

```
skillforge/
├── apps/
│   ├── web/                    # Next.js 14+ App Router
│   ├── mobile/                 # React Native (Expo), Phase 2
│   └── api-gateway/            # Kong config / BFF layer
├── services/
│   ├── assessment-service/     # NestJS
│   ├── framework-service/      # NestJS
│   ├── ai-evaluation/          # NestJS + LangChain
│   ├── analytics-service/      # NestJS
│   ├── notification-service/   # NestJS
│   └── integration-service/    # Spring Boot (HRMS, SSO)
├── packages/
│   ├── shared-types/           # DTOs, enums shared FE↔BE
│   ├── ui/                     # shadcn/ui-based design system
│   ├── config/                 # ESLint, TS, Tailwind configs
│   ├── tenant-guard/           # cross-service tenant isolation lib
│   └── audit-log/              # audit-log interceptor library
├── infra/
│   ├── terraform/              # AWS infra
│   ├── docker/                 # Dockerfiles per service
│   └── k8s/                    # Helm charts (Phase 2+)
├── prompts/                    # Claude chain definitions (versioned)
├── migrations/                 # Flyway/Prisma migrations, single source
├── docs/                       # ADRs, runbooks, API docs
└── tools/                      # scripts, codegen, seeds
```

**Why monorepo**: shared types between FE/BE (the 10 data-model entities touch every layer), single lint/test command, atomic cross-service refactors. Turborepo or Nx for caching.

---

## 10. CI/CD pipeline (Sprint 0 deliverable)

**On PR**:
1. Typecheck (tsc --noEmit across all workspaces)
2. Lint (eslint + prettier)
3. Unit tests (Jest + Vitest)
4. Build (every app + service)
5. Run `sf-tenant-check` skill's scan commands in CI
6. Security scan (Semgrep + npm audit)
7. Preview deploy for web (Vercel/Netlify per decision)

**On merge to main**:
8. Integration tests against ephemeral DB
9. Build + push Docker images to ECR
10. Auto-deploy to staging
11. Smoke tests on staging

**On tag `v*.*.*`**:
12. Production deploy (manual approval)
13. Post-deploy smoke tests
14. Slack notification to #skillforge-releases

---

## 11. Environment strategy

| Env | Purpose | Data | Who deploys |
|---|---|---|---|
| Local | Dev | Synthetic seed | Each dev |
| Dev | Shared dev branch integration | Synthetic + 1 test tenant | CI on merge to `dev` |
| Staging | Pre-prod, UAT | Anonymized prod clone | CI on merge to `main` |
| Prod | Qualtech internal (Phase 1–2), external clients (Phase 3) | Real data | Manual release on tag |

**Per-tenant strategy in Phase 3**: staging tenant per major customer for pre-release validation.

---

## 12. Open decisions (blocking Sprint 1 kickoff)

These are captured in `OPEN_DECISIONS.md`. All must be answered before Monday 2026-04-20. Summary:

1. **ORM**: TypeORM vs Prisma
2. **Tenancy strategy**: Schema-per-tenant vs RLS on single schema
3. **Monorepo tool**: Turborepo vs Nx vs pnpm workspaces
4. **Frontend shell**: Unified role-gated vs per-persona
5. **AI output format**: XML tags vs JSON
6. **Confidence model**: Numeric 0–100 vs bucketed (low/med/high)
7. **TenantGuard mismatch behavior**: Reject / super-admin allow / silent rewrite
8. **Employee AI-score visibility**: Never / after-submit / pre-submit
9. **Auth provider**: Keycloak (self-hosted) vs Auth0 (managed)
10. **Queue**: BullMQ on Redis vs SQS vs RabbitMQ

---

## 13. Risks (from plan §10, with build-plan mitigations)

| Risk | Severity | Build-plan mitigation |
|---|---|---|
| MVP timeline | High | Hyper-MVP (Weeks 1–6) cuts to 6 features; full Phase 1 is fast-follow |
| AI hallucination | High | Phase 2 only; manager override + confidence threshold (decision D6) |
| HRMS integration complexity | Medium | Hyper-MVP uses CSV; API integration deferred to Sprint 13 |
| Employee AI resistance | Medium | Hyper-MVP has no AI; Phase 2 introduces it with explicit "suggestion" label |
| Data privacy | High | PII-strip hook + tenant-isolation hook both active from Sprint 0 |
| Scope creep | Medium | P0/P1/P2 discipline enforced in sprint planning; change requests logged in ADRs |
| Key person dependency | Medium | Docs-first: every merge updates README/runbook; pair programming on P0 code |

---

## 14. Team + ownership (Phase 1)

| Person | Role | Primary owns |
|---|---|---|
| TBD | Product Owner | Backlog, acceptance, stakeholders |
| TBD | Tech Lead | Architecture, reviews, ADRs |
| FE-1 | Senior Frontend | Employee/Manager flows, auth UI |
| FE-2 | Senior Frontend | HR admin, dashboards, design-system |
| BE-1 | Senior Backend | Assessment-service, auth |
| BE-2 | Senior Backend | Framework-service, scoring engine, notifications |
| AI-1 | AI/ML Engineer | Phase 2 prep (prompt chains, LangChain wrapper) |
| UX-1 | UI/UX Designer | Wireframes, usability testing |
| QA-1 | QA Engineer | Test plans, automation, UAT coordination |
| DevOps-1 (shared) | DevOps | CI/CD, infra, monitoring |

## 15. Success criteria (MVP launch — plan §11.1)

- [ ] 500+ employees can complete self-assessments
- [ ] Managers can produce composite scores for direct reports
- [ ] HR can export appraisal-ready CSV
- [ ] System handles 200+ concurrent users without degradation
- [ ] All P0 Phase-1 features delivered, tested, signed off
- [ ] Security audit: no Critical or High findings

## 16. References

- Strategic plan: `SkillForge_AI_Project_Plan.docx`
- Memory: `~/.claude/projects/-Users-aksatyam-SelfWork-SkillForge/memory/MEMORY.md`
- Project guide: `CLAUDE.md`
- Skills: `.claude/skills/`
- Hooks: `.claude/hooks/`
- Open decisions: `OPEN_DECISIONS.md`
- Sprint 0 detailed checklist: `docs/SPRINT_0_CHECKLIST.md`
