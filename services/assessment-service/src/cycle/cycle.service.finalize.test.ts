import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TenantId } from '@skillforge/tenant-guard';

const auditCreateMock = vi.fn();
vi.mock('@skillforge/db', () => ({
  prisma: {},
  prismaAdmin: { auditLog: { create: (...args: unknown[]) => auditCreateMock(...args) } },
}));

const withTenantMock = vi.fn();
vi.mock('@skillforge/tenant-guard', () => ({
  withTenant: (orgId: unknown, fn: (tx: unknown) => unknown) => withTenantMock(orgId, fn),
}));

import { CycleService } from './cycle.service';

const ORG_ID = '11111111-1111-4111-8111-111111111111' as TenantId;
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const CYCLE_ID = '33333333-3333-4333-8333-333333333333';
const ASSESSMENT_ID = '44444444-4444-4444-8444-444444444444';

type TxDouble = {
  assessmentCycle: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  assessment: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

function makeTx(): TxDouble {
  return {
    assessmentCycle: { findFirst: vi.fn(), update: vi.fn() },
    assessment: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  };
}

describe('CycleService — finalize methods', () => {
  let svc: CycleService;
  let tx: TxDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new CycleService();
    tx = makeTx();
    withTenantMock.mockImplementation(async (_orgId, fn) => fn(tx));
  });

  describe('finalizeAssessment()', () => {
    it('rejects when cycle.status !== "locked"', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'open' });
      await expect(
        svc.finalizeAssessment(ORG_ID, CYCLE_ID, ASSESSMENT_ID, ACTOR_ID),
      ).rejects.toThrow(/locked cycle/);
      expect(auditCreateMock).not.toHaveBeenCalled();
    });

    it('rejects when assessment.status !== "composite_computed"', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        cycleId: CYCLE_ID,
        status: 'self_submitted',
      });
      await expect(
        svc.finalizeAssessment(ORG_ID, CYCLE_ID, ASSESSMENT_ID, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when cycle is missing', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue(null);
      await expect(
        svc.finalizeAssessment(ORG_ID, CYCLE_ID, ASSESSMENT_ID, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when assessment is missing', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessment.findFirst.mockResolvedValue(null);
      await expect(
        svc.finalizeAssessment(ORG_ID, CYCLE_ID, ASSESSMENT_ID, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets status="finalized" + finalizedAt and writes the audit row', async () => {
      const finalizedAt = new Date('2026-05-28T12:00:00.000Z');
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        cycleId: CYCLE_ID,
        status: 'composite_computed',
      });
      tx.assessment.update.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'finalized',
        finalizedAt,
      });

      const result = await svc.finalizeAssessment(ORG_ID, CYCLE_ID, ASSESSMENT_ID, ACTOR_ID);

      expect(tx.assessment.update).toHaveBeenCalledWith({
        where: { id: ASSESSMENT_ID },
        data: expect.objectContaining({ status: 'finalized' }),
      });
      expect(auditCreateMock).toHaveBeenCalledTimes(1);
      const auditArg = auditCreateMock.mock.calls[0][0];
      expect(auditArg.data).toMatchObject({
        orgId: ORG_ID,
        actorId: ACTOR_ID,
        action: 'assessment.finalized',
        entityType: 'assessment',
        entityId: ASSESSMENT_ID,
      });
      expect(result.status).toBe('finalized');
    });
  });

  describe('bulkFinalize()', () => {
    it('rejects when cycle.status !== "locked"', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'open' });
      await expect(svc.bulkFinalize(ORG_ID, CYCLE_ID, ACTOR_ID)).rejects.toThrow(
        /locked cycle/,
      );
      expect(tx.assessment.updateMany).not.toHaveBeenCalled();
    });

    it('only targets composite_computed rows and returns the Prisma count', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessment.updateMany.mockResolvedValue({ count: 7 });

      const result = await svc.bulkFinalize(ORG_ID, CYCLE_ID, ACTOR_ID);

      expect(tx.assessment.updateMany).toHaveBeenCalledWith({
        where: { cycleId: CYCLE_ID, status: 'composite_computed' },
        data: expect.objectContaining({ status: 'finalized' }),
      });
      expect(result).toEqual({ finalizedCount: 7 });
      expect(auditCreateMock.mock.calls[0][0].data).toMatchObject({
        action: 'cycle.bulk_finalized',
        entityId: CYCLE_ID,
        newValue: { finalizedCount: 7 },
      });
    });

    it('returns finalizedCount: 0 when nothing is ready', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessment.updateMany.mockResolvedValue({ count: 0 });
      const result = await svc.bulkFinalize(ORG_ID, CYCLE_ID, ACTOR_ID);
      expect(result.finalizedCount).toBe(0);
    });
  });

  describe('closeCycle()', () => {
    it('runs bulkFinalize then transitions to "closed"', async () => {
      tx.assessmentCycle.findFirst.mockResolvedValue({ id: CYCLE_ID, status: 'locked' });
      tx.assessment.updateMany.mockResolvedValue({ count: 3 });
      tx.assessmentCycle.update.mockResolvedValue({ id: CYCLE_ID, status: 'closed' });

      const result = await svc.closeCycle(ORG_ID, CYCLE_ID, ACTOR_ID);

      expect(tx.assessment.updateMany).toHaveBeenCalled();
      expect(tx.assessmentCycle.update).toHaveBeenCalledWith({
        where: { id: CYCLE_ID },
        data: expect.objectContaining({ status: 'closed' }),
      });
      expect(result).toEqual({ id: CYCLE_ID, status: 'closed' });

      const actions = auditCreateMock.mock.calls.map((c) => c[0].data.action);
      expect(actions).toContain('cycle.bulk_finalized');
      expect(actions).toContain('cycle.closed');
    });
  });
});
