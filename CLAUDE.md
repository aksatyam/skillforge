# SkillForge AI — Project Guide

**Project**: AI-Powered Employee Skill Assessment Platform
**Codename**: SkillForge AI
**Owner**: Qualtech (internal mandate + SaaS resale)
**Plan**: `SkillForge_AI_Project_Plan.docx` (v1.0, April 2026, Internal — Confidential)

Override on attribution: for SkillForge, `For = Qualtech` (not TPE).

## Hard invariants (non-negotiable)

1. **Tenant isolation** — every DB query, repository, migration, and cache key is scoped by `org_id`. Retrofitting this later is a known risk in §10; bake it in now.
2. **AI governance** — `ai_score` is advisory only. Manager override mandatory with audit log. PII stripped before every Claude call. Plan §7.4.
3. **P0 vs P1 vs P2** — Phase 1 ships on the May 2026 appraisal deadline. P0 items are blocking; P1 is fast-follow; P2 is Phase 2+.
4. **Security-first** — OWASP ASVS L2, SOC 2 Type II, DPDP Act 2023. Audit log every assessment write. Plan §8.

## Tech stack defaults

- Backend: **NestJS** (TypeScript) for core; Spring Boot for enterprise integrations
- Frontend: **Next.js 14+ App Router** + TypeScript + Tailwind + **shadcn/ui**
- Mobile: **React Native (Expo)** — starts Phase 2
- DB: **PostgreSQL** primary, **Redis** for cache/sessions, **S3** for artifacts
- AI: **Claude API + LangChain**, prompt caching enabled, PII stripped
- Infra: AWS (ECS/EKS), **Terraform**, **GitHub Actions**
- Monitoring: Grafana, Prometheus, **Sentry**
- Auth: Keycloak / Auth0 (SAML + OIDC), MFA for admin roles

## Project-scoped skills (in `.claude/skills/`)

| Skill | Trigger it when you need to… |
|---|---|
| `sf-scaffold-service` | Create a new NestJS microservice with tenant guards |
| `sf-scaffold-frontend` | Create a new Next.js App Router module / persona dashboard |
| `sf-data-model` | Add/update entities, migrations, DTOs for the 10 core tables |
| `sf-ai-prompt` | Design a Claude prompt chain with PII stripping + schema validation |
| `sf-assessment-workflow` | Generate self/manager/peer/AI assessment flow end-to-end |
| `sf-security-audit` | Run OWASP + SOC 2 + DPDP audit with branded DOCX report |
| `sf-sprint-status` | Generate 18-section branded sprint status DOCX |
| `sf-tenant-check` | Scan for missing `org_id` filters before release |

## Project hooks (automatic — configured in `.claude/settings.json`)

- **SessionStart** → loads this project context + critical invariants
- **UserPromptSubmit** → detects phase keywords and injects relevant roadmap context
- **PreToolUse (Write/Edit)** →
  - Warns on backend/migration edits lacking visible `org_id` references
  - **Blocks** edits to AI-prompt files that reference raw PII without `anonymize()`
- **PostToolUse (Bash)** → scans shell commands for accidentally leaked secrets

## Directory layout (when code exists)

```
SkillForge/
├── SkillForge_AI_Project_Plan.docx      # source of truth
├── CLAUDE.md                             # this file
├── .claude/
│   ├── settings.json                     # hooks + permissions
│   ├── skills/                           # 8 project skills
│   └── hooks/                            # 5 hook scripts
├── backend/
│   ├── services/
│   │   ├── assessment-service/           # NestJS
│   │   ├── framework-service/
│   │   ├── ai-evaluation/                # Claude + LangChain
│   │   ├── analytics-service/
│   │   ├── notification-service/
│   │   └── integration-service/          # HRMS, SSO, LMS
│   ├── shared/                           # tenant guard, audit, types
│   └── migrations/                       # Postgres migrations
├── frontend/
│   ├── web/                              # Next.js 14+
│   └── mobile/                           # React Native (Phase 2)
├── infra/                                # Terraform
├── prompts/                              # Claude chain definitions
└── reports/                              # sprint status + audit DOCX outputs
```

## Memory (loaded via MEMORY.md)

Project context, phase roadmap, tech stack, data model, security standards, team structure, and guardrails (tenant, AI) live in `~/.claude/projects/-Users-aksatyam-SelfWork-SkillForge/memory/`.

## Enterprise document standards

Follows the global `~/.claude/CLAUDE.md` 18-section master-document template and VAPT brand colors. Attribution: Ashish Kumar Satyam / TechDigital WishTree / for **Qualtech**.
