# Fixture corpus for PII recall test

The recall test (`test/recall.spec.ts`) runs the anonymizer over every
fixture in this directory and asserts that every labeled PII span is
covered by at least one replacement.

Fixtures live in two places:

- `seed.json` — baseline corpus of 15 realistic Qualtech-style inputs,
  maintained as a single array for easy review and CI diff ergonomics.
- `individual/*.json` — one-per-file fixtures contributed ad hoc when a
  miss is discovered. Loaded with the same schema.

## Format

```json
{
  "id": "emp-perf-review-01",
  "source": "synthetic" | "anonymized-from-prod",
  "input": "Ravi Kumar (ravi.kumar@demo.qualtech.ai) submitted Q3...",
  "expected_spans": [
    { "class": "person_name", "start": 0, "end": 10 },
    { "class": "email", "start": 12, "end": 38 }
  ]
}
```

Offsets are 0-indexed, end-exclusive. `class` must be a valid `PiiClass`
from `src/types.ts`.

## Seed + maintenance

Seed corpus covers the first 15 fixtures. The target corpus size is 200 by
Sprint-8 close. Contribute a new fixture whenever the recall test or
post-cutover manual audit surfaces a miss.

**DPDP rule:** all fixtures must be either synthetic or fully anonymized
before landing here. NEVER commit a fixture copied from real Qualtech
tenant data without first anonymizing every span manually. Mark the
`source` field accordingly; CI grep check fails if `source: "prod-raw"`.

## Recall gate

Recall target: **≥ 95%** per ADR-013. The recall test fails the build below
this threshold. A span is "recalled" if:

- An anonymizer replacement covers the same range (exact match), OR
- An anonymizer replacement covers a SUPERSET of the expected span
  (e.g. expected `person_name` on first name, anonymizer caught "First Last")

Precision (false positives) is measured but NOT gated in Phase 2.1 — we
tolerate over-redaction, not under-redaction, since over-redaction only
costs prompt quality, not compliance.
