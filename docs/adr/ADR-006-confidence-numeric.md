# ADR-006: Confidence is numeric 0–100 internally, bucketed in UI

- **Status**: Proposed (default pick)
- **Date**: 2026-04-18
- **Deciders**: AI Engineer + UX
- **Context tag**: D6

## Decision

- **Internal storage + logic**: integer confidence `0–100` in `assessment.ai_confidence` and `artifact.ai_analysis_json.confidence`.
- **UI display**: three buckets — `Low (<60)`, `Medium (60–79)`, `High (80+)` — via `<AiSuggestionBadge>`.
- **Thresholds**: confidence `< 60` auto-routes to "needs human review" queue, never surfaces to manager as a suggestion.

## Rationale

Numeric internally preserves statistical power for bias detection + calibration drift analysis. Bucketed externally is easier for managers to act on and less likely to over-anchor them on a false-precision number.

Thresholds (60 / 80) are tunable per org via `organization.settings_json.ai.confidence_thresholds`.

## Consequences

**Easier**:
- A/B testing threshold changes without schema migration.
- Bias detection has numeric inputs for outlier analysis.

**Harder**:
- Two representations to keep in sync in tests.

**Follow-ups**:
- Calibration review in Sprint 14 (Phase 2): compare AI confidence vs manager final score to tune thresholds.
