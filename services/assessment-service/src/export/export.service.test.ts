import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { TenantId } from '@skillforge/tenant-guard';

vi.mock('@skillforge/db', () => ({
  prisma: {},
  prismaAdmin: {},
}));

const withTenantMock = vi.fn();
vi.mock('@skillforge/tenant-guard', () => ({
  withTenant: (orgId: unknown, fn: (tx: unknown) => unknown) => withTenantMock(orgId, fn),
}));

import { ExportService, escapeCsvValue, slugify, CSV_HEADERS, BOM } from './export.service';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as TenantId;
const CYCLE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type TxDouble = {
  assessmentCycle: { findFirst: ReturnType<typeof vi.fn> };
  assessment: { findMany: ReturnType<typeof vi.fn> };
};

function makeTx(): TxDouble {
  return {
    assessmentCycle: { findFirst: vi.fn() },
    assessment: { findMany: vi.fn() },
  };
}

describe('escapeCsvValue()', () => {
  it('passes through a simple value unchanged', () => {
    expect(escapeCsvValue('hello')).toBe('hello');
  });

  it('wraps values containing commas', () => {
    expect(escapeCsvValue('hello, world')).toBe('"hello, world"');
  });

  it('wraps and doubles embedded double-quotes', () => {
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps values that contain newlines', () => {
    expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps values that contain carriage returns', () => {
    expect(escapeCsvValue('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('returns empty string for null and undefined', () => {
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(undefined)).toBe('');
  });

  it('serialises Date via ISO string', () => {
    const d = new Date('2026-05-20T10:30:00.000Z');
    expect(escapeCsvValue(d)).toBe('2026-05-20T10:30:00.000Z');
  });
});

describe('slugify()', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Q2 FY26 Cycle')).toBe('q2-fy26-cycle');
  });

  it('collapses runs of non-alphanumerics', () => {
    expect(slugify('Hello   ---   World')).toBe('hello-world');
  });

  it('falls back to "cycle" for all-punctuation input', () => {
    expect(slugify('!!!')).toBe('cycle');
  });
});

describe('ExportService.exportCycleCsv()', () => {
  let svc: ExportService;
  let tx: TxDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ExportService();
    tx = makeTx();
    withTenantMock.mockImplementation(async (_orgId, fn) => fn(tx));
  });

  it('throws NotFound when cycle is missing', async () => {
    tx.assessmentCycle.findFirst.mockResolvedValue(null);
    await expect(svc.exportCycleCsv(ORG_ID, CYCLE_ID)).rejects.toThrow(NotFoundException);
  });

  it('emits BOM as the first character of output', async () => {
    tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, name: 'Q2', org: { settingsJson: null } });
    tx.assessment.findMany.mockResolvedValue([]);
    const result = await svc.exportCycleCsv(ORG_ID, CYCLE_ID);
    expect(result.csv.charCodeAt(0)).toBe(0xfeff);
    expect(result.csv.startsWith(BOM)).toBe(true);
  });

  it('writes a header row matching CSV_HEADERS exactly', async () => {
    tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, name: 'Q2', org: { settingsJson: null } });
    tx.assessment.findMany.mockResolvedValue([]);
    const { csv } = await svc.exportCycleCsv(ORG_ID, CYCLE_ID);
    const firstLine = csv.slice(BOM.length).split('\r\n')[0];
    expect(firstLine).toBe(CSV_HEADERS.join(','));
  });

  it('generates one data row per assessment with correct columns', async () => {
    tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, name: 'Q2 FY26', org: { settingsJson: null } });
    tx.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        status: 'finalized',
        selfScore: '4.2',
        managerScore: '4.5',
        peerScore: '4.0',
        aiScore: '3.9',
        compositeScore: '4.3',
        submittedAt: new Date('2026-05-20T10:00:00.000Z'),
        finalizedAt: new Date('2026-05-25T10:00:00.000Z'),
        managerRationale: 'Strong quarter, ready for L5.',
        user: {
          id: 'u1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          roleFamily: 'Engineering',
          designation: 'Staff Engineer',
          manager: { id: 'm1', name: 'Grace Hopper' },
        },
      },
    ]);

    const { csv, rowCount, filename } = await svc.exportCycleCsv(ORG_ID, CYCLE_ID);
    expect(rowCount).toBe(1);

    const lines = csv.slice(BOM.length).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    const dataRow = lines[1];
    expect(
      dataRow.startsWith(
        'u1,Ada Lovelace,ada@example.com,Engineering,Staff Engineer,Grace Hopper,4.2,4.5,4.0,3.9,4.3,finalized,',
      ),
    ).toBe(true);
    expect(filename).toMatch(/^skillforge-cycle-q2-fy26-\d{8}\.csv$/);
  });

  it('escapes a comma in employee name by wrapping in quotes', async () => {
    tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, name: 'Q2', org: { settingsJson: null } });
    tx.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        status: 'finalized',
        selfScore: null,
        managerScore: null,
        peerScore: null,
        aiScore: null,
        compositeScore: null,
        submittedAt: null,
        finalizedAt: null,
        managerRationale: null,
        user: {
          id: 'u1',
          name: 'Lovelace, Ada',
          email: 'ada@example.com',
          roleFamily: 'Engineering',
          designation: 'Staff',
          manager: null,
        },
      },
    ]);

    const { csv } = await svc.exportCycleCsv(ORG_ID, CYCLE_ID);
    expect(csv).toContain('"Lovelace, Ada"');
  });
});
