## Summary

<!-- 1–3 bullets on what changed and why -->

## Linked issues

<!-- e.g. SF-123, closes #45 -->

## Test plan

- [ ] Added/updated unit tests
- [ ] Added/updated integration tests (if touching DB/queues/external APIs)
- [ ] Manually verified locally: `make up && make dev` → walk through affected flow
- [ ] Migration (if any) reviewed for RLS + `org_id` + indexes

## SkillForge invariants (tick all that apply)

- [ ] Every new DB query filters by `org_id` (tenant isolation)
- [ ] Every new endpoint is covered by `TenantGuard` or explicitly `@AllowCrossTenant()` with audit log
- [ ] No raw PII sent to Claude API (all identifiers anonymized via `anonymize()`)
- [ ] Every new audit-logged action writes actor + old/new values
- [ ] Added/updated ADR if this changes a project-wide pattern

## Screenshots / recordings

<!-- UI changes: paste screenshots or screen recordings. Include mobile if applicable. -->

## Risk assessment

- **Risk level**: Low / Medium / High
- **Blast radius**: Only this service / Multi-service / Schema-level
- **Rollback plan**: <!-- e.g. revert this PR, run `down` migration, flag off feature -->

## Docs

- [ ] README updated if setup/commands changed
- [ ] CLAUDE.md / memory updated if project-wide invariants changed
