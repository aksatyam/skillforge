import { AnonymizerError } from "./errors";
import { isKnownGivenName } from "./gazetteer";
import { SafeAnonymizeResult } from "./safe-result";
import type {
  AnonymizeOptions,
  AnonymizeResult,
  IAnonymizer,
  PiiClass,
  Replacement,
} from "./types";
import { PLACEHOLDER_PREFIX } from "./types";

/**
 * Detector contract. Each detector claims a PII class and yields candidate
 * spans. The anonymizer runs detectors in priority order and resolves
 * overlapping spans by "first detector wins" — earlier = more specific.
 *
 * Detector priority (by array index in DETECTORS below):
 *   0. email           (highly specific, no false positives)
 *   1. url_with_user   (claims @-anchored URLs before email fires)
 *   2. aadhaar         (12 digit, very specific)
 *   3. pan             (10 alphanumeric with exact letter/digit pattern)
 *   4. employee_id     (QT-\d{5} or similar prefix-digit)
 *   5. phone_intl      (e.g. +1-... or +44 ...)
 *   6. phone_in        (10 digits with +91 / 91 / 0 prefix variants)
 *   7. person_name     (gazetteer + 2-Title-Case heuristic + extraNames)
 *
 * Adding a class: create a detector, insert at the priority position that
 * reflects its specificity, update unit tests + fixture corpus.
 */
interface DetectorHit {
  class: PiiClass;
  original: string;
  start: number;
  end: number;
}

interface Detector {
  class: PiiClass;
  detect(input: string, opts: AnonymizeOptions | undefined): DetectorHit[];
}

// --- 1. email ------------------------------------------------------------
// RFC 5321 ish — deliberately liberal on local-part (commonly seen
// employee.firstname+tag@domain forms) and strict on TLD (2-24 chars, letters).
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;

const emailDetector: Detector = {
  class: "email",
  detect: (input) => collectRegex(input, EMAIL_RE, "email"),
};

// --- 2. url with user ---------------------------------------------------
// URLs carrying employee info in the path or query — e.g.
// https://intranet.qualtech.ai/people/ravi.kumar
// Limited to known corp-adjacent hostnames to avoid false-positives on marketing URLs.
const URL_USER_RE =
  /https?:\/\/[a-z0-9.-]+\/(?:people|user|profile|employee|u)\/[A-Za-z0-9._-]+\b/gi;

const urlUserDetector: Detector = {
  class: "url_with_user",
  detect: (input) => collectRegex(input, URL_USER_RE, "url_with_user"),
};

// --- 3. aadhaar ---------------------------------------------------------
// 12 digits, often formatted as 4-4-4 with spaces or hyphens. Word boundaries
// avoid claiming a chunk of a longer number.
const AADHAAR_RE = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

const aadhaarDetector: Detector = {
  class: "aadhaar",
  detect: (input) => collectRegex(input, AADHAAR_RE, "aadhaar"),
};

// --- 4. pan -------------------------------------------------------------
// PAN format: 5 uppercase letters, 4 digits, 1 uppercase letter. The 4th
// character indicates entity type (P = individual is most common in HR data).
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;

const panDetector: Detector = {
  class: "pan",
  detect: (input) => collectRegex(input, PAN_RE, "pan"),
};

// --- 5. employee_id -----------------------------------------------------
// Common patterns: QT-12345, QT12345, EMP-00012, INF-PROD-0042. Prefix is
// 2-6 uppercase letters, optional hyphen, then 3-8 digits (may have a second
// uppercase segment before the digits for department-scoped IDs).
const EMP_ID_RE = /\b[A-Z]{2,6}-?(?:[A-Z]{2,6}-?)?\d{3,8}\b/g;

const employeeIdDetector: Detector = {
  class: "employee_id",
  detect: (input) => collectRegex(input, EMP_ID_RE, "employee_id"),
};

// --- 6. phone_intl ------------------------------------------------------
// International phone: +<country>-<rest>. Country code 1-3 digits; rest has
// at least 7 total digits (allowing spaces, hyphens, parens between).
const PHONE_INTL_RE =
  /\+(?!91[\s-]?\d)\d{1,3}[\s-]?(?:\(\d{1,4}\)[\s-]?)?\d{2,4}[\s-]?\d{2,4}[\s-]?\d{2,4}\b/g;

