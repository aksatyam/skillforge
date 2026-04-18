# ADR-008: Employees see their AI-suggested score only AFTER submitting self-assessment

- **Status**: Proposed (default pick, requires Product Owner + HR confirmation)
- **Date**: 2026-04-18
- **Deciders**: Product Owner + HR Lead (Tech Lead pre-decision)
- **Context tag**: D8

## Decision

Employee AI-score visibility is **"After Submit"**:

1. During self-assessment, the AI suggestion is hidden — employee scores independently.
2. Once self-assessment is submitted, the AI suggestion appears on their scorecard with a "Why this score?" link showing Claude's reasoning.
3. The manager-final composite remains hidden from the employee until the cycle is `closed`.

Behavior is configurable per-org in `organization.settings_json.ai.employee_visibility`:
```
"never" | "after_submit" (default) | "pre_submit"
```

## Rationale

- "After submit" preserves self-assessment integrity (no anchoring bias).
- Transparency post-submit builds trust in AI — matches plan §7.4 explainability principle.
- "Never" feels paternalistic; "pre_submit" risks anchoring (employees match AI to avoid conflict with manager).

## Consequences

**Easier**:
- Clear UX pattern; employees have ONE clear moment to reveal the AI score.

**Harder**:
- If the AI analysis hasn't completed when employee submits (async job), we need a "Your AI analysis is processing" state.

**Follow-ups**:
- Notification when AI analysis completes post-submit.
- Measure in Phase 2: does "after submit" change the gap between self and manager scores?
