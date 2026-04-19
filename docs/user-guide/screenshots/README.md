# Screenshot capture brief

Each user-guide one-pager references PNG screenshots in this folder. Below is the full capture brief so the UX team can shoot all of them in one session.

## Capture setup

- **Tenant**: use a demo tenant seeded with realistic-looking Qualtech data. Never production.
- **Browser**: Chrome at 1440×900, DPR 2× for retina crispness.
- **Light mode only** for v1.0 (dark mode ships Phase 2).
- **Annotations**: no arrows or callouts baked in — we'll add those in docs later if needed. Clean shots.
- **Crop**: tight crop to the feature being illustrated. Keep the app-shell sidebar visible only when it's pedagogically relevant (shots 1, 2, 5 per guide).
- **PII**: use fake but realistic names (e.g. *Ravi Kumar*, *Priya Iyer*), fake but plausible email addresses (e.g. *ravi.kumar@demo.qualtech.ai*).
- **Format**: PNG, sRGB, ≤500 KB each (run `oxipng -o 4` or equivalent before commit).

## Shot list

### Employee (`employee-NN-name.png`)

| # | Filename | State | What to show |
|---|---|---|---|
| 01 | `employee-01-invite-accept.png` | `/invite/<token>` just opened | Pre-filled email/name + set-password form + activate button |
| 02 | `employee-02-assessments-list.png` | `/assessments` with 2 open + 1 finalized cycle | The grid with status badges + status-aware CTAs |
| 03 | `employee-03-self-assessment-form.png` | `/assessments/[id]` partially filled | Left dim nav, right main card with rubric + score + comment + artifact slot, footer draft indicator |
| 04 | `employee-04-artifact-upload.png` | Dropping a PDF into an artifact slot | Progress bar mid-upload + filename visible |
| 05 | `employee-05-scorecard.png` | `/scorecard` after 2 cycles finalized | Radar chart + histogram + cycle table |

### Manager (`manager-NN-name.png`)

| # | Filename | State | What to show |
|---|---|---|---|
| 01 | `manager-01-team-roster.png` | `/team` filter=Pending | Roster table with 4–6 reports, statuses, target levels, filter pill at top |
| 02 | `manager-02-scoring-form.png` | Scoring form, halfway through | Employee self-score panel, AI suggestion badge ("not yet available" placeholder), manager input, rationale field, composite preview sidebar |
| 03 | `manager-03-team-overview.png` | `/team/overview` | Dual-layer radar (self + manager avg) + per-person mini-cards + completion donut |

### HR Admin (`hr-NN-name.png`)

| # | Filename | State | What to show |
|---|---|---|---|
| 01 | `hr-01-cycle-draft.png` | `/cycles` new-cycle form | Framework picker, participant roster multiselect, deadline pickers |
| 02 | `hr-02-dashboard.png` | `/hr` during an active cycle | KPI strip + 2 live cycle cards with donuts + 1 at-risk badge |
| 03 | `hr-03-bulk-finalize.png` | Bulk-finalize modal mid-progress | Per-row progress + skip-unscored toggle + cancel button |
| 04 | `hr-04-export-templates.png` | `/hr/templates` new-template editor | Column picker with allowed/disallowed state + ordered list on right + save button |
| 05 | `hr-05-users-table.png` | `/users` with invite dialog open | User list behind, invite dialog in front with email/role/manager/target fields |

### AI Champion (`ai-NN-name.png`)

| # | Filename | State | What to show |
|---|---|---|---|
| 01 | `ai-01-heat-map.png` | `/hr/reports` capability heat-map | Dimension × role grid with colored cells + legend + filter controls |
| 02 | `ai-02-framework-editor.png` | `/frameworks/[id]` draft | Dimension list, weight sliders summing to 1.00, level-descriptor text areas |

### Leadership (`leadership-NN-name.png`)

| # | Filename | State | What to show |
|---|---|---|---|
| 01 | `leadership-01-dashboard.png` | `/dashboard` as leadership role | KPI strip + own-team summary tiles + recent cycles list |

### Super Admin (`super-NN-name.png`)

| # | Filename | State | What to show |
|---|---|---|---|
| 01 | `super-01-role-edit.png` | `/users` edit dialog | Full role dropdown (including `super_admin`), audit-reason field (Phase 2 preview), save button |

## Delivery

Drop captured PNGs into this folder with the filenames above. The user-guide markdown files will render them automatically on GitHub and any docs-site build.

After drop, run:
```bash
cd docs/user-guide/screenshots
oxipng -o 4 *.png   # or equivalent
```

to compress losslessly before committing.
