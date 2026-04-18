# SkillForge — Open Decisions (Sprint 1 Blockers)

All 10 decisions must be resolved by end of Sprint 0 (2026-04-24). Each becomes an ADR in `docs/adr/`.

Mark choice with `[x]` when decided. Add rationale + owner + date in the "Decision" row.

---

## D1. ORM choice

- [ ] TypeORM — decorator-based, feels native in NestJS, mature
- [ ] Prisma — generated types, great DX, excellent migration tooling, adds a codegen step
- [ ] Drizzle — lightweight, TS-first, fewer opinions

**Context**: Phase 1 has 10 core entities, most writes are through services. Developer velocity > ORM elegance.

**Trade-offs**:
- Prisma: fastest onboarding, but its multi-tenant RLS story is weaker (requires raw SQL for `SET app.current_org_id`). Schema-per-tenant in Prisma is an anti-pattern.
- TypeORM: naturally supports schema-per-tenant via `DataSource` per request. More boilerplate.
- Drizzle: lightest, but less tutorial content → slower ramp for mid-level hires.

**Decision**: _______  **Owner**: Tech Lead  **Date**: _______  **ADR**: ADR-001

---

## D2. Tenancy strategy

- [ ] **Schema-per-tenant** (plan §3.3 default) — full isolation, harder aggregations
- [ ] **Row-level with RLS** — single schema, `org_id` everywhere, Postgres RLS policies enforce
- [ ] **Hybrid** — schema-per-tenant for PII-heavy (`users`, `assessments`), shared schema for catalog-ish (`prompt_library`, `frameworks` templates)

**Context**: The plan says schema-per-tenant but early-stage SaaS usually picks RLS for operational simplicity. For Qualtech-only Phase 1, either works; the call matters most in Phase 3 when external clients land.

**Trade-offs**:
- Schema-per-tenant: strongest boundary, migrations run N times, analytics requires union-all views.
- RLS: simplest ops, slight risk if a developer forgets `org_id` filter and RLS is mis-set.

**Decision depends on D1**: Prisma + schema-per-tenant is painful. TypeORM handles either.

**Decision**: _______  **Owner**: Tech Lead  **Date**: _______  **ADR**: ADR-002

---

## D3. Monorepo tooling

- [ ] **pnpm workspaces** — simplest, no extra tool
- [ ] **Turborepo** — task caching, remote cache, great DX
- [ ] **Nx** — more features (generators, affected graph), steeper learning curve

**Context**: Shared FE/BE types make a monorepo mandatory. The question is caching + task running.

**Decision**: _______  **Owner**: DevOps  **Date**: _______  **ADR**: ADR-003

---

## D4. Frontend shell strategy

- [ ] **Unified shell with role-gated nav** — single `<AppShell>`, menu items filtered by `user.role`
- [ ] **Per-persona shells** — `<EmployeeShell>`, `<ManagerShell>`, `<HrShell>`, `<ChampionShell>`, `<LeadershipShell>`

**Context**: Plan §2.2 defines 5 personas with meaningfully different info density.

**Trade-offs**:
- Unified: simpler, less code, easier to add a 6th role. Risk of cluttered UX for employees (hiding manager features).
- Per-persona: cleaner mental model, easier persona-specific theming, but layout duplication.

**Recommendation (non-binding)**: Unified shell in Phase 1 (velocity), split into per-persona in Phase 3 (polish).

**Decision**: _______  **Owner**: UI/UX + Tech Lead  **Date**: _______  **ADR**: ADR-004

---

## D5. Claude output format

- [ ] **XML tags** — `<reasoning>...</reasoning><confidence>85</confidence>` — robust to Claude's natural style
- [ ] **JSON object** — `{"reasoning": "...", "confidence": 85}` — easier schema validation
- [ ] **XML first, parse to JSON** — best of both but adds a parse step

**Context**: Sets convention for ALL Claude chains in Phase 2.

