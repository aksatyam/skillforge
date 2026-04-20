import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RegexAnonymizer } from "../src/regex-anonymizer";
import type { PiiClass, Replacement } from "../src/types";

/**
 * Recall test — the CI gate from ADR-013.
 *
 * Loads every fixture from test/fixtures/seed.json plus any files in
 * test/fixtures/individual/. Runs the anonymizer over each input. For every
 * labeled PII span, asserts that SOME replacement covers it.
 *
 * A span is "covered" when either:
 *   - a replacement's [start, end) exactly equals the span's, OR
 *   - a replacement's [start, end) strictly contains the span (e.g. expected
 *     single-word name but anonymizer caught "First Last")
 *
 * Target: ≥ 95% recall. Below that, this suite fails the build.
 */

const RECALL_THRESHOLD = 0.95;

interface PiiExpectation {
  class: PiiClass;
  text: string;
}

interface Fixture {
  id: string;
  source: string;
  input: string;
  expected_pii: PiiExpectation[];
}

interface ResolvedSpan {
  class: PiiClass;
  start: number;
  end: number;
  text: string;
}

function loadFixtures(): Fixture[] {
  const fixturesDir = resolve(__dirname, "fixtures");
  const out: Fixture[] = [];

  // Seed file
  const seedPath = join(fixturesDir, "seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as Fixture[];
  out.push(...seed);

  // Individual fixtures directory (may not exist yet)
  const individualDir = join(fixturesDir, "individual");
  try {
    if (statSync(individualDir).isDirectory()) {
      for (const entry of readdirSync(individualDir)) {
        if (!entry.endsWith(".json")) continue;
        const f = JSON.parse(readFileSync(join(individualDir, entry), "utf8")) as Fixture;
        out.push(f);
      }
    }
  } catch {
    /* directory does not exist; skip */
  }

  return out;
}

/**
 * Turn a list of "find this text, mark as this class" expectations into
 * absolute offset spans. Each occurrence of `text` in `input` counts once,
 * in source order. If the same (class,text) is expected N times, the first
 * N occurrences in the input are used.
 */
function resolveSpans(input: string, expectations: PiiExpectation[]): ResolvedSpan[] {
  const counts = new Map<string, number>();
  const result: ResolvedSpan[] = [];

  for (const exp of expectations) {
    const key = `${exp.class}::${exp.text}`;
    const nth = counts.get(key) ?? 0;
    counts.set(key, nth + 1);

    // Find the (nth + 1)-th occurrence of exp.text in input.
    let searchFrom = 0;
    let idx = -1;
    for (let i = 0; i <= nth; i++) {
      idx = input.indexOf(exp.text, searchFrom);
      if (idx === -1) break;
      searchFrom = idx + 1;
    }
    if (idx === -1) {
      throw new Error(
        `Fixture expectation not found in input: class=${exp.class} text=${JSON.stringify(exp.text)}`,
      );
    }
    result.push({
      class: exp.class,
      start: idx,
      end: idx + exp.text.length,
      text: exp.text,
    });
  }

  return result;
}

function coversSpan(r: Replacement, span: ResolvedSpan): boolean {
  // Class must match, OR r.class covers span.class as a stricter class
  // (not applicable in Phase 2.1 — classes don't subtype).
  if (r.class !== span.class) return false;
  return r.start <= span.start && r.end >= span.end;
}

describe("PII recall — fixture corpus", () => {
  const fixtures = loadFixtures();
  const anonymizer = new RegexAnonymizer();

  it(`loaded at least the seed corpus (15 fixtures expected)`, () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });

  // Per-fixture detail — helps debug which fixture misses a span
  for (const fx of fixtures) {
    it(`fixture ${fx.id}: every expected span is covered`, async () => {
      const { replacements } = await anonymizer.anonymize(fx.input);
      const expected = resolveSpans(fx.input, fx.expected_pii);
      const misses: string[] = [];
      for (const span of expected) {
        const covered = replacements.some((r) => coversSpan(r, span));
        if (!covered) {
          misses.push(
            `[${span.class}] "${span.text}" at [${span.start},${span.end})`,
          );
        }
      }
      expect(
        misses,
        `fixture ${fx.id} missed ${misses.length} span(s):\n  ${misses.join("\n  ")}`,
      ).toHaveLength(0);
    });
  }

  // Aggregate recall — the gate from ADR-013
  it(`aggregate recall >= ${(RECALL_THRESHOLD * 100).toFixed(0)}% across all fixtures`, async () => {
    let totalExpected = 0;
    let totalCovered = 0;
    const missesByFixture: string[] = [];

    for (const fx of fixtures) {
      const { replacements } = await anonymizer.anonymize(fx.input);
      const expected = resolveSpans(fx.input, fx.expected_pii);
      for (const span of expected) {
        totalExpected++;
        if (replacements.some((r) => coversSpan(r, span))) {
          totalCovered++;
        } else {
          missesByFixture.push(`${fx.id}: [${span.class}] "${span.text}"`);
        }
      }
    }

    const recall = totalExpected === 0 ? 1 : totalCovered / totalExpected;
    const detail = `recall=${(recall * 100).toFixed(2)}% (${totalCovered}/${totalExpected})${
      missesByFixture.length ? "\nMisses:\n  " + missesByFixture.join("\n  ") : ""
    }`;

    // Attach detail to the failure message so CI logs are useful.
    expect(recall, detail).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
  });
});