const phoneIntlDetector: Detector = {
  class: "phone_intl",
  detect: (input) => collectRegex(input, PHONE_INTL_RE, "phone_intl"),
};

// --- 7. phone_in --------------------------------------------------------
// Indian mobile/landline starting 6-9. Common prefixes: +91, 91, 0. We allow
// any placement of spaces or hyphens between digits (no fixed 3-3-4 grouping)
// so "+91-98765-43210", "+91 80 6789 1234", "9876543210", etc. all match.
// Negative lookbehind/lookahead for digits prevents matching the tail of a
// longer ID string.
const PHONE_IN_RE = /(?<!\d)(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/g;

const phoneInDetector: Detector = {
  class: "phone_in",
  detect: (input) => collectRegex(input, PHONE_IN_RE, "phone_in"),
};

// --- 8. person_name -----------------------------------------------------
// Three signals, any one sufficient:
//   a. Token is in the gazetteer (case-insensitive)
//   b. Two consecutive Title-Case tokens (surname catch)
//   c. Token is in options.extraNames (per-org roster)
//
// To avoid claiming title-case tokens that are NOT names (e.g. "Q3 Report",
// "Product Manager"), signal (b) additionally requires that at least ONE of
// the two tokens looks name-like: 3+ letters, no digits, not in a small
// stopword list of common Title-Case words in HR contexts.
// Title-cased words that appear frequently in HR contexts and must NOT be
// treated as name candidates even adjacent to another Title-Case token.
const NAME_STOPWORDS = new Set([
  "Product", "Manager", "Senior", "Junior", "Principal", "Staff",
  "Engineer", "Engineering", "Architect", "Lead", "Team", "Tech",
  "Technical", "Software", "Hardware", "Quality", "Business", "Sales",
  "Marketing", "Finance", "Legal", "Operations", "Strategy", "Program",
  "Project", "Director", "Vice", "President", "Chief", "Head", "Department",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Q1", "Q2", "Q3", "Q4", "FY", "YoY", "MoM", "YTD", "MTD",
  "Phase", "Sprint", "Epic", "Story", "Task", "Report", "Dashboard",
  "India", "Bangalore", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune",
  "Noida", "Gurgaon", "Kolkata",
  "Qualtech", "SkillForge",
]);

const personNameDetector: Detector = {
  class: "person_name",
  detect: (input, opts) => {
    const hits: DetectorHit[] = [];
    const extra = new Set((opts?.extraNames ?? []).map((n) => n.toLowerCase()));

    // Token-level pass for signals (a) and (c). We deliberately exclude the
    // apostrophe from the token character class so possessives like "Sanjay's"
    // split into token "Sanjay" + "'" + "s" — the gazetteer lookup then hits
    // "Sanjay" cleanly, and the replacement covers the bare name (the "'s"
    // stays in the clean output, which reads naturally).
    const tokenRe = /\b[A-Z][a-zA-Z-]+\b/g;
    const titleCaseMatches: Array<{ text: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(input)) !== null) {
      titleCaseMatches.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }

    for (const t of titleCaseMatches) {
      const lower = t.text.toLowerCase();
      if (isKnownGivenName(t.text) || extra.has(lower)) {
        hits.push({ class: "person_name", original: t.text, start: t.start, end: t.end });
      }
    }

    // Adjacency pass for signal (b). Merges two consecutive Title-Case tokens
    // into one hit when at least one is name-like and neither is in NAME_STOPWORDS.
    // Builds on top of the existing `titleCaseMatches` to keep offsets consistent.
    for (let i = 0; i < titleCaseMatches.length - 1; i++) {
      const a = titleCaseMatches[i];
      const b = titleCaseMatches[i + 1];
      // Adjacent means: separated by whitespace only, no intervening non-space chars.
      const between = input.slice(a.end, b.start);
      if (!/^\s+$/.test(between)) continue;
      if (NAME_STOPWORDS.has(a.text) || NAME_STOPWORDS.has(b.text)) continue;
      // At least one must look name-like: gazetteer hit, extraNames hit, or
      // lowercase length >= 3 and no digits (the tokenRe already filters digits).
      const aNameLike = isKnownGivenName(a.text) || extra.has(a.text.toLowerCase());
      const bNameLike = isKnownGivenName(b.text) || extra.has(b.text.toLowerCase());
      if (!aNameLike && !bNameLike) continue;

      hits.push({
        class: "person_name",
        original: input.slice(a.start, b.end),
        start: a.start,
        end: b.end,
      });
    }

    return hits;
  },
};

