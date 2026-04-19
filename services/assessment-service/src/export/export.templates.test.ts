/**
 * Unit tests for the Sprint-6 export template engine.
 *
 * These tests lock down the three safety properties we depend on:
 *   (1) `columnSourcePaths` is the one-and-only allowlist — anything outside
 *       it (typos, traversal attempts, builtin shadowing) must be rejected.
 *   (2) `evalSource` never throws on missing/null branches and never leaks
 *       an `[object Object]` into the CSV.
 *   (3) `mergeTemplates` preserves the server's authority over the
 *       `builtin` flag — a tenant cannot mark a custom row as builtin.
 *
 * If one of these regresses, the CSV export becomes a lateral-movement
 * primitive: a tenant could read columns we didn't mean to denormalize
 * or bypass UI checks by hand-crafting a template row.
 */
import { describe, it, expect } from 'vitest';
import {
  columnSourcePaths,
  isValidSource,
  evalSource,
  scoreToString,
  validateSources,
  mergeTemplates,
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
} from './export.templates';
import type { ExportTemplate } from '@skillforge/shared-types';

describe('export.templates: allowlist', () => {
  it('isValidSource accepts every path in columnSourcePaths', () => {
    for (const p of columnSourcePaths) {
      expect(isValidSource(p)).toBe(true);
    }
  });

  it('rejects paths not on the allowlist', () => {
    // Arbitrary typos + fields we intentionally did NOT denormalize.
    expect(isValidSource('user.password')).toBe(false);
    expect(isValidSource('user.passwordHash')).toBe(false);
    expect(isValidSource('orgId')).toBe(false); // tenant-bleed guard
    expect(isValidSource('responsesJson')).toBe(false); // raw JSON blob
    expect(isValidSource('user.managerId')).toBe(false); // opaque id
  });

  it('rejects traversal-ish attempts and empty strings', () => {
    expect(isValidSource('')).toBe(false);
    expect(isValidSource('user')).toBe(false); // partial — must be a leaf
    expect(isValidSource('user.')).toBe(false);
    expect(isValidSource('.user.name')).toBe(false);
    expect(isValidSource('user..name')).toBe(false);
    expect(isValidSource('user.manager')).toBe(false); // returns object
  });

  it('rejects prototype-pollution-flavored keys', () => {
    // If the allowlist ever stopped being authoritative, an attacker
    // could try to walk __proto__ or constructor out of the denormalized
    // row. We guard against the *path itself* appearing on the allowlist.
    expect(isValidSource('__proto__')).toBe(false);
    expect(isValidSource('user.__proto__.name')).toBe(false);
    expect(isValidSource('constructor')).toBe(false);
    expect(isValidSource('user.constructor.name')).toBe(false);
  });
});

describe('export.templates: evalSource', () => {
  const row = {
    user: {
      id: 'u-123',
      name: 'Alice',
      manager: { name: 'Bob', email: 'bob@example.com' },
    },
    selfScore: 4.25,
    submittedAt: new Date('2026-04-01T10:00:00Z'),
    managerRationale: null,
    compositeScore: { toString: () => '4.10' }, // Prisma Decimal stand-in
  };

  it('walks a dot-path to a leaf', () => {
    expect(evalSource(row, 'user.id')).toBe('u-123');
    expect(evalSource(row, 'user.manager.name')).toBe('Bob');
    expect(evalSource(row, 'user.manager.email')).toBe('bob@example.com');
  });

  it('stringifies numbers and Decimals', () => {
    expect(evalSource(row, 'selfScore')).toBe('4.25');
    expect(evalSource(row, 'compositeScore')).toBe('4.10');
  });

  it('emits ISO string for Date leaves', () => {
    expect(evalSource(row, 'submittedAt')).toBe('2026-04-01T10:00:00.000Z');
  });

  it('short-circuits to empty string on null/undefined branches', () => {
    // Verifies we do NOT throw when manager is missing — the row shape
    // varies across employees.
    expect(evalSource({ user: { manager: null } }, 'user.manager.name')).toBe('');
    expect(evalSource({ user: null }, 'user.manager.name')).toBe('');
    expect(evalSource({}, 'user.manager.name')).toBe('');
    expect(evalSource(row, 'managerRationale')).toBe('');
  });

  it('returns empty string rather than [object Object] when the leaf is a plain object', () => {
    // If an exporter template points at a container (not a leaf), we
    // *must not* splat "[object Object]" into the CSV. scoreToString
    // detects this and emits empty.
    const res = evalSource(row, 'user.manager'); // returns the object
    expect(res).toBe('');
  });

  it('returns empty for traversal on primitives', () => {
    // E.g. selfScore is a number — trying to walk into it must not throw.
    expect(evalSource(row, 'selfScore.toFixed')).toBe('');
  });

  it('returns empty for empty source', () => {
    expect(evalSource(row, '')).toBe('');
  });

  it('scoreToString converts null/undefined to empty', () => {
    expect(scoreToString(null)).toBe('');
    expect(scoreToString(undefined)).toBe('');
  });
});

describe('export.templates: validateSources', () => {
  const baseCol = { header: 'X', source: '' };

  it('accepts every builtin template', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(validateSources(t)).toEqual([]);
    }
  });

  it('flags every bad source in a template', () => {
    const t: ExportTemplate = {
      id: 'sneaky',
      name: 'Sneaky',
      builtin: false,
      columns: [
        { ...baseCol, header: 'OK', source: 'user.id' },
        { ...baseCol, header: 'PW', source: 'user.password' },
        { ...baseCol, header: 'Tenant', source: 'orgId' },
      ],
    };
    expect(validateSources(t).sort()).toEqual(['orgId', 'user.password']);
  });
});

describe('export.templates: mergeTemplates', () => {
  it('returns only builtins when tenant has no custom templates', () => {
    const merged = mergeTemplates(null);
    expect(merged).toHaveLength(BUILTIN_TEMPLATES.length);
    expect(merged.map((t) => t.id)).toContain(DEFAULT_TEMPLATE_ID);
  });

  it('appends custom templates without builtin flag', () => {
    const custom: ExportTemplate = {
      id: 'tenant-one',
      name: 'One',
      builtin: true, // ← tenant tries to flag as builtin
      columns: [{ header: 'Id', source: 'user.id' }],
    };
    const merged = mergeTemplates([custom]);
    const found = merged.find((t) => t.id === 'tenant-one');
    expect(found).toBeDefined();
    // The server forces builtin=false for non-builtin ids — tenant cannot lie.
    expect(found!.builtin).toBe(false);
  });

  it('tenant custom row shadowing a builtin id retains builtin=true', () => {
    // Edge case: a legacy tenant may have a row with id === 'default'.
    // We honor their overrides but the UI still shows the builtin badge.
    const shadow: ExportTemplate = {
      id: DEFAULT_TEMPLATE_ID,
      name: 'Legacy default',
      builtin: false,
      columns: [{ header: 'Id', source: 'user.id' }],
    };
    const merged = mergeTemplates([shadow]);
    const d = merged.find((t) => t.id === DEFAULT_TEMPLATE_ID);
    expect(d).toBeDefined();
    expect(d!.builtin).toBe(true); // server-decided
    expect(d!.name).toBe('Legacy default'); // tenant content preserved
  });
});
