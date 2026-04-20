# @skillforge/pii

PII anonymization for outbound AI calls. See [ADR-013 §Decision 2](../../docs/adr/ADR-013-phase-2-1-ai-governance.md) for the full rationale.

## What this package does

Any string that's about to leave our infrastructure and hit a Claude API endpoint passes through `anonymize()` first. It rewrites identifying substrings (emails, phone numbers, PAN, Aadhaar, employee IDs, person names, URLs with user fragments) to stable placeholders like `<EMAIL_1>`, `<NAME_1>`, `<PAN_1>` so the LLM can still reason about references without ever seeing raw PII.

**Hard rule:** every outbound Claude call in `services/assessment-service/src/ai-evaluation/**` must pass its input through an `IAnonymizer.anonymize()` call. Enforced by ESLint rule `skillforge/anonymize-before-ai` (ships in Sprint 8).

## Quick start

```ts
import { createAnonymizer } from "@skillforge/pii";

const anonymizer = createAnonymizer();
const { clean, replacements } = await anonymizer.anonymize(
  "Ravi Kumar (ravi.kumar@demo.qualtech.ai, +91-98765-43210) uploaded Q3 report."
);
// clean:
//   "<NAME_1> (<EMAIL_1>, <PHONE_1>) uploaded Q3 report."
// replacements: [ { class: "person_name", original: "Ravi Kumar", placeholder: "<NAME_1>", ... }, ... ]
```

`clean` is the only value that may leave the network boundary. `replacements` stays server-side for audit-log linking.

## Design contract — `IAnonymizer`

See [`src/types.ts`](./src/types.ts) for the full interface. Three open design questions are flagged as `TODO [owner: Ashish]` in that file — please pin them before the concrete implementation lands.

## Recall gate

CI runs `pnpm --filter=@skillforge/pii test:recall` against the fixture corpus in `test/fixtures/`. Merge is blocked below **95% recall** per ADR-013's acceptance criteria. The corpus grows as we discover failure modes — contribute a fixture when you find a miss.

Fixture format: JSON files with `{ input: string, expected_spans: Array<{class, start, end}> }`.

## When to escalate to Presidio

If any of the following, open ADR-014 (placeholder) and move to the Presidio sidecar:

- Recall on fixture corpus drops below 95% and no amount of regex work recovers it
- Post-cutover Sprint-10 manual audit of 100 prod samples shows < 92% recall
- Qualtech or another tenant requires a class we don't cover (e.g. policy number, GSTIN in B2B scenarios)

The swap is designed to be mechanical: implement `IAnonymizer` in a new class, change one provider binding in `AiEvaluationModule`.
