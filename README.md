# SkillForge AI

**AI-Powered Employee Skill Assessment Platform**
Multi-tenant SaaS built by Qualtech for the April–June 2026 appraisal cycle and external-client resale.

**Status**: Sprint 0 scaffold complete · Ready for team kickoff (2026-04-20)

## Quick start

Prerequisites: macOS with [Homebrew](https://brew.sh), Node 20+, pnpm 9+.

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres + Redis via Homebrew (idempotent)
make up                  # or: pnpm local:up

# 3. Copy env and fill in secrets
cp .env.example .env     # edit as needed

# 4. Generate Prisma client + run migrations + seed
pnpm db:generate
pnpm db:migrate:dev
pnpm db:seed

# 5. Start all apps + services
pnpm dev
# Web:               http://localhost:3000
# Assessment API:    http://localhost:4001
# Swagger docs:      http://localhost:4001/api/docs

# 6. Verify
make status
```

Login with seeded users (dev-only, any password):
- `ashish@qualtech.com` — super_admin
- `hr@qualtech.com` — hr_admin
- `eng.manager@qualtech.com` — manager
- `dev1@qualtech.com` — employee

## Architecture

| Layer | Technology | ADR |
|---|---|---|
| Frontend | Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui | — |
| Mobile (Phase 2) | React Native (Expo) | — |
| Backend (core) | NestJS (TypeScript) | — |
| Backend (enterprise) | Spring Boot (Phase 2+) | — |
| Database | PostgreSQL 15 + Redis 7 | [ADR-001](docs/adr/ADR-001-orm-prisma.md) |
| ORM | Prisma | [ADR-001](docs/adr/ADR-001-orm-prisma.md) |
| Tenancy | RLS on single schema | [ADR-002](docs/adr/ADR-002-tenancy-rls.md) |
| Monorepo | pnpm + Turborepo | [ADR-003](docs/adr/ADR-003-monorepo-pnpm-turbo.md) |
| AI/LLM | Claude API + LangChain (Phase 2) | [ADR-005](docs/adr/ADR-005-claude-output-xml.md), [ADR-006](docs/adr/ADR-006-confidence-numeric.md) |
| Auth | Keycloak (SSO, SAML, OIDC) | [ADR-009](docs/adr/ADR-009-auth-keycloak.md) |
| Queue | BullMQ on Redis | [ADR-010](docs/adr/ADR-010-queue-bullmq.md) |

All 10 architecture decisions have ADRs under [docs/adr/](docs/adr/). Defaults were picked to unblock Sprint 1 — the team may override any choice in the Architecture Workshop.

## Repo layout

```
skillforge/
├── apps/
│   └── web/                          # Next.js 14 App Router
├── services/
│   └── assessment-service/           # NestJS — cycle + scoring + artifact
├── packages/
│   ├── db/                           # Prisma schema + generated client
│   ├── shared-types/                 # zod schemas shared FE↔BE
│   ├── tenant-guard/                 # withTenant() — the ONE way to query
│   ├── ui/                           # shadcn/ui design system (Sprint 0 Day 4)
│   └── config/                       # shared ESLint/TS/Tailwind configs
├── prompts/                          # Claude chain definitions (Phase 2)
├── infra/                            # Terraform (Sprint 6+)
├── tools/                            # local-up/down/status scripts, seeds
├── docs/
│   ├── adr/                          # Architecture Decision Records
│   └── SPRINT_0_CHECKLIST.md
├── .claude/                          # project skills + hooks + settings
├── .github/workflows/ci.yml
├── BUILD_PLAN.md                     # 3-track execution plan
├── OPEN_DECISIONS.md                 # 10 decisions with proposed defaults
├── CLAUDE.md                         # AI-assistant project guide
└── SkillForge_AI_Project_Plan.docx   # strategic plan (source of truth)
```

## Non-negotiable invariants

These are enforced by CI, `.claude/hooks/`, and code review — not just by convention.

1. **Tenant isolation** — every DB query goes through `withTenant(orgId, ...)` from `@skillforge/tenant-guard`. RLS policies enforce this at the DB layer too.
2. **AI governance** — `ai_score` is advisory; `composite_score` is never written without a manager signal. PII is stripped before any Claude call.
3. **Audit log is append-only** — the Postgres RLS policy denies UPDATE/DELETE on `audit_log`.
4. **No cross-tenant access** without `@AllowCrossTenant` + super_admin role + audit log row (ADR-007).

## Developer workflows

| Task | Command |
|---|---|
| Start local infra | `make up` |
| Stop local infra | `make down` |
| Status of infra + services | `make status` |
| Install deps | `pnpm install` |
| Run all apps/services in watch mode | `pnpm dev` |
| Typecheck everything | `pnpm typecheck` |
| Lint everything | `pnpm lint` |
| Run tests | `pnpm test` |
| Build for prod | `pnpm build` |
| Apply migrations | `pnpm db:migrate:dev` |
| Seed Qualtech data | `pnpm db:seed` |
| Reset DB | `pnpm db:reset` |
| Prisma Studio (GUI) | `pnpm --filter @skillforge/db studio` |
| Run CI checks locally | `make ci` |
| Check tenant isolation | `make tenant-check` |
| Security audit | `make security-audit` |

## Timeline

- **Today**: 2026-04-18 (Sprint 0 scaffold done)
- **2026-04-20**: Architecture Workshop (resolve or confirm ADRs)
- **2026-04-27**: Sprint 1 kickoff
- **2026-05-31**: Hyper-MVP goes live (Qualtech appraisal cycle)
- **2026-08-08**: Full Phase 1 complete
- **2027-03-20**: Phase 3 — first external client

See [BUILD_PLAN.md](BUILD_PLAN.md) for the full sprint-by-sprint plan.

## Onboarding for new team members

1. Read [BUILD_PLAN.md](BUILD_PLAN.md) and [CLAUDE.md](CLAUDE.md) (30 min)
2. Skim all 10 ADRs under [docs/adr/](docs/adr/) (20 min)
3. Run the Quick Start above and verify login works (30 min)
4. Read `.claude/skills/` to understand project-specific workflows (15 min)
5. Pair with Tech Lead on your first P0 ticket

## Contributing

- Every PR must check the PR-template invariants box.
- Branch naming: `sf-<ticket>-<short-slug>` (e.g. `sf-234-self-assessment-form`)
- Commit format: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `security:`)
- CI must be green before merge; tenant-check + security scans are mandatory.

## Links

- Strategic plan: [SkillForge_AI_Project_Plan.docx](SkillForge_AI_Project_Plan.docx)
- Build plan (branded DOCX): [SkillForge_AI_Build_Plan.docx](SkillForge_AI_Build_Plan.docx)
- Open decisions: [OPEN_DECISIONS.md](OPEN_DECISIONS.md)
- Sprint 0 checklist: [docs/SPRINT_0_CHECKLIST.md](docs/SPRINT_0_CHECKLIST.md)

---

**Built by Qualtech · Powered by AI · Designed for People**
