# SkillForge — Current Status

**Last update**: 2026-04-18 (late)

## Done

- ✅ **Sprint 0**: monorepo scaffold, CI/CD, local-dev scripts, 10 ADRs
- ✅ **Sprint 1 P0**: auth + RBAC, competency framework engine, user invite flow, HR admin UI, baseline + RLS migrations
- ✅ **Post-Sprint-1 hardening**: prismaAdmin client, transactional auth flows, frontend route guard, cache clear, role gates, zod-validated weights, BYPASSRLS admin role
- ✅ **Sprint 2 P0**: cycle state machine + activate, self-assessment backend with draft save + submit, artifact upload with HMAC token, self-assessment multi-step UI, ArtifactUploader, manager roster page, BullMQ reminder subsystem
- ✅ **Sprint 3 P0 — Hyper-MVP close**:
  - Manager scoring UI (rubric-weighted average + composite preview + rationale gate)
  - CSV export (RFC 4180 + BOM + deterministic column order)
  - Cycle lock + bulk finalize + close with audit trail
  - HR admin dashboard (KPI strip, cycle cards with donut progress, roster table)
  - CompletionDonut component
  - Deployment runbook + UAT checklist with 7 scenarios + sign-off template
- ✅ **DOCX plans** moved to `docs/plans/`
- ✅ **Tests**: ~65 total unit assertions

## Ready for production cutover

| Activity | Date | Status |
|---|---|---|
| UAT with 20 pilot users | 2026-05-18 → 2026-05-27 | Pending — start Monday of Sprint 3 |
| UAT sign-off | 2026-05-28 EOD | Pending |
| Production deploy | 2026-05-29 Fri EOD | Pending |
| Qualtech cycle go-live | 2026-06-01 Mon 09:00 IST | Pending |
| 72h post-launch monitoring | 2026-06-01 → 2026-06-04 | Pending |

See:
- [docs/SPRINT_1_DEMO.md](docs/SPRINT_1_DEMO.md)
- [docs/SPRINT_2_DEMO.md](docs/SPRINT_2_DEMO.md)
- [docs/SPRINT_3_DEMO.md](docs/SPRINT_3_DEMO.md)
- [docs/ops/DEPLOYMENT_RUNBOOK.md](docs/ops/DEPLOYMENT_RUNBOOK.md)
- [docs/ops/UAT_CHECKLIST.md](docs/ops/UAT_CHECKLIST.md)

## Next (Phase 2 — starts 2026-06-08)

After stable Hyper-MVP operation, Phase 2 adds AI intelligence:
- AI artifact analysis via Claude (artifact content → rubric-dimension scores + reasoning + confidence)
- AI-suggested scores surfaced on the manager scoring page (replaces the `AiSuggestionBadge` placeholder)
- Peer feedback module (360° input)
- Skill gap detection + learning path recommendations
- Prompt Library (org-wide, searchable)
- Advanced analytics (heatmaps, trend analysis)
- HRMS bi-directional API integration
- Mobile React Native app
- Bias detection (statistical outlier analysis across managers)

See [BUILD_PLAN.md](BUILD_PLAN.md) §7 for the Phase 2 sprint breakdown.
