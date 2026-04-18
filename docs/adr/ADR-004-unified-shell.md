# ADR-004: Unified web shell with role-gated navigation

- **Status**: Proposed (default pick)
- **Date**: 2026-04-18
- **Deciders**: Tech Lead + UX
- **Context tag**: D4

## Context

Plan §2.2 defines 5 personas (Employee, Manager, HR Admin, AI Champion, Leadership) with different info-density needs. We need to decide between one `<AppShell>` that filters by role vs five persona-specific shells.

## Decision

Use a **unified `<AppShell>`** with role-gated navigation in Phase 1. Each persona sees only the menu items their role grants. Sub-layouts (`<ManagerTeamLayout>`, `<HrCycleLayout>`) compose under `<AppShell>` for persona-specific density.

Rationale: velocity wins in Phase 1. Persona-specific polish (density, theming) arrives in Phase 3 if needed, and a split can be done then without rewriting the API layer.

## Consequences

**Easier**:
- One layout to maintain; adding a new role is trivial.
- Navigation state and session logic live in one place.

**Harder**:
- Risk of UI feeling "one-size-fits-all" for employees who only use self-assessment once per cycle.

**Follow-ups**:
- Track Manager satisfaction score (success metric §11.2). If <4/5 in Phase 2, revisit with a per-persona split in Phase 3.
