import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TenantId } from '@skillforge/tenant-guard';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('@skillforge/db', () => ({
  prisma: {},
  prismaAdmin: {},
}));

const withTenantMock = vi.fn();
vi.mock('@skillforge/tenant-guard', () => ({
  withTenant: (orgId: unknown, fn: (tx: unknown) => unknown) => withTenantMock(orgId, fn),
}));

// Import AFTER mocks
import { CycleService } from './cycle.service';

// ── Helpers ──────────────────────────────────────────────────────────
const ORG_ID = '11111111-1111-4111-8111-111111111111' as TenantId;
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const CYCLE_ID = '33333333-3333-4333-8333-333333333333';
const FRAMEWORK_ID = '44444444-4444-4444-8444-444444444444';

type TxDouble = {
  assessmentCycle: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  competencyFramework: { findFirst: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
  assessment: {
    createMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
};

function makeTx(): TxDouble {
  return {
    assessmentCycle: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    competencyFramework: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
    assessment: {
      createMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
  };
}

describe('CycleService', () => {
  let svc: CycleService;
  let tx: TxDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new CycleService();
    tx = makeTx();
    withTenantMock.mockImplementation(async (_orgId, fn) => fn(tx));
  });

  describe('create()', () => {
    it('rejects when endDate <= startDate', async () => {
      const start = new Date('2026-05-01');
      const end = new Date('2026-05-01');
      await expect(
        svc.create(ORG_ID, ACTOR_ID, {
          name: 'Q2',
          frameworkId: FRAMEWORK_ID,
          startDate: start,
          endDate: end,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when framework.status !== "active"', async () => {
      tx.competencyFramework.findFirst.mockResolvedValue({
        id: FRAMEWORK_ID,
        status: 'draft',
      });
      await expect(
        svc.create(ORG_ID, ACTOR_ID, {
          name: 'Q2',
          frameworkId: FRAMEWORK_ID,
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-06-30'),
        }),
      ).rejects.toThrow(/Framework must be active/);
    });
  });

  describe('activate()', () => {
    it('creates assessment rows for all eligible users via createMany with skipDuplicates', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'draft' });
      tx.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]);
      tx.assessment.createMany.mockResolvedValue({ count: 3 });
      tx.assessmentCycle.update.mockResolvedValue({ id: CYCLE_ID, status: 'open' });

      await svc.activate(ORG_ID, CYCLE_ID);

      expect(tx.assessment.createMany).toHaveBeenCalledTimes(1);
      const arg = tx.assessment.createMany.mock.calls[0][0];
      expect(arg.skipDuplicates).toBe(true);
      expect(arg.data).toHaveLength(3);
      expect(arg.data[0]).toEqual({ cycleId: CYCLE_ID, userId: 'u1', status: 'not_started' });
      expect(tx.assessmentCycle.update).toHaveBeenCalledWith({
        where: { id: CYCLE_ID },
        data: { status: 'open' },
      });
    });

    it('rejects when cycle.status !== "draft"', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'open' });
      await expect(svc.activate(ORG_ID, CYCLE_ID)).rejects.toThrow(/Cannot activate/);
    });

    it('throws NotFound when cycle is missing', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue(null);
      await expect(svc.activate(ORG_ID, CYCLE_ID)).rejects.toThrow(NotFoundException);
    });

    it('is idempotent when called twice — skipDuplicates prevents unique-violation', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'draft' });
      tx.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
      // createMany returns count=0 second time because all rows already exist
      tx.assessment.createMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });
      tx.assessmentCycle.update.mockResolvedValue({ id: CYCLE_ID, status: 'open' });

      await svc.activate(ORG_ID, CYCLE_ID);
      await svc.activate(ORG_ID, CYCLE_ID);

      expect(tx.assessment.createMany).toHaveBeenCalledTimes(2);
      for (const call of tx.assessment.createMany.mock.calls) {
        expect(call[0].skipDuplicates).toBe(true);
      }
    });

    it('rejects when there are zero eligible users', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'draft' });
      tx.user.findMany.mockResolvedValue([]);
      await expect(svc.activate(ORG_ID, CYCLE_ID)).rejects.toThrow(/no eligible users/);
    });
  });

  describe('transition()', () => {
    it('rejects illegal transitions (draft → closed)', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'draft' });
      await expect(svc.transition(ORG_ID, CYCLE_ID, 'closed')).rejects.toThrow(/Invalid transition/);
    });

    it('transitioning to "closed" also updates composite_computed assessments to finalized', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessmentCycle.update.mockResolvedValue({ id: CYCLE_ID, status: 'closed' });
      tx.assessment.updateMany.mockResolvedValue({ count: 5 });

      await svc.transition(ORG_ID, CYCLE_ID, 'closed');

      expect(tx.assessment.updateMany).toHaveBeenCalledWith({
        where: { cycleId: CYCLE_ID, status: 'composite_computed' },
        data: expect.objectContaining({ status: 'finalized' }),
      });
      const dataArg = tx.assessment.updateMany.mock.calls[0][0].data;
      expect(dataArg.finalizedAt).toBeInstanceOf(Date);
    });

    it('transitioning from locked → open rejects when any assessment is already finalized', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessment.count.mockResolvedValue(2);
      // `transition(to='open')` on a locked cycle takes the unlock branch
      // (post-Sprint-3 fix: activate() guards on draft-only, so the router
      // doesn't short-circuit locked → open through it). The unlock branch
      // refuses when any assessment has been finalized, since reopening
      // would let a manager overwrite a signed score.
      await expect(svc.transition(ORG_ID, CYCLE_ID, 'open')).rejects.toThrow(
        /Cannot unlock.*finalized/,
      );
    });

    it('transitions locked → closed happy path returns the updated cycle', async () => {
      const updated = { id: CYCLE_ID, status: 'closed' };
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessmentCycle.update.mockResolvedValue(updated);
      tx.assessment.updateMany.mockResolvedValue({ count: 0 });

      const result = await svc.transition(ORG_ID, CYCLE_ID, 'closed');
      expect(result).toBe(updated);
    });

    it('throws NotFound when cycle does not exist during transition', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue(null);
      await expect(svc.transition(ORG_ID, CYCLE_ID, 'locked')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProgress()', () => {
    it('returns completionRate of 0.3 when 3 of 10 are submitted', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID });
      tx.assessment.groupBy.mockResolvedValue([
        { status: 'not_started', _count: { _all: 7 } },
        { status: 'self_submitted', _count: { _all: 2 } },
        { status: 'finalized', _count: { _all: 1 } },
      ]);

      const result = await svc.getProgress(ORG_ID, CYCLE_ID);
      expect(result.total).toBe(10);
      expect(result.submitted).toBe(3);
      expect(result.completionRate).toBe(0.3);
      expect(result.byStatus).toEqual({ not_started: 7, self_submitted: 2, finalized: 1 });
    });

    it('returns 0 completionRate when there are no assessments', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID });
      tx.assessment.groupBy.mockResolvedValue([]);
      const result = await svc.getProgress(ORG_ID, CYCLE_ID);
      expect(result.total).toBe(0);
      expect(result.completionRate).toBe(0);
    });
  });
});
