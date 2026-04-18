---
name: sf-sprint-status
description: Generate a SkillForge sprint status report against Phase 1/2/3 feature priorities with burndown, completion rate, and P0 risk flags. Use when the user asks for "sprint status", "sprint update", "where are we in the sprint", "burndown", or "delivery report".
---

# Sprint Status Report

Produces a branded DOCX + Markdown status report using the 18-section master template from global CLAUDE.md, scoped to SkillForge sprint cadence (2-week sprints, 8 per phase).

## Inputs needed

- Sprint number (1–24)
- Source of truth for status: git activity, Jira/Linear project ID, or manual input
- Cutoff date (defaults to today)

## Generated sections (follows global 18-section template)

1. Document Info — DOC-ID: `SF-SPRINT-<N>-STATUS-<YYYYMMDD>`
2. Version History
3. Executive Summary — 3 bullets: on-track P0s, at-risk items, key metric
4. Dashboard View — status badges per feature, 4 metric cards (Velocity, Completion %, Bug Count, P0 at risk)
5. Completed Work — from git log / PR merges in the sprint window
6. Work in Progress — open PRs, in-progress tickets, owner + due
7. Pending Items — sprint-committed but not yet started
8. Future Roadmap — next sprint's scope preview
9. Upcoming Deliveries — demo items, releases
10. Risks & Dependencies — pull from the plan's risk register; flag any currently active
11. Architecture Overview — note any architecture decisions landed this sprint
12. Security Overview — security findings resolved / introduced this sprint
13. VAPT/Vulnerability Findings — if a scan ran
14. Functional Gaps Summary — features in the Phase list that slipped
15. Environment Access — staging/prod URLs
16. Effort Summary — commits, lines, files, duration
17. Commit Type Breakdown — feat/fix/docs/security/test counts
18. References — Jira epic, Confluence page, design files

## Branded DOCX output (from global CLAUDE.md)

- Colors: Navy `#1B3A5C` headers, Blue `#2E75B6` accent, green/orange/red badges
- Status badges: `● Completed` / `● At Risk` / `● Delayed` (no emoji circles)
- Font: Arial body, Consolas for commits/paths
- Landscape A4 if tables are wide, else US Letter
- Attribution: Ashish Kumar Satyam / TechDigital WishTree / for Qualtech (NOT TPE)

## Workflow

1. Ask for sprint number + data source.
2. Gather feature list for that sprint from memory (`project_skillforge_phases.md`).
3. If git-based, run:
   ```
   git log --since="<sprint-start>" --until="<sprint-end>" --pretty=format:"%h|%an|%s|%ad" --date=short
   git diff <sprint-start>..<sprint-end> --stat
   ```
4. Categorize commits by conventional-commit prefix (feat/fix/chore/...).
5. Cross-reference feature-list items against merged PRs to compute completion %.
6. Generate markdown first, then DOCX via python-docx.
7. Flag any P0 feature that has not merged within its planned sprint window — this is the single most important alert.

## Red flags to surface prominently

- Any P0 from the current phase's feature list not yet started
- Security findings introduced this sprint (from dependency scans, test failures)
- AI-governance violations (e.g., `ai_score` being written to `composite_score` without manager sign-off trail)
- Tenant-isolation violations (queries without `org_id` filter)

## Output path

- `/Users/aksatyam/SelfWork/SkillForge/reports/SF-SPRINT-<N>-STATUS-<YYYYMMDD>.md`
- `/Users/aksatyam/SelfWork/SkillForge/reports/SF-SPRINT-<N>-STATUS-<YYYYMMDD>.docx`
