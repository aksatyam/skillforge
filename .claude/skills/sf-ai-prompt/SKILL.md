---
name: sf-ai-prompt
description: Design, review, and version Claude prompt chains for SkillForge artifact analysis, score suggestion, and bias detection. Use when the user asks to "write a prompt", "analyze an artifact", "design a Claude chain", "review AI output structure", or mentions LangChain, artifact analysis, or AI scoring.
---

# Claude Prompt Chain Builder

Designs and stores Claude prompt chains under `backend/services/ai-evaluation/prompts/` with strict structured output, PII stripping, and versioning.

## Non-negotiable AI rules (from memory)

1. **Stateless** — no thread IDs, no cross-request memory of individual users.
2. **PII-stripped** — replace `user.name`, `user.email`, `user.phone` with `user_<sha256(id)>` before prompt.
3. **Explainable** — every output must include `reasoning` and `confidence` (0–100).
4. **Advisory** — output is written to `ai_score`, never directly to `composite_score`.
5. **Structured** — use XML tags or JSON with a schema the code validates before accepting.
6. **Prompt-cached** — system prompts use Anthropic's prompt caching (5-min TTL) to keep cost + latency low.

## Canonical prompt chain template

```
prompts/
├── artifact-analysis/
│   ├── v1/
│   │   ├── system.md              # cached; stable across requests
│   │   ├── user-template.md       # templated with artifact + context
│   │   ├── schema.json            # JSON Schema for output validation
│   │   └── examples.json          # few-shot examples
│   └── index.ts                   # exports the chain
├── score-suggestion/
│   └── v1/ ...
└── bias-detection/
    └── v1/ ...
```

## Standard chain structure (for any new prompt)

**System prompt** (cached, stable):
- Role definition — "You are an AI assessor for the SkillForge platform..."
- Scoring rubric — pulled from `role_mapping.assessment_criteria_json`
- Output format specification — strict JSON schema
- Guardrails — "Never invent evidence. If confidence < 60, mark as 'needs-human-review'."

**User prompt** (dynamic):
- Artifact content (text-extracted for docs/PDFs)
- Anonymized employee context (role, experience band, NOT name/email)
- Assessment cycle context (maturity level target)
- Explicit instruction to output ONLY the JSON schema

**Output validation**:
- Parse JSON → validate against `schema.json` (using ajv/zod)
- If validation fails, retry once with "Your previous output did not match the schema. Fix: <error>"
- If retry fails, record failure and fall back to manual review queue

**Logging**:
- Log prompt version, input hash, output hash, latency, token count
- NEVER log raw prompt content (PII could leak even after stripping — defense in depth)
- Metrics: p50/p95 latency, schema-fail rate, retry rate, cost per call

## Workflow for a new prompt chain

1. Ask: what's the chain for? (analysis / suggestion / detection / ...)
2. Draft `system.md` with rubric + format.
3. Draft `user-template.md` with `{{variable}}` placeholders.
4. Define `schema.json` with `reasoning`, `confidence`, and chain-specific fields.
5. Write 2–3 `examples.json` covering high/medium/low confidence cases.
6. Write the LangChain wrapper in `index.ts` with:
   - Input DTO → PII stripping → prompt render
   - Claude API call with `prompt_caching` on system
   - Output parsing → schema validation → retry logic
   - Metrics emission

## Learning opportunity — high-leverage

**Your call shapes how every Claude call works**:

1. **Output format**: XML tags (`<reasoning>...</reasoning>`) or JSON object? XML is more robust to Claude's natural output style but requires parser. JSON needs stricter instructions but is easier to validate.

2. **Confidence bands**: Should we use numeric 0–100, or three buckets (`low`/`medium`/`high`)? Numeric is finer-grained but harder to calibrate; buckets are easier to communicate to managers.

3. **Failure behavior**: When Claude output fails schema validation after one retry, do we:
   - (a) fall back to a rule-based scorer (keyword + length heuristics)
   - (b) route to a human-review queue with the raw output
   - (c) just skip and let the manager score without AI input

Pick 1 and 2 first — they're codebase-wide conventions. (3) can be configured per chain.
