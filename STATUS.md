# SkillForge — Current Status

**Last update**: 2026-04-18

## Done

- ✅ Sprint 0 scaffold: monorepo, CI/CD, local-dev scripts, 10 ADRs
- ✅ Sprint 1 P0 features: auth + RBAC, competency framework engine, user invite flow, HR admin UI
- ✅ Project memory, skills, and hooks configured in `.claude/`
- ✅ Baseline Prisma migration (`0001_init`) + RLS migration (`0002_enable_rls`)

## In progress (post-Sprint-1 hardening)

Validation agents flagged **3 Critical + 9 High issues** after Sprint 1. Fixes underway:

### Critical (must land before Sprint 2 demo)

- [ ] `prismaAdmin` client (BYPASSRLS role) for pre-tenant + audit paths
- [ ] Fix `refresh()` — currently uses ORM on `refresh_tokens`, blocked by FORCED RLS
- [ ] Wrap `acceptInvite` in a transaction (prevent token consumption without JWT issuance)
- [ ] Fix `AppShell` route guard to short-circuit before `useMe()` fires

### High

- [ ] `issueInviteToken` needs tenant context or admin client
- [ ] `AuditLogInterceptor.writeAuditRow` must use `prismaAdmin`
- [ ] `withoutTenant` audit write blocked by RLS
- [ ] Clear `QueryClient` cache on logout + 401
- [ ] Add role gate to `/frameworks/new` page and EmptyState
- [ ] Dynamic zod `max` for `targetLevel` in role-mapping form
- [ ] Zod-validate `assessmentWeights` instead of unsafe cast
- [ ] Drop `ALTER DATABASE skillforge SET ...` — breaks CI on ephemeral DB names

See `docs/SPRINT_1_DEMO.md` "Known gaps" and validation findings in the git log.

## Next

- Complete hardening above
- Update `.claude/` memory + skills with new patterns
- Execute Sprint 2: cycle lifecycle, self-assessment module, artifact upload, manager roster, email reminders

See [BUILD_PLAN.md](BUILD_PLAN.md) §5 Sprint 2.
