# Sprint 0 — Foundation Checklist

**Window**: 2026-04-20 (Mon) → 2026-04-24 (Fri)
**Goal**: By Friday EOD, any engineer can clone the repo, run `docker compose up`, and see the full stack running locally. Sprint 1 kicks off Monday 2026-04-27.

Reference: `BUILD_PLAN.md` §4.

---

## Day 1 — Monday 2026-04-20 — Architecture Workshop Day 1

**Attendees**: Tech Lead (facilitator), AI Engineer, Frontend Lead, Backend Lead, DevOps, Product Owner (optional).
**Output**: Decisions 1–5 from `OPEN_DECISIONS.md` resolved, ADRs drafted.

- [ ] 09:00–10:00 — Walk through plan §3 (architecture) and this build plan
- [ ] 10:00–12:00 — Decide **D1 ORM** + **D2 Tenancy strategy**. Draft ADR-001 + ADR-002.
- [ ] 13:00–14:30 — Decide **D3 Monorepo tool** + **D4 Frontend shell**. ADR-003 + ADR-004.
- [ ] 14:30–16:00 — Decide **D5 AI output format** (defers to D6 tomorrow). ADR-005.
- [ ] 16:00–17:00 — Write up Day 1 decisions, circulate to team.

## Day 2 — Tuesday 2026-04-21 — Architecture Workshop Day 2 + Repo Init

- [ ] 09:00–10:30 — Decide **D6 Confidence model**, **D7 TenantGuard behavior**, **D8 Employee AI visibility**. ADR-006 to ADR-008.
- [ ] 10:30–11:30 — Decide **D9 Auth provider** + **D10 Queue**. ADR-009 + ADR-010.
- [ ] 11:30–12:00 — Review all ADRs, sign off.
- [ ] 13:00–15:00 — **Repo init** (Tech Lead):
  - Create `skillforge/` monorepo on GitHub
  - Choose workspace tool (Turborepo/Nx/pnpm per D3)
  - Commit `packages/config/` with shared ESLint, TS, Prettier, Tailwind configs
  - Add `CODEOWNERS` (tech lead default, FE lead for `apps/web`, BE lead for `services/`, AI for `prompts/` + `services/ai-evaluation`)
  - Add branch protection on `main`: 1 review + CI green required
  - Copy `.claude/` directory to repo (skills, hooks, settings)
- [ ] 15:00–17:00 — Bootstrap `apps/web`, `services/assessment-service`, `services/framework-service`. Commit boilerplate.

## Day 3 — Wednesday 2026-04-22 — CI/CD + Docker Compose

**Owner**: DevOps (with Tech Lead).

- [ ] Create GitHub Actions workflows:
  - [ ] `ci.yml` — typecheck, lint, test, build on every PR
  - [ ] `preview.yml` — deploy web to Vercel/Netlify preview per PR
  - [ ] `staging.yml` — deploy to staging on merge to `main`
- [ ] Add `sf-tenant-check` scan as a CI step (from `.claude/skills/sf-tenant-check/SKILL.md`)
- [ ] Add Semgrep + `npm audit` gates
- [ ] Write root `docker-compose.yml`:
  - postgres 15 with `pgcrypto` extension
  - redis 7
  - kong (later — stub for now)
  - api gateway / BFF
  - web
  - mailhog for local email testing
  - minio for local S3
- [ ] Seed script: creates 1 org, 10 users (5 emp, 3 managers, 1 hr_admin, 1 super_admin), 1 framework, 1 open cycle
- [ ] `make up` / `make down` / `make seed` wrappers
- [ ] Document in root README

## Day 4 — Thursday 2026-04-23 — Design System + Frontend Shell

**Owner**: UI/UX Designer + FE-1.

- [ ] UI/UX Designer:
  - [ ] Finalize color tokens (match CLAUDE.md brand palette if Qualtech branding not decided)
  - [ ] Component inventory: Button, Input, Select, Dialog, Sheet, Table, Breadcrumb, Badge, Toast, Card, Tabs, DatePicker
  - [ ] Figma file structure: tokens / primitives / patterns / flows
  - [ ] Wireframes for: self-assessment form, manager scoring screen, HR cycle creator
- [ ] FE-1:
  - [ ] Initialize `packages/ui` with shadcn/ui CLI
  - [ ] Install Storybook (v8) at root, surface primitives
  - [ ] Set up `next-intl` for i18n (en-IN, en-US as starter locales)
  - [ ] Implement `<PageShell>`, `<PersonaNav>`, `<AiSuggestionBadge>`, `<AuditTrailLink>` as first custom components
  - [ ] Add shell layout to `apps/web` with persona-gated nav (per decision D4)

## Day 5 — Friday 2026-04-24 — DB Schema v0 + Auth Skeleton

**Owner**: BE Lead + BE-1.

- [ ] **Migration 0001 — core tables**:
  - `organizations`, `users`, `competency_frameworks`, `role_mappings`
  - Standard columns (id UUID, org_id FK, created_at, updated_at, created_by, deleted_at, version)
  - Indexes per `sf-data-model` skill
  - RLS policies if decision D2 = RLS
- [ ] **Migration 0002 — auth tables**: `refresh_tokens`, `audit_log`
- [ ] Seed Qualtech org + Ashish as `super_admin` for testing
- [ ] Auth skeleton in `services/assessment-service`:
  - [ ] `/auth/login` — email+password → JWT + refresh
  - [ ] `/auth/refresh` — rotate refresh token
  - [ ] `/auth/logout` — revoke refresh token (Redis)
  - [ ] `TenantGuard` + `RbacGuard` globally registered
  - [ ] `@CurrentTenant()` + `@Roles()` + `@AllowCrossTenant()` decorators
  - [ ] Unit tests for the guards (happy + mismatch + cross-tenant)
- [ ] **Smoke test**: curl login → get JWT → hit `/health` → 200
- [ ] **Sprint 0 retro** (30 min, async OK)

## Exit criteria (Friday EOD)

A new engineer joining Monday should be able to:

```bash
git clone git@github.com:qualtech/skillforge.git
cd skillforge
cp .env.example .env
make up           # docker compose up -d
make seed         # run migrations + seed
cd apps/web && npm run dev
# visit http://localhost:3000, login as ashish@qualtech.com
```

…and see the app shell, logged in.

- [ ] README covers setup, architecture overview, glossary of personas
- [ ] All 10 open decisions have ADRs in `docs/adr/`
- [ ] CI is green on `main`
- [ ] Jira/Linear board populated with Sprint 1 tickets (from `BUILD_PLAN.md` §5)
- [ ] Slack channels created: `#skillforge-eng`, `#skillforge-product`, `#skillforge-releases`, `#skillforge-incidents`
- [ ] On-call rotation defined (even if informal for Phase 1)
- [ ] Figma file shared; wireframes for Sprint 1 screens approved
- [ ] This checklist committed with all boxes ticked
