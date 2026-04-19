/**
 * CSV export templates — Sprint 6 feature #3.
 *
 * HR can pick a preset template that matches the target HRIS
 * (SAP SuccessFactors, Workday, Oracle HCM) or author a custom template
 * saved per-tenant in `organization.settings_json.exportTemplates`.
 *
 * `evalSource(row, source)` walks a dot-path on the denormalized row and
 * returns a stringified value. The `columnSourcePaths` allowlist is
 * authoritative for both server validation and the UI dropdown.
 */
import {
  ExportTemplateSchema,
  type ExportTemplate,
} from '@skillforge/shared-types';

export { ExportTemplateSchema };
export type { ExportTemplate };

/**
 * The set of dot-paths a column `source` may reference. Anything outside
 * this allowlist is rejected server-side so tenants cannot exfiltrate
 * columns we haven't denormalized (or that don't exist).
 *
 * Keep in sync with `denormalizeAssessment` in export.service.ts and
 * with the UI dropdown on the templates page.
 */
export const columnSourcePaths = [
  'user.id',
  'user.name',
  'user.email',
  'user.roleFamily',
  'user.designation',
  'user.manager.name',
  'user.manager.email',
  'selfScore',
  'managerScore',
  'peerScore',
  'aiScore',
  'compositeScore',
  'status',
  'submittedAt',
  'finalizedAt',
  'managerRationale',
  'cycle.name',
  'cycle.endDate',
] as const;

export type ColumnSourcePath = (typeof columnSourcePaths)[number];

const SOURCE_SET = new Set<string>(columnSourcePaths);

export function isValidSource(source: string): source is ColumnSourcePath {
  return SOURCE_SET.has(source);
}

/**
 * Stringify a value pulled from a denormalized row. Mirrors the behavior
 * of the original hardcoded exporter: Dates become ISO strings, Prisma
 * Decimal (and anything with `toString`) becomes its canonical string,
 * and null/undefined become empty string.
 */
export function scoreToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    const s = (v as { toString(): string }).toString();
    // Guard against `[object Object]` from plain objects — evalSource should
    // never reach here for a container; but if it does, emit empty so the CSV
    // doesn't leak internal shapes.
    if (s === '[object Object]') return '';
    return s;
  }
  return String(v);
}

/**
 * Walk a dot-path through an arbitrary object and return the stringified
 * leaf. Missing branches short-circuit to empty string — we never throw.
 *
 * @example
 *   evalSource({ user: { id: 'u1' } }, 'user.id')         // 'u1'
 *   evalSource({ user: { manager: null } }, 'user.manager.name') // ''
 *   evalSource(row, 'selfScore')                          // '4.25'
 */
export function evalSource(row: unknown, source: string): string {
  if (!source) return '';
  const parts = source.split('.');
  let cur: unknown = row;
  for (const key of parts) {
    if (cur === null || cur === undefined) return '';
    if (typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[key];
  }
  return scoreToString(cur);
}

// ── Built-in templates ─────────────────────────────────────────────

/** The current 15-column CSV. Backwards-compatible default. */
const defaultTemplate: ExportTemplate = {
  id: 'default',
  name: 'SkillForge Default',
  builtin: true,
  columns: [
    { header: 'Employee ID', source: 'user.id' },
    { header: 'Employee Name', source: 'user.name' },
    { header: 'Email', source: 'user.email' },
    { header: 'Role Family', source: 'user.roleFamily' },
    { header: 'Designation', source: 'user.designation' },
    { header: 'Manager Name', source: 'user.manager.name' },
    { header: 'Self Score', source: 'selfScore' },
    { header: 'Manager Score', source: 'managerScore' },
    { header: 'Peer Score', source: 'peerScore' },
    { header: 'AI Score', source: 'aiScore' },
    { header: 'Composite Score', source: 'compositeScore' },
    { header: 'Status', source: 'status' },
    { header: 'Submitted At', source: 'submittedAt' },
    { header: 'Finalized At', source: 'finalizedAt' },
    { header: 'Manager Rationale', source: 'managerRationale' },
  ],
};

/** SAP SuccessFactors "User Data File" flavor. */
const sapTemplate: ExportTemplate = {
  id: 'sap-successfactors',
  name: 'SAP SuccessFactors',
  builtin: true,
  columns: [
    { header: 'User Id', source: 'user.id' },
    { header: 'User Name', source: 'user.name' },
    { header: 'Email', source: 'user.email' },
    { header: 'Manager User Id', source: 'user.manager.email' },
    { header: 'Custom01 (Score)', source: 'compositeScore' },
    { header: 'Performance Rating', source: 'managerScore' },
    { header: 'Review Status', source: 'status' },
  ],
};

/** Workday "Worker" import template. */
const workdayTemplate: ExportTemplate = {
  id: 'workday',
  name: 'Workday',
  builtin: true,
  columns: [
    { header: 'Worker Wid', source: 'user.id' },
    { header: 'Worker Full Legal Name', source: 'user.name' },
    { header: 'Email', source: 'user.email' },
    { header: 'Manager', source: 'user.manager.name' },
    { header: 'Calibration Score', source: 'managerScore' },
    { header: 'Composite Rating', source: 'compositeScore' },
    { header: 'Cycle Status', source: 'status' },
  ],
};

/** Oracle HCM Cloud performance template. */
const oracleTemplate: ExportTemplate = {
  id: 'oracle-hcm',
  name: 'Oracle HCM',
  builtin: true,
  columns: [
    { header: 'PersonNumber', source: 'user.id' },
    { header: 'DisplayName', source: 'user.name' },
    { header: 'WorkEmail', source: 'user.email' },
    { header: 'ManagerName', source: 'user.manager.name' },
    { header: 'OverallRating', source: 'compositeScore' },
    { header: 'Status', source: 'status' },
  ],
};

export const BUILTIN_TEMPLATES: readonly ExportTemplate[] = Object.freeze([
  defaultTemplate,
  sapTemplate,
  workdayTemplate,
  oracleTemplate,
]);

export const DEFAULT_TEMPLATE_ID = 'default';

/**
 * Merge the 4 built-ins with whatever the tenant has stored in
 * settings_json.exportTemplates. Custom templates can shadow builtins
 * by id (rare — the controller forbids overwriting builtins, but an
 * old tenant might have one from a migration).
 */
export function mergeTemplates(
  custom: readonly ExportTemplate[] | null | undefined,
): ExportTemplate[] {
  const byId = new Map<string, ExportTemplate>();
  for (const t of BUILTIN_TEMPLATES) byId.set(t.id, t);
  if (custom) {
    for (const t of custom) {
      // Never let a tenant flag a custom row as builtin — the server
      // decides which ids are built-in.
      const isBuiltin = BUILTIN_TEMPLATES.some((b) => b.id === t.id);
      byId.set(t.id, { ...t, builtin: isBuiltin });
    }
  }
  return Array.from(byId.values());
}

/**
 * Validate that every column in a template refers to an allowlisted source
 * path. Returns a list of bad paths; empty array means the template is safe
 * to persist.
 */
export function validateSources(template: ExportTemplate): string[] {
  const bad: string[] = [];
  for (const c of template.columns) {
    if (!isValidSource(c.source)) bad.push(c.source);
  }
  return bad;
}