// Priority order. Earlier wins on overlap.
const DETECTORS: readonly Detector[] = [
  emailDetector,
  urlUserDetector,
  aadhaarDetector,
  panDetector,
  employeeIdDetector,
  phoneIntlDetector,
  phoneInDetector,
  personNameDetector,
];

const MAX_INPUT_LENGTH = 100_000;

export class RegexAnonymizer implements IAnonymizer {
  async anonymize(
    input: string,
    options?: AnonymizeOptions,
  ): Promise<AnonymizeResult> {
    if (input.length > MAX_INPUT_LENGTH) {
      throw new AnonymizerError(
        "INPUT_TOO_LARGE",
        `input length ${input.length} exceeds max ${MAX_INPUT_LENGTH}`,
      );
    }

    const onlyClasses = options?.onlyClasses ? new Set(options.onlyClasses) : null;
    const consistent = options?.consistentPlaceholders ?? true;

    // 1. Collect hits from all detectors (respecting onlyClasses filter).
    const rawHits: DetectorHit[] = [];
    for (const detector of DETECTORS) {
      if (onlyClasses && !onlyClasses.has(detector.class)) continue;
      try {
        rawHits.push(...detector.detect(input, options));
      } catch (cause) {
        throw new AnonymizerError(
          "DETECTOR_CRASH",
          `detector ${detector.class} threw`,
          cause,
        );
      }
    }

    // 2. Sort by start offset, then by detector priority (earlier = higher prio).
    //    Priority is implicit in the insertion order above; we preserve it via
    //    a stable secondary key.
    const priorityIndex = new Map<PiiClass, number>(
      DETECTORS.map((d, i) => [d.class, i]),
    );
    rawHits.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      // On same start: shorter span wins only if higher priority;
      // else longer span wins (more coverage).
      const pa = priorityIndex.get(a.class) ?? 99;
      const pb = priorityIndex.get(b.class) ?? 99;
      if (pa !== pb) return pa - pb;
      return b.end - a.end;
    });

    // 3. Resolve overlaps: greedy, earlier-start + higher-priority wins.
    const accepted: DetectorHit[] = [];
    let lastEnd = -1;
    for (const hit of rawHits) {
      if (hit.start >= lastEnd) {
        accepted.push(hit);
        lastEnd = hit.end;
      }
    }

    // 4. Assign placeholders. In consistent mode, the same original maps to
    //    the same placeholder (per class).
    const counters = new Map<PiiClass, number>();
    const seen = new Map<string, string>(); // key: `${class}::${original}`
    const replacements: Replacement[] = [];

    for (const hit of accepted) {
      const key = `${hit.class}::${hit.original}`;
      let placeholder: string;
      if (consistent && seen.has(key)) {
        placeholder = seen.get(key)!;
      } else {
        const prefix = PLACEHOLDER_PREFIX[hit.class];
        const next = (counters.get(hit.class) ?? 0) + 1;
        counters.set(hit.class, next);
        placeholder = `<${prefix}_${next}>`;
        if (consistent) seen.set(key, placeholder);
      }
      replacements.push({
        class: hit.class,
        original: hit.original,
        placeholder,
        start: hit.start,
        end: hit.end,
      });
    }

    // 5. Apply replacements to build `clean`. Replace from right to left so
    //    offsets remain valid during the rewrite.
    let clean = input;
    for (const r of [...replacements].sort((a, b) => b.start - a.start)) {
      clean = clean.slice(0, r.start) + r.placeholder + clean.slice(r.end);
    }

    return new SafeAnonymizeResult(clean, replacements);
  }
}

// ---------- helpers ----------

function collectRegex(
  input: string,
  re: RegExp,
  klass: PiiClass,
): DetectorHit[] {
  const hits: DetectorHit[] = [];
  // `re` MUST be created with the `g` flag; we rely on `lastIndex` advancing.
  // Clone to avoid mutating the shared module-level regex between calls.
  const localRe = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = localRe.exec(input)) !== null) {
    hits.push({
      class: klass,
      original: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return hits;
}
