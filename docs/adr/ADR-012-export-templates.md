# ADR-012: HR-authored CSV export templates with a column-source allowlist

- **Status**: Accepted
- **Date**: 2026-04-19
- **Deciders**: Platform team + HR domain lead
- **Context tag**: Sprint 6 — feature #3 ("HR-editable CSV templates")

## Context

Through Sprint 5 the cycle-level CSV export had a **hardcoded 15-column
layout**. HR admins running payroll/HRIS integrations (SAP SuccessFactors,
Workday, Oracle HCM) have different column names, column orders, and
column subsets. Every integration rollout was gated on a platform-team
code change to rename a header — an anti-pattern for a SaaS HR tool.

Sprint 6 introduced "HR-editable export templates":

- Four **built-in templates**: Default, SAP SuccessFactors, Workday, Oracle
  HCM.
- Per-tenant **custom templates** stored in
  `organization.settings_json.exportTemplates` (array of
  `{id, name, columns: [{header, source}]}` rows, validated by zod).

The security question: what prevents a tenant from crafting a template that
reads `responsesJson`, `user.passwordHash`, `orgId`, or any other field
present on the denormalized row? Templates are untrusted input — the
`source` string is user-editable.

## Options considered

### Option A — Regex-ish sanitizer on `source` (e.g. strip `_`, forbid `$`)
- Pros: Simple to write.
- Cons: Deny-list thinking. We'd inevitably miss a field. `user.manager.id`
  looks innocent but leaks PII we decided not to expose. Every new column
  on the denormalized row becomes a potential leak.

### Option B — Allowlist of dot-paths (`columnSourcePaths`)
- Pros: **Default-deny**. Every reachable column is an explicit decision.
  When the denormalized row gains a new field, it is NOT reachable from
  templates until we deliberately add it to the list. The UI dropdown is
  driven off the same constant, so the "what columns can I pick?" question
  has one answer server- and client-side.
- Cons: A platform-team code change is required to expose a new column. We
  accept this — it's the whole point.

### Option C — Run templates inside a sandbox (e.g. cel-js, jsonpath with a
denied-keys list)
- Pros: Flexible expressions (concatenation, defaults, conditional logic).
- Cons: Over-engineering for the MVP. HR has asked for column picking, not
  expressions. Also: every expression language is an audit liability
  (prototype pollution, ReDoS, sandbox escapes).

## Decision

Adopt **Option B**.

- `src/export/export.templates.ts` defines `columnSourcePaths` (currently 18
  paths) as the single allowlist.
- `isValidSource(s)` is `Set.has(s)` — no regex, no special-case logic.
- `evalSource(row, source)` walks a simple dot-path. It short-circuits to
  empty string on any null/undefined branch and never throws. If a leaf is a
  plain object (mis-pointed template), `scoreToString()` returns empty
  rather than `[object Object]` — we never leak internal shapes into the CSV.
- The controller calls `validateSources(template)` before persisting the
  template; any bad source path → `400 Bad Request` with the offending path
  in the message.
- The UI dropdown is driven off the same `columnSourcePaths` constant
  (shared via `@skillforge/shared-types`), so it physically cannot offer a
  path the server wouldn't accept.
- `mergeTemplates()` guarantees the server decides which ids are built-in
  — a tenant custom row with `builtin: true` is rewritten to `false`.

Lock-in is enforced by `export.templates.test.ts`, which tests:
(1) every allowlist path is accepted;
(2) `user.password`, `orgId`, `responsesJson`, `__proto__`, `constructor`
    are rejected;
(3) `evalSource` returns empty (not `[object Object]`) when the template
    points at a container;
(4) Tenant custom templates cannot claim `builtin: true`.

## Consequences

**Easier:**
- Adding a new exportable column is one PR: one line in
  `columnSourcePaths`, one line in `denormalizeAssessment()`, one line in the
  UI's `sourcePathOptions` (actually auto-driven so it's zero lines in the
  UI). The test suite catches any drift.
- Security review for the export feature is bounded to the 18 paths in the
  constant.

**Harder:**
- HR cannot do computed columns (e.g. "Self score minus Manager score").
  We will revisit this with cel-js or a minimal expression DSL if a real
  customer requests it.

**Risks / follow-ups:**
- The denormalized row shape is decided in `export.service.ts`'s
  `denormalizeAssessment()`. Keep that function's `include` clause aligned
  with `columnSourcePaths` — drift means allowlisted paths return empty
  strings. Covered by the default-template test (every column populated
  from the seed fixture).

## Follow-ups

- [ ] Document the allowlist in the HR admin help center when the feature
      ships.
- [ ] Add a Playwright e2e test: create a custom template, run a cycle
      export, assert headers + first row match.
- [ ] Revisit expressions/computed columns after the May 2026 appraisal-cycle
      feedback window.
