# ADR-013: Phase 2.1 AI Evaluation — Topology, PII, and Suggestion UX

- **Status**: Proposed
- **Date**: 2026-04-20
- **Deciders**: Ashish Kumar Satyam (architect), Qualtech product sponsor (pending sign-off), AI Champion stakeholder
- **Context tag**: Phase 2.1 kickoff — replaces the `AiSuggestionBadge` placeholder landed in Sprint 3

## Context

Phase-1 Hyper-MVP ships on 2026-06-01 with `ai_score` as a nullable column and a stubbed `AiSuggestionBadge` on the manager scoring page. Phase 2.1 (2026-06-08 kickoff per plan, pre-built in Sprints 7–8 of this cycle) turns that column on: AI-suggested scores based on Claude analysis of artifacts + employee self-score + framework rubric.

Three decisions upstream of any service code determine the next six months of work:

1. **Where does the AI call live** — standalone microservice or module inside an existing service?
2. **How is PII stripped** — regex, NER, or LLM-based anonymizer?
3. **How does the suggestion reach the manager** — inline pre-fill, sidebar card, or progressive reveal?

Deciding these in an ADR before code means reviewers critique direction, not diffs, and the decisions are reversible at known cost rather than buried in implementation.

## Forces

- **Hard invariant #1**: Multi-tenant isolation. Every AI call writes to `ai_suggestion` + `audit_log`, both of which must be `org_id`-scoped.
- **Hard invariant #2**: AI governance. `ai_score` is advisory; manager override mandatory with audit log; PII stripped before every Claude call.
- **Hard invariant #4**: OWASP ASVS L2, SOC 2 Type II, DPDP Act 2023. Anonymization must be demonstrable in an audit, not claimed.
- **Schedule pressure**: 2026-06-01 cutover is frozen. Phase 2.1 target: v1.1.0 by 2026-07-20.
- **Team shape**: 9-10 people, no dedicated ML ops function yet. One deploy pipeline. Observability is Grafana + Prometheus + Sentry.
- **Calibration signal quality**: the override-rate metric is the only unbiased way to measure AI quality over time. UX choice directly shapes whether that signal is clean or anchored.

## Options considered

### Decision 1 — AI service topology

#### Option 1a — Standalone `ai-evaluation` microservice (NestJS)
- Pros:
  - Matches the plan's long-term topology
  - Independent scaling for AI workload (spiky)
  - Failure isolation: Claude API outages don't affect core assessment flow
  - Clean fault boundary for cost tracking
- Cons:
  - Cross-service DB transactions (assessment write + ai_suggestion write) → saga or eventual consistency before the feature is proved
  - New deploy unit, new monitoring footprint, new CI surface
  - Doubles the tenant-guard review burden (two services, same invariants)
  - Premature optimization — we don't yet know AI call volume per cycle

#### Option 1b — `AiEvaluationModule` inside `assessment-service`
- Pros:
  - Tenant guard, audit log, and DB already correctly wired
  - Single transaction can write `assessment.ai_score` + `ai_suggestion` + `audit_log` atomically
  - One deploy unit, one set of rollback procedures
  - Extract to microservice in Phase 2.3 (advanced analytics) when batch ML load forces it — with production traffic to size against
- Cons:
  - AI failure modes now share a process with core scoring (mitigated via `@nestjs/bull` queue + circuit breaker)
  - Claude API latency appears in assessment-service P95 if not async
  - Future extraction requires a migration

#### Option 1c — Hybrid: in-process queue producer, separate worker
- Pros:
  - Decouples latency without a new deploy unit (BullMQ worker from ADR-010)
  - Main assessment-service writes `ai_suggestion.status = pending` and returns
  - Worker process pulls job, calls Claude, writes result, pushes WebSocket/SSE event
- Cons:
  - More moving parts for the first iteration
  - Adds queue-based complexity where synchronous would do for Phase 2.1 scale (~5k assessments per Qualtech cycle)

### Decision 2 — PII stripping strategy

#### Option 2a — Deterministic regex allowlist
- Pros:
  - No new runtime dependencies; runs in <1ms
  - Fully auditable — the regex list IS the policy
  - Runs inside NestJS, one less cross-boundary call
- Cons:
  - Brittle on: vernacular names (e.g., south-Indian compound names), unusual email domains, embedded phone numbers in free text, ID numbers
  - Recall likely 80–85% on realistic Qualtech data

