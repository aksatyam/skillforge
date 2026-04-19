import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import {
  ExportTemplateSchema,
  type ExportTemplate,
} from '@skillforge/shared-types';

import {
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  evalSource,
  mergeTemplates,
  validateSources,
} from './export.templates';

/**
 * RFC 4180 CSV field escape.
 *
 * Quotes are needed when the value contains a comma, a double-quote, or
 * a newline. Inside a quoted field, a literal double-quote is represented
 * by two double-quotes in a row.
 *
 * Exported so unit tests can exercise edge cases directly.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Legacy fixed headers — kept exported so existing tests and downstream
 * tooling that imports this constant keep working. The live default
 * template matches these headers exactly.
 */
export const CSV_HEADERS = [
  'Employee ID',
  'Employee Name',
  'Email',
  'Role Family',
  'Designation',
  'Manager Name',
  'Self Score',
  'Manager Score',
  'Peer Score',
  'AI Score',
  'Composite Score',
  'Status',
  'Submitted At',
  'Finalized At',
  'Manager Rationale',
] as const;

/** UTF-8 BOM so Excel opens accented characters without mangling them. */
export const BOM = '\uFEFF';

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'cycle';
}

function formatDate(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// ── Settings helpers ────────────────────────────────────────────────

type OrgSettingsShape = {
  exportTemplates?: unknown;
  defaultExportTemplate?: unknown;
};

/**
 * Parse the tenant's custom templates out of settings_json, dropping any
 * entry that fails schema validation so one bad row doesn't wedge the UI.
 */
export function parseCustomTemplates(settingsJson: unknown): ExportTemplate[] {
  const raw = (settingsJson as OrgSettingsShape | null)?.exportTemplates;
  if (!Array.isArray(raw)) return [];
  const out: ExportTemplate[] = [];
  for (const entry of raw) {
    const parsed = ExportTemplateSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Resolve the tenant's configured default template id (falling back safely). */
export function resolveDefaultTemplateId(settingsJson: unknown): string {
  const raw = (settingsJson as OrgSettingsShape | null)?.defaultExportTemplate;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return DEFAULT_TEMPLATE_ID;
}

/** Denormalize an assessment row into the shape evalSource walks. */
function denormalizeAssessment(
  a: {
    status: string;
    selfScore: unknown;
    managerScore: unknown;
    peerScore: unknown;
    aiScore: unknown;
    compositeScore: unknown;
    submittedAt: Date | null;
    finalizedAt: Date | null;
    managerRationale: string | null;
    user: {
      id: string;
      name: string;
      email: string;
      roleFamily: string;
      designation: string;
      manager: { id: string; name: string; email: string } | null;
    };
  },
  cycle: { name: string; endDate: Date | null },
) {
  return {
    user: {
      id: a.user.id,
      name: a.user.name,
      email: a.user.email,
      roleFamily: a.user.roleFamily,
      designation: a.user.designation,
      manager: a.user.manager
        ? { name: a.user.manager.name, email: a.user.manager.email }
        : null,
    },
    selfScore: a.selfScore,
    managerScore: a.managerScore,
    peerScore: a.peerScore,
    aiScore: a.aiScore,
    compositeScore: a.compositeScore,
    status: a.status,
    submittedAt: a.submittedAt,
    finalizedAt: a.finalizedAt,
    managerRationale: a.managerRationale ?? '',
    cycle: {
      name: cycle.name,
      endDate: cycle.endDate,
    },
  };
}

/**
 * Legacy 15-column renderer — kept for the fallback path when no template
 * is found. Behaviorally identical to the pre-template exporter.
 */
function renderLegacyRow(row: ReturnType<typeof denormalizeAssessment>): string[] {
  return [
    row.user.id,
    row.user.name,
    row.user.email,
    row.user.roleFamily,
    row.user.designation,
    row.user.manager?.name ?? '',
    evalSource(row, 'selfScore'),
    evalSource(row, 'managerScore'),
    evalSource(row, 'peerScore'),
    evalSource(row, 'aiScore'),
    evalSource(row, 'compositeScore'),
    row.status,
    row.submittedAt ? row.submittedAt.toISOString() : '',
    row.finalizedAt ? row.finalizedAt.toISOString() : '',
    row.managerRationale ?? '',
  ];
}

@Injectable()
export class ExportService {
  /**
   * Stream a cycle's assessments as CSV, honoring the tenant's selected
   * template. When `templateId` is omitted, the tenant's configured default
   * (or SkillForge Default) is used — backwards compatible.
   */
  async exportCycleCsv(
    orgId: TenantId,
    cycleId: string,
    templateId?: string,
  ): Promise<{ filename: string; csv: string; rowCount: number }> {
    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
        select: {
          id: true,
          name: true,
          endDate: true,
          org: { select: { settingsJson: true } },
        },
      });
      if (!cycle) throw new NotFoundException();

      const assessments = await tx.assessment.findMany({
        where: { cycleId, deletedAt: null },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              roleFamily: true,
              designation: true,
              manager: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: [{ user: { name: 'asc' } }],
      });

      // Resolve the active template: caller pick → tenant default → builtin.
      const customTemplates = parseCustomTemplates(cycle.org.settingsJson);
      const templates = mergeTemplates(customTemplates);
      const defaultId = resolveDefaultTemplateId(cycle.org.settingsJson);
      const requestedId = templateId && templateId.length > 0 ? templateId : defaultId;
      const template = templates.find((t) => t.id === requestedId) ?? null;

      const lines: string[] = [];

      if (!template) {
        // Fallback: legacy 15-column renderer, byte-identical to pre-refactor.
        lines.push(CSV_HEADERS.map(escapeCsvValue).join(','));
        for (const a of assessments) {
          const row = denormalizeAssessment(a, cycle);
          lines.push(renderLegacyRow(row).map(escapeCsvValue).join(','));
        }
      } else {
        // Template-driven renderer.
        lines.push(template.columns.map((c) => escapeCsvValue(c.header)).join(','));
        for (const a of assessments) {
          const row = denormalizeAssessment(a, cycle);
          const values = template.columns.map((c) => evalSource(row, c.source));
          lines.push(values.map(escapeCsvValue).join(','));
        }
      }

      // CRLF per RFC 4180 SHOULD, and what Excel expects.
      const csv = BOM + lines.join('\r\n') + '\r\n';
      const filename = `skillforge-cycle-${slugify(cycle.name)}-${formatDate()}.csv`;

      return { filename, csv, rowCount: assessments.length };
    });
  }

  // ── Template CRUD ──────────────────────────────────────────────────

  /**
   * List the full catalog (built-ins + tenant-custom) visible to HR.
   * Order: built-ins first (stable), then custom in insertion order.
   */
  async listTemplates(orgId: TenantId): Promise<ExportTemplate[]> {
    return withTenant(orgId, async (tx) => {
      const org = await tx.organization.findFirst({
        where: { id: orgId, deletedAt: null },
        select: { settingsJson: true },
      });
      const custom = parseCustomTemplates(org?.settingsJson ?? null);
      return mergeTemplates(custom);
    });
  }

  /**
   * Create or update a custom template. Rejects overwrites of built-ins
   * (by id) and templates referencing non-allowlisted source paths.
   */
  async upsertTemplate(
    orgId: TenantId,
    templateId: string,
    incoming: ExportTemplate,
  ): Promise<ExportTemplate> {
    // Guard: can't overwrite a built-in.
    if (BUILTIN_TEMPLATES.some((b) => b.id === templateId)) {
      throw new BadRequestException(
        `Cannot overwrite built-in template "${templateId}"`,
      );
    }
    if (incoming.id !== templateId) {
      throw new BadRequestException('URL id and body id must match');
    }
    // Strip any attempt to set builtin=true from the wire.
    const sanitized: ExportTemplate = { ...incoming, builtin: false };

    const badSources = validateSources(sanitized);
    if (badSources.length > 0) {
      throw new BadRequestException(
        `Invalid column source(s): ${badSources.join(', ')}`,
      );
    }

    return withTenant(orgId, async (tx) => {
      const org = await tx.organization.findFirst({
        where: { id: orgId, deletedAt: null },
        select: { settingsJson: true },
      });
      if (!org) throw new NotFoundException('Organization not found');

      const existing = parseCustomTemplates(org.settingsJson);
      const idx = existing.findIndex((t) => t.id === templateId);
      if (idx >= 0) existing[idx] = sanitized;
      else existing.push(sanitized);

      const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
      const nextSettings = { ...settings, exportTemplates: existing };

      await tx.organization.update({
        where: { id: orgId },
        data: { settingsJson: nextSettings as object },
      });

      return sanitized;
    });
  }

  /**
   * Remove a custom template. Built-ins cannot be deleted — silent no-op
   * would mask bugs, so we return 400.
   */
  async deleteTemplate(orgId: TenantId, templateId: string): Promise<void> {
    if (BUILTIN_TEMPLATES.some((b) => b.id === templateId)) {
      throw new BadRequestException(
        `Cannot delete built-in template "${templateId}"`,
      );
    }

    await withTenant(orgId, async (tx) => {
      const org = await tx.organization.findFirst({
        where: { id: orgId, deletedAt: null },
        select: { settingsJson: true },
      });
      if (!org) throw new NotFoundException('Organization not found');

      const existing = parseCustomTemplates(org.settingsJson);
      const next = existing.filter((t) => t.id !== templateId);
      if (next.length === existing.length) {
        throw new NotFoundException(`Template "${templateId}" not found`);
      }

      const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
      const nextSettings = { ...settings, exportTemplates: next };

      await tx.organization.update({
        where: { id: orgId },
        data: { settingsJson: nextSettings as object },
      });
    });
  }
}