**Trade-offs**:
- XML: Claude is more consistent with XML, less likely to hallucinate structure. Requires custom parser.
- JSON: ajv/zod validation is trivial. Claude sometimes adds markdown fences (` ```json `) that break parsers.

**Decision**: _______  **Owner**: AI Engineer  **Date**: _______  **ADR**: ADR-005

---

## D6. Confidence model

- [ ] **Numeric 0–100** — fine-grained, supports thresholds ("auto-skip below 60")
- [ ] **Three buckets (low/medium/high)** — simpler to communicate to managers
- [ ] **Both** — numeric internally, bucket displayed

**Context**: Affects UI (`<AiSuggestionBadge>`) and bias-detection logic.

**Decision**: _______  **Owner**: AI Engineer + UX  **Date**: _______  **ADR**: ADR-006

---

## D7. TenantGuard mismatch behavior

When JWT `org_id = A` but request URL path contains `/orgs/B/...`:

- [ ] **Reject with 403** — safest, breaks super-admin UX
- [ ] **Allow only if role = super_admin + audit log** — best of both, slight complexity
- [ ] **Silently rewrite to JWT org_id** — user-friendly, hides bugs (not recommended)

**Context**: Propagates across every controller we write.

**Decision**: _______  **Owner**: Tech Lead  **Date**: _______  **ADR**: ADR-007

---

## D8. Employee AI-score visibility

Should employees see their own AI-suggested score during/after self-assessment?

- [ ] **Never** — AI is manager-only input, preserves self-assessment integrity
- [ ] **After employee submits self-score** — learns calibration without anchoring
- [ ] **Before submit** — full transparency, risks anchoring

**Context**: Phase 2 feature, but the flag must be configurable from Phase 1 so we don't refactor later.

**Recommendation (non-binding)**: "After submit" — matches AI-governance principle of explainability without compromising self-assessment.

**Decision**: _______  **Owner**: Product Owner + HR stakeholder  **Date**: _______  **ADR**: ADR-008

---

## D9. Auth provider

- [ ] **Keycloak (self-hosted)** — free, we control data, higher ops burden
- [ ] **Auth0 (managed)** — fast to integrate, SaaS pricing scales with users, locks in some config
- [ ] **Clerk (modern managed)** — best DX but less enterprise SSO maturity than Auth0

**Context**: Qualtech will likely have existing IdP (Azure AD / Okta). SAML 2.0 + OIDC support is mandatory.

**Decision**: _______  **Owner**: Tech Lead + Security Lead  **Date**: _______  **ADR**: ADR-009

---

## D10. Job queue

- [ ] **BullMQ on Redis** — matches Redis cache already in stack, NestJS-friendly
- [ ] **AWS SQS** — managed, fits AWS stack, no extra infra
- [ ] **RabbitMQ** — feature-rich but heaviest ops

**Context**: Used for: email sending, AI artifact analysis (async), CSV export generation, bias-detection cron.

**Recommendation (non-binding)**: BullMQ in Phase 1 (no extra infra), migrate to SQS in Phase 3 if scale demands.

**Decision**: _______  **Owner**: Tech Lead + DevOps  **Date**: _______  **ADR**: ADR-010

---

## Decision log summary

All decisions have **proposed defaults** captured as ADRs. The team may override any of these in the 2026-04-20 Architecture Workshop — the scaffold is structured so each choice is isolated to a small set of files.

| # | Decision | Choice (proposed) | ADR | Date |
|---|---|---|---|---|
| D1 | ORM | Prisma | [ADR-001](docs/adr/ADR-001-orm-prisma.md) | 2026-04-18 |
| D2 | Tenancy | RLS on single schema | [ADR-002](docs/adr/ADR-002-tenancy-rls.md) | 2026-04-18 |
| D3 | Monorepo | pnpm + Turborepo | [ADR-003](docs/adr/ADR-003-monorepo-pnpm-turbo.md) | 2026-04-18 |
| D4 | FE shell | Unified role-gated | [ADR-004](docs/adr/ADR-004-unified-shell.md) | 2026-04-18 |
| D5 | AI output | XML tags → JSON | [ADR-005](docs/adr/ADR-005-claude-output-xml.md) | 2026-04-18 |
| D6 | Confidence | Numeric 0–100, bucketed in UI | [ADR-006](docs/adr/ADR-006-confidence-numeric.md) | 2026-04-18 |
| D7 | TenantGuard | super_admin only + audit | [ADR-007](docs/adr/ADR-007-tenantguard-super-admin.md) | 2026-04-18 |
| D8 | AI visibility | After submit | [ADR-008](docs/adr/ADR-008-employee-ai-visibility.md) | 2026-04-18 |
| D9 | Auth | Keycloak self-hosted | [ADR-009](docs/adr/ADR-009-auth-keycloak.md) | 2026-04-18 |
| D10 | Queue | BullMQ on Redis | [ADR-010](docs/adr/ADR-010-queue-bullmq.md) | 2026-04-18 |
