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

import { StatsService } from './stats.service';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as TenantId;
const MANAGER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CYCLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type TxDouble = {
  user: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  assessment: { findMany: ReturnType<typeof vi.fn> };
  assessmentCycle: { findFirst: ReturnType<typeof vi.fn> };
};

function makeTx(): TxDouble {
  return {
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    assessment: { findMany: vi.fn() },
    assessmentCycle: { findFirst: vi.fn() },
  };
}

describe('StatsService', () => {
  let svc: StatsService;
  let tx: TxDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new StatsService();
    tx = makeTx();
    withTenantMock.mockImplementation(async (_orgId, fn) => fn(tx));
  });

  describe('managerTeamOverview()', () => {
    it('returns zeros when manager has no direct reports', async () => {
      tx.user.findMany.mockResolvedValue([]);
      const out = await svc.managerTeamOverview(ORG_ID, MANAGER_ID);
      expect(out.totalReports).toBe(0);
      expect(out.completionRate).toBe(0);
      expect(out.pendingReviews).toBe(0);
      expect(out.atRiskReports).toEqual([]);
    });

    it('computes completion rate correctly across mixed statuses', async () => {
      tx.user.findMany.mockResolvedValue([
        { id: 'u1', name: 'A' },
        { id: 'u2', name: 'B' },
        { id: 'u3', name: 'C' },
        { id: 'u4', name: 'D' },
      ]);
      const now = new Date();
      tx.assessment.findMany.mockResolvedValue([
        { user: { id: 'u1', name: 'A' }, cycle: { id: 'c', name: 'C', endDate: now, status: 'open' }, status: 'not_started', selfScore: null, managerScore: null, compositeScore: null, updatedAt: now },
        { user: { id: 'u2', name: 'B' }, cycle: { id: 'c', name: 'C', endDate: now, status: 'open' }, status: 'self_submitted', selfScore: 3, managerScore: null, compositeScore: null, updatedAt: now },
        { user: { id: 'u3', name: 'C' }, cycle: { id: 'c', name: 'C', endDate: now, status: 'open' }, status: 'composite_computed', selfScore: 4, managerScore: 4, compositeScore: 4, updatedAt: now },
        { user: { id: 'u4', name: 'D' }, cycle: { id: 'c', name: 'C', endDate: now, status: 'open' }, status: 'finalized', selfScore: 3.5, managerScore: 4, compositeScore: 3.9, updatedAt: now },
      ]);

      const out = await svc.managerTeamOverview(ORG_ID, MANAGER_ID);
      expect(out.totalReports).toBe(4);
      expect(out.completionRate).toBe(0.75);
      expect(out.pendingReviews).toBe(1);
      expect(out.byStatus).toEqual({
        not_started: 1,
        self_submitted: 1,
        composite_computed: 1,
        finalized: 1,
      });
    });

    it('hides cohort averages when fewer than 3 scored assessments', async () => {
      tx.user.findMany.mockResolvedValue([{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }]);
      const now = new Date();
      tx.assessment.findMany.mockResolvedValue([
        { user: { id: 'u1', name: 'A' }, cycle: { id: 'c', endDate: now, name: 'C', status: 'open' }, status: 'composite_computed', selfScore: 3, managerScore: 4, compositeScore: 3.8, updatedAt: now },
        { user: { id: 'u2', name: 'B' }, cycle: { id: 'c', endDate: now, name: 'C', status: 'open' }, status: 'composite_computed', selfScore: 3.5, managerScore: 4, compositeScore: 3.9, updatedAt: now },
      ]);
      const out = await svc.managerTeamOverview(ORG_ID, MANAGER_ID);
      expect(out.averageScores.self).toBeNull();
      expect(out.averageScores.manager).toBeNull();
      expect(out.averageScores.composite).toBeNull();
    });

    it('surfaces at-risk reports where cycle ends within 3 days and assessment is not_started', async () => {
      tx.user.findMany.mockResolvedValue([{ id: 'u1', name: 'A' }]);
      const in2days = new Date(Date.now() + 2 * 86400_000);
      tx.assessment.findMany.mockResolvedValue([
        { user: { id: 'u1', name: 'A' }, cycle: { id: 'c', endDate: in2days, name: 'C', status: 'open' }, status: 'not_started', selfScore: null, managerScore: null, compositeScore: null, updatedAt: new Date() },
      ]);
      const out = await svc.managerTeamOverview(ORG_ID, MANAGER_ID);
      expect(out.atRiskReports).toHaveLength(1);
      expect(out.atRiskReports[0].daysToDeadline).toBeLessThanOrEqual(3);
    });
  });

  describe('orgCompletion()', () => {
    it('throws NotFound when cycle is missing', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue(null);
      await expect(svc.orgCompletion(ORG_ID, CYCLE_ID)).rejects.toThrow(NotFoundException);
    });

    it('aggregates by role family and by manager correctly', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, name: 'Q2' });
      tx.assessment.findMany.mockResolvedValue([
        { status: 'not_started', user: { roleFamily: 'Engineering', managerId: 'm1', manager: { id: 'm1', name: 'Rahul' } } },
        { status: 'self_submitted', user: { roleFamily: 'Engineering', managerId: 'm1', manager: { id: 'm1', name: 'Rahul' } } },
        { status: 'finalized', user: { roleFamily: 'Design', managerId: 'm2', manager: { id: 'm2', name: 'Arjun' } } },
      ]);
      const out = await svc.orgCompletion(ORG_ID, CYCLE_ID);
      expect(out.total).toBe(3);
      expect(out.submitted).toBe(2);
      expect(out.byRoleFamily).toHaveLength(2);
      const eng = out.byRoleFamily.find((x) => x.roleFamily === 'Engineering');
      expect(eng?.total).toBe(2);
      expect(eng?.submitted).toBe(1);
      expect(eng?.rate).toBe(0.5);
    });
  });

  describe('scoreDistribution()', () => {
    it('returns zero-filled buckets when there are no scored assessments', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, name: 'Q2' });
      tx.assessment.findMany.mockResolvedValue([]);
      const out = await svc.scoreDistribution(ORG_ID, CYCLE_ID);
      expect(out.total).toBe(0);
      expect(out.mean).toBeNull();
      expect(out.buckets).toHaveLength(10);
      expect(out.buckets.every((b) => b.count === 0)).toBe(true);
    });

    it('buckets composite scores correctly and computes stats', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, name: 'Q2' });
      tx.assessment.findMany.mockResolvedValue([
        { compositeScore: 3.0, user: { roleFamily: 'Engineering' } },
        { compositeScore: 3.5, user: { roleFamily: 'Engineering' } },
        { compositeScore: 4.0, user: { roleFamily: 'Engineering' } },
        { compositeScore: 4.5, user: { roleFamily: 'Engineering' } },
      ]);
      const out = await svc.scoreDistribution(ORG_ID, CYCLE_ID);
      expect(out.total).toBe(4);
      expect(out.mean).toBe(3.75);
      expect(out.median).toBe(3.75);
      expect(out.stdDev).toBeGreaterThan(0);
      const bkt3_35 = out.buckets.find((b) => b.bucket === '3.0-3.5');
      expect(bkt3_35?.count).toBe(1);
    });
  });

  describe('employeeScorecard()', () => {
    it('throws NotFound when user is missing', async () => {
      tx.user.findFirst.mockResolvedValue(null);
      await expect(svc.employeeScorecard(ORG_ID, 'missing-user')).rejects.toThrow(NotFoundException);
    });

    it('returns history with current cycle separated out', async () => {
      tx.user.findFirst.mockResolvedValue({
        id: 'u1',
        name: 'Alice',
        roleFamily: 'Engineering',
        designation: 'Senior Engineer',
      });
      tx.assessment.findMany.mockResolvedValue([
        {
          cycle: {
            id: 'curr',
            name: 'Q2',
            startDate: new Date('2026-04-01'),
            endDate: new Date('2026-05-31'),
            frameworkId: 'f',
            framework: {
              maturityLevelsJson: [{ level: 1, name: 'A', description: 'a' }],
              roleMappings: [],
            },
          },
          status: 'self_submitted',
          selfScore: 3,
          managerScore: null,
          peerScore: null,
          aiScore: null,
          compositeScore: null,
          responsesJson: null,
        },
        {
          cycle: {
            id: 'prev',
            name: 'Q1',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-03-31'),
            frameworkId: 'f',
            framework: { maturityLevelsJson: [], roleMappings: [] },
          },
          status: 'finalized',
          selfScore: 3,
          managerScore: 4,
          peerScore: null,
          aiScore: null,
          compositeScore: 3.8,
          responsesJson: null,
        },
      ]);
      const out = await svc.employeeScorecard(ORG_ID, 'u1');
      expect(out.currentCycle?.cycleName).toBe('Q2');
      expect(out.history).toHaveLength(1);
      expect(out.history[0].cycleName).toBe('Q1');
      expect(out.history[0].compositeScore).toBe(3.8);
    });
  });
});
