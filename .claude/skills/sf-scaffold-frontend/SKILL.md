---
name: sf-scaffold-frontend
description: Scaffold a new Next.js 14+ App Router module for SkillForge using TypeScript, Tailwind, shadcn/ui, and the platform's auth/tenant context providers. Use when the user asks to "create a new page", "scaffold <module> UI", "add a frontend route", or starts a new persona dashboard (employee, manager, HR, AI champion, leadership).
---

# Scaffold Next.js Module

Generates a new Next.js App Router module under `frontend/web/app/<module-name>/` with shadcn/ui components, form validation (react-hook-form + zod), and data fetching (TanStack Query + generated API client).

## Standard module layout

```
frontend/web/app/<module-name>/
├── layout.tsx              # persona shell with nav
├── page.tsx                # module landing
├── [id]/
│   ├── page.tsx            # detail view
│   └── edit/page.tsx       # edit form
├── _components/            # module-local components
│   ├── <Entity>List.tsx
│   ├── <Entity>Form.tsx
│   └── <Entity>Detail.tsx
├── _hooks/
│   ├── use-<entity>.ts     # TanStack Query hooks
│   └── use-<entity>-form.ts
├── _lib/
│   ├── schema.ts           # zod schemas (shared with API if possible)
│   └── api.ts              # typed client calls
└── _types/
    └── <entity>.ts
```

## Persona-specific standards

| Persona | Theme | Key patterns |
|---|---|---|
| Employee | Clean, guided | Single-column forms, progress indicators, draft-save |
| Manager | Dense, tabular | Data tables with filters, bulk actions, bias-warning badges |
| HR Admin | Admin-heavy | Multi-step cycle config, audit log viewer, CSV export |
| AI Champion | Review-focused | Artifact diff viewer, Claude reasoning panel, approve/reject queue |
| Leadership | Exec dashboards | High-level KPI cards, drill-down charts, PDF export |

## Workflow

1. Ask persona (employee/manager/hr/ai_champion/leadership) and entity name.
2. Create folder layout above.
3. In `layout.tsx`, wrap with:
   - `TenantProvider` (pulls current org from session)
   - `RoleGuard` (blocks if role not in allowed list)
   - `AuditLogger` (wraps mutations for tracking)
4. In `page.tsx`, use `<PageShell>` from `@/components/layout` with breadcrumb + title.
5. Forms: `react-hook-form` + `zod` resolver. Validation schema lives in `_lib/schema.ts` and should mirror the backend DTO.
6. Data fetching: TanStack Query with keys `['<entity>', orgId, ...params]` — always include `orgId` in the key to avoid cross-tenant cache bleed.
7. For any AI-suggested value in the UI, use `<AiSuggestionBadge>` with the suggestion, confidence %, and "View reasoning" popover — per §7.4 of the plan.

## Critical conventions

- Use shadcn/ui for all primitives (Button, Input, Select, Dialog, Sheet, Table).
- Every mutation goes through an optimistic-update hook with rollback on error.
- All text is i18n-ready via `next-intl` — no hardcoded strings in components.
- Accessibility: every form field has a `<label>`, every icon-only button has `aria-label`, color contrast passes WCAG AA.

## Learning opportunity

Before generating the persona shells, I need your call on:

**Question**: Should the app use a single unified shell with role-based nav visibility, or five distinct persona shells (EmployeeLayout, ManagerLayout, HrLayout, ChampionLayout, LeadershipLayout)?

- **Unified**: simpler routing, one codebase, role checks per menu item. Easier to add a new role.
- **Per-persona**: cleaner mental model for designers and QA, but duplication in layout code. Easier to apply persona-specific theming.

The plan lists five personas explicitly (§2.2) — each has meaningfully different info density. Your call shapes how we scaffold every future page.
