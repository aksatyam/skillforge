# ADR-005: Claude outputs use XML tags, parsed to structured JSON

- **Status**: Proposed (default pick)
- **Date**: 2026-04-18
- **Deciders**: AI Engineer + Tech Lead
- **Context tag**: D5

## Context

Every Phase 2 Claude chain (artifact analysis, score suggestion, bias detection) must produce structured, validate-able output. We can use JSON or XML tags.

## Decision

**XML tags in the prompt, parsed to JSON at the service boundary.** Every response has:

```xml
<analysis>
  <reasoning>...</reasoning>
  <confidence>0-100</confidence>
  <evidence>
    <item>...</item>
  </evidence>
  <suggested_score>...</suggested_score>
</analysis>
```

A small parser (in `services/ai-evaluation/src/parsers/xml-to-json.ts`) converts to a typed JSON object validated via zod.

## Rationale

- Claude is measurably more reliable with XML than JSON (it doesn't wrap output in markdown fences, doesn't inject preamble text).
- XML is trivial to parse with a regex for simple cases, or fast-xml-parser for nested.
- Zod validates the resulting JSON — same type safety as JSON-only.
- Reasoning can contain natural prose without escaping.

## Consequences

**Easier**:
- Prompts are more natural to write.
- Parse failures are easier to debug (you can see the raw text).

**Harder**:
- One extra parse step; negligible perf cost.

**Follow-ups**:
- Write a shared `parseClaudeXml<T>(raw, schema)` helper in `services/ai-evaluation/src/parsers/`.
