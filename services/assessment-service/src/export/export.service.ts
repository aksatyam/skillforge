import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';

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
 * Column order is part of the public contract — HR diffs this CSV against
 * the appraisal system's import template. Do NOT reorder without coordinating
 * with HR.
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

function scoreToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    return (v as { toString(): string }).toString();
  }
  return String(v);
}

@Injectable()
export class ExportService {
  async exportCycleCsv(
    orgId: TenantId,
    cycleId: string,
  ): Promise<{ filename: string; csv: string; rowCount: number }> {
    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
        select: { id: true, name: true },
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
              manager: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ user: { name: 'asc' } }],
      });

      const lines: string[] = [];
      lines.push(CSV_HEADERS.map(escapeCsvValue).join(','));

      for (const a of assessments) {
        const row = [
          a.user.id,
          a.user.name,
          a.user.email,
          a.user.roleFamily,
          a.user.designation,
          a.user.manager?.name ?? '',
          scoreToString(a.selfScore),
          scoreToString(a.managerScore),
          scoreToString(a.peerScore),
          scoreToString(a.aiScore),
          scoreToString(a.compositeScore),
          a.status,
          a.submittedAt ? a.submittedAt.toISOString() : '',
          a.finalizedAt ? a.finalizedAt.toISOString() : '',
          a.managerRationale ?? '',
        ];
        lines.push(row.map(escapeCsvValue).join(','));
      }

      // CRLF per RFC 4180 SHOULD, and what Excel expects.
      const csv = BOM + lines.join('\r\n') + '\r\n';
      const filename = `skillforge-cycle-${slugify(cycle.name)}-${formatDate()}.csv`;

      return { filename, csv, rowCount: assessments.length };
    });
  }
}