#### Option 2b — Microsoft Presidio / spaCy NER (Python sidecar)
- Pros:
  - 95–98% recall on standard PII classes
  - Mature, well-tested, DPDP-friendly
- Cons:
  - Python sidecar = new language, new container, new ops burden
  - ~100–200ms per call — eats into 3s P95 budget
  - FastAPI + Presidio image ~800MB — CI pull time pain

#### Option 2c — LLM-based pre-pass (Claude Haiku)
- Pros:
  - Highest recall — catches context-dependent PII (handles, nicknames, office mentions)
- Cons:
  - Doubles Claude latency and cost
  - Meta-privacy question: using Claude to sanitize Claude input means the pre-call sees raw PII anyway (Anthropic zero-retention + no-training terms mitigate but don't eliminate)
  - Two points of failure

#### Option 2d — Hybrid: regex allowlist now, Presidio fallback
- Pros:
  - Ship in Sprint 7 with auditable Node-native anonymizer
  - Add a CI **recall test** against a fixture corpus (200 anonymized transcripts with labeled PII spans) — gate merges on ≥95% recall
  - If Qualtech pilot data reveals real-world recall below threshold, ADR-014 escalates to Presidio sidecar without rewriting calling code
- Cons:
  - Requires maintaining the fixture corpus (one-time cost, ~4 hours to seed)
  - Possible that post-cutover metrics force the Presidio work after all

### Decision 3 — Suggestion UX

#### Option 3a — Sidebar suggestion card (read-only)
- Pros:
  - Manager sees AI reasoning alongside empty score field
  - Minimal anchoring bias
- Cons:
  - Doesn't accelerate manager (information-only UI; they still read + decide)

#### Option 3b — Inline pre-fill with "override" button
- Pros:
  - Maximum speed — manager accepts in one click
  - Felt progress, stakeholder-friendly demo
- Cons:
  - **Anchoring bias dominates**: in similar prior-art tools, override rates drop to <10% within 2 weeks
  - Calibration signal is polluted: "override rate" ≈ "manager didn't read" rather than "AI was right"
  - Direct conflict with hard invariant #2 ("advisory only" is hollow when UI pre-fills)

#### Option 3c — Progressive reveal
- Pros:
  - AI score hidden until manager drafts + saves their own score
  - Then: "AI suggested X, you said Y. Reconcile?" prompt
  - Calibration signal `delta = |manager - ai|` is **independent** — uncontaminated by anchoring
  - Defensible in SOC 2 / DPDP reviews as "human-in-the-loop without anchor"
- Cons:
  - Slower per assessment (~20–30s added)
  - Managers may resent the reconciliation step; needs careful copy
  - Can't short-circuit "I trust AI" workflows — but that's the point

## Decision

**Decision 1 — Topology: Option 1b** (`AiEvaluationModule` inside `assessment-service`).

- Phase 2.1 scope is fundamentally database-adjacent (read assessment → read framework → write suggestion + audit → return). The distributed-transaction complexity of 1a buys nothing until we have independent scaling pressure, which we don't yet have baseline data for.
- 1c (queue worker) is the right evolution *when* we measure Claude API latency blowing past the 3s P95 budget. Not before. Phase 2.1 calls are synchronous with a 5s timeout + circuit breaker.
- Extraction path to 1a is documented: when `ai-evaluation` module's tests or CI time dominates, or when Phase 2.3 analytics adds batch re-scoring, we lift the module into its own service. The module boundary (dedicated `AiEvaluationService` class, its own DTOs, no direct Prisma access from outside the module) is drawn now so that extraction is mechanical.

**Decision 2 — PII: Option 2d** (regex allowlist + CI recall test + Presidio upgrade path).

- Package `@skillforge/pii` exports `anonymize(text: string, opts?): { clean: string, replacements: Replacement[] }`.
- Classes covered in v1: email, phone (IN + intl), PAN, Aadhaar, employee_id, person_name (first-letter-cap + title-case heuristic + allowlist of common Indian names from a gazetteer), url with employee info.
- CI gate: `pnpm test --filter=@skillforge/pii` runs the 200-transcript recall suite; merge blocked below 95% recall.
- ADR-014 (to be drafted but not yet accepted) reserves the Presidio sidecar escalation path. Interface `IAnonymizer` is stable regardless of impl.

**Decision 3 — UX: Option 3c** (progressive reveal).

- Manager scoring page flow: type score + rationale → save as draft → panel expands with AI suggestion + rationale + confidence band → "Accept", "Update mine", or "Reject (with note)" CTAs.
- All three CTAs emit `audit_log` row with `{manager_score, ai_score, decision, delta, rationale_hash, model_version, prompt_template_id}`.
- Feature flag `ai_suggestions_enabled` per org — Qualtech on by default, every other tenant opt-in.
- Override-rate dashboard for AI Champion role lands in Sprint 10.

## Consequences

**Easier:**
- AI writes are transactional with assessment writes (1b): no eventual-consistency puzzles in Phase 2.1
- PII policy is code-reviewable and git-blameable (2d regex list in source)
- Override rate becomes a clean signal for AI quality from day one (3c) — feeds directly into Phase 2.6 bias detection without re-instrumentation

**Harder:**
- If Claude API has a P95 spike, assessment-service feels it — circuit breaker + async refactor is pre-planned in ADR-015 (placeholder) not required in Phase 2.1
- Regex anonymizer is a moving target; the recall test fixture needs maintenance each time Qualtech's data vocabulary shifts (quarterly review in AI Champion role)
- Managers see a 2-step flow where they expected 1-step; change management + tooltip + training video mitigate but don't eliminate friction

**New risks:**
- **R1** — Fixture corpus under-represents real Qualtech vocabulary → recall test passes but prod recall fails. Mitigation: post-cutover sample 100 real anonymizer outputs in Sprint 10, manually audit.
- **R2** — Manager frustration with 3c drives pressure to "simplify" (i.e. regress to 3b). Mitigation: calibration data in override-rate dashboard makes the calibration win visible; tie 3c to DPDP compliance narrative in stakeholder comms.
- **R3** — `AiEvaluationModule` accidentally becomes a god-module as Phase 2.2+ adds peer feedback + prompt library. Mitigation: enforce internal boundaries via ESLint import-zones; extract to microservice at Phase 2.3 kickoff if boundary violations > 3.

## Follow-ups

- [ ] **S7.T1** — Scaffold `@skillforge/pii` package with regex anonymizer + IAnonymizer interface + recall test harness (seed with 50 fixtures, fill to 200 by S8 close)
- [ ] **S7.T2** — Prisma migration: `prompt_library`, `ai_suggestion` entities with `org_id` FK + RLS policy
- [ ] **S7.T3** — `@skillforge/feature-flags` package (Postgres-backed, Redis-cached, per-org scope)
- [ ] **S7.T4** — Draft ADR-014 (Presidio fallback path) as **Proposed** — accept if recall test falls below 95% in any sprint
- [ ] **S8.T1** — `AiEvaluationModule` scaffold inside `assessment-service` with tenant guard integration tests
- [ ] **S8.T2** — Claude client wrapper (retry, prompt caching, cost telemetry, 5s timeout, circuit breaker)
- [ ] **S8.T3** — First prompt chain: artifact summarization → rubric match → score + confidence band + rationale
- [ ] **S9.T1** — Progressive-reveal UI on `/assessments/[id]/manager-score` replacing `AiSuggestionBadge` stub
- [ ] **S9.T2** — Override audit log wiring (all 3 CTAs emit structured audit rows)
- [ ] **S10.T1** — A/B scaffolding (org-level flag splits 50/50 for first 2 weeks in Qualtech)
- [ ] **S10.T2** — Override-rate weekly report + Grafana panel for AI Champion dashboard
- [ ] **S10.T3** — Bias smoke tests: score delta distributions across gender + level proxies; alert if p-value drops under 0.01
- [ ] **Revisit** at 2026-08-15 (post-Phase 2.2 peer feedback) — is the module boundary still clean or is `AiEvaluationModule` a god-module?

## Appendix — metrics we'll publish at Phase 2.1 close

| Metric | Target | Source |
|---|---|---|
| PII recall on fixture corpus | ≥ 95% | CI recall test |
| PII recall on prod sample (n=100) | ≥ 92% | Sprint 10 manual audit |
| P95 AI suggestion latency | ≤ 3s | Grafana `ai_evaluation_duration_ms` |
| AI call cost per assessment | ≤ $0.015 | cost telemetry (prompt caching active) |
| Override rate (first 2 weeks) | No target — instrumentation only | `audit_log WHERE action='ai_override'` |
| Time from "AI suggestion available" → "manager decision" | ≤ 45s median | UI telemetry |
