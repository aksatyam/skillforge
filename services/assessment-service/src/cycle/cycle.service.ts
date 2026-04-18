import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CycleStatus, prismaAdmin } from '@skillforge/db';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import type { CreateCycleDto } from '@skillforge/shared-types';

/**
 * Cycle lifecycle state machine (Sprint 2 feature #7):
 *
 *   draft   → open      (activate — materializes Assessment rows for every employee)
 *   open    → locked    (lock — stop accepting new input, scores are frozen for review)
 *   locked  → closed    (finalize — exports to appraisal; terminal)
 *   locked  → open      (unlock — audit-logged; only if no assessments have been finalized)
 *   closed  → (terminal, no transitions)
 *
 * Draft cycles can be deleted; open+locked cycles cannot.
 */
const TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  draft: ['open'],
  open: ['locked'],
  locked: ['closed', 'open'],
  closed: [],
};

@Injectable()
export class CycleService {
  async list(orgId: TenantId) {
    return withTenant(orgId, (tx) =>
      tx.assessmentCycle.findMany({
        where: { deletedAt: null },
        include: {
          framework: { select: { name: true, status: true } },
          _count: { select: { assessments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async get(orgId: TenantId, id: string) {
    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id, deletedAt: null },
        include: {
          framework: true,
          _count: { select: { assessments: true } },
        },
      });
      if (!cycle) throw new NotFoundException();
      return cycle;
    });
  }

  async create(orgId: TenantId, actorId: string, dto: CreateCycleDto) {
    if (dto.endDate <= dto.startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return withTenant(orgId, async (tx) => {
      const fw = await tx.competencyFramework.findFirst({
        where: { id: dto.frameworkId, deletedAt: null },
      });
      if (!fw) throw new BadRequestException('frameworkId does not exist in this org');
      if (fw.status !== 'active') {
        throw new BadRequestException('Framework must be active to use in a cycle');
      }
      return tx.assessmentCycle.create({
        data: {
          orgId,
          frameworkId: dto.frameworkId,
          name: dto.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status: 'draft',
          createdById: actorId,
        },
      });
    });
  }

  /**
   * Activate a draft cycle. Materializes an `Assessment` row for every
   * active, non-admin employee in the tenant so they appear on the
   * manager roster and self-assessment lists immediately.
   *
   * Idempotent: re-running on an already-open cycle is a no-op.
   */
  async activate(orgId: TenantId, cycleId: string) {
    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
      });
      if (!cycle) throw new NotFoundException();
      if (cycle.status !== 'draft') {
        throw new BadRequestException(`Cannot activate — status is ${cycle.status}`);
      }

      // Ensure at least one more eligible user exists before opening
      const employees = await tx.user.findMany({
        where: {
          deletedAt: null,
          role: { in: ['employee', 'manager', 'ai_champion', 'leadership'] },
        },
        select: { id: true },
      });
      if (employees.length === 0) {
        throw new BadRequestException(
          'Cannot activate cycle — no eligible users in the tenant',
        );
      }

      // Materialize one Assessment per user (createMany with skipDuplicates
      // so re-activation doesn't fail on the cycle_id + user_id unique index)
      await tx.assessment.createMany({
        data: employees.map((u) => ({
          cycleId,
          userId: u.id,
          status: 'not_started' as const,
        })),
        skipDuplicates: true,
      });

      return tx.assessmentCycle.update({
        where: { id: cycleId },
        data: { status: 'open' },
      });
    });
  }

  async transition(orgId: TenantId, cycleId: string, to: CycleStatus) {
    // `open` requires materialization — route through activate()
    if (to === 'open') {
      return this.activate(orgId, cycleId);
    }

    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
      });
      if (!cycle) throw new NotFoundException();
      if (!TRANSITIONS[cycle.status].includes(to)) {
        throw new BadRequestException(`Invalid transition: ${cycle.status} → ${to}`);
      }

      // Prevent unlock if any assessments are already finalized
      if (cycle.status === 'locked' && to === 'open') {
        const finalized = await tx.assessment.count({
          where: { cycleId, status: 'finalized' },
        });
        if (finalized > 0) {
          throw new BadRequestException(
            `Cannot unlock — ${finalized} assessment(s) already finalized`,
          );
        }
      }

      const updated = await tx.assessmentCycle.update({
        where: { id: cycleId },
        data: {
          status: to,
          ...(to === 'closed' ? {} : {}),
        },
      });

      // When closing, finalize any assessments that reached composite_computed
      if (to === 'closed') {
        await tx.assessment.updateMany({
          where: { cycleId, status: 'composite_computed' },
          data: { status: 'finalized', finalizedAt: new Date() },
        });
      }

      return updated;
    });
  }

  async getProgress(orgId: TenantId, cycleId: string) {
    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
      });
      if (!cycle) throw new NotFoundException();

      const byStatus = await tx.assessment.groupBy({
        by: ['status'],
        where: { cycleId },
        _count: { _all: true },
      });

      const total = byStatus.reduce((sum, b) => sum + b._count._all, 0);
      const submitted = byStatus
        .filter((b) =>
          ['self_submitted', 'manager_in_progress', 'peer_submitted', 'ai_analyzed', 'manager_scored', 'composite_computed', 'finalized'].includes(b.status),
        )
        .reduce((sum, b) => sum + b._count._all, 0);

      return {
        cycleId,
        total,
        submitted,
        completionRate: total > 0 ? +(submitted / total).toFixed(3) : 0,
        byStatus: byStatus.reduce(
          (acc, b) => ({ ...acc, [b.status]: b._count._all }),
          {} as Record<string, number>,
        ),
      };
    });
  }

  // ── Sprint 3 Feature #16 — Finalize + close ────────────────────

  /**
   * Finalize a single assessment inside a locked cycle.
   *
   * Preconditions:
   *   - cycle.status === 'locked'   (else 400)
   *   - assessment.status === 'composite_computed'   (else 400)
   *
   * Writes an explicit `assessment.finalized` audit row via prismaAdmin
   * so the business event survives even if RLS resets mid-request.
   */
  async finalizeAssessment(
    orgId: TenantId,
    cycleId: string,
    assessmentId: string,
    actorId: string,
  ) {
    const updated = await withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
      });
      if (!cycle) throw new NotFoundException();
      if (cycle.status !== 'locked') {
        throw new BadRequestException(
          'can only finalize assessments in a locked cycle',
        );
      }

      const a = await tx.assessment.findFirst({
        where: { id: assessmentId, cycleId, deletedAt: null },
      });
      if (!a) throw new NotFoundException();
      if (a.status !== 'composite_computed') {
        throw new BadRequestException(
          `cannot finalize assessment in status: ${a.status} (expected composite_computed)`,
        );
      }

      return tx.assessment.update({
        where: { id: assessmentId },
        data: { status: 'finalized', finalizedAt: new Date() },
      });
    });

    await prismaAdmin.auditLog.create({
      data: {
        orgId,
        actorId,
        action: 'assessment.finalized',
        entityType: 'assessment',
        entityId: assessmentId,
        newValue: { status: 'finalized', finalizedAt: updated.finalizedAt },
      },
    });

    return updated;
  }

  /**
   * Bulk-finalize every `composite_computed` assessment in a locked cycle.
   * Writes ONE summary audit row; per-row audit is left to finalizeAssessment().
   */
  async bulkFinalize(orgId: TenantId, cycleId: string, actorId: string) {
    const result = await withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
      });
      if (!cycle) throw new NotFoundException();
      if (cycle.status !== 'locked') {
        throw new BadRequestException(
          'can only bulk-finalize assessments in a locked cycle',
        );
      }

      const res = await tx.assessment.updateMany({
        where: { cycleId, status: 'composite_computed' },
        data: { status: 'finalized', finalizedAt: new Date() },
      });
      return { finalizedCount: res.count };
    });

    await prismaAdmin.auditLog.create({
      data: {
        orgId,
        actorId,
        action: 'cycle.bulk_finalized',
        entityType: 'cycle',
        entityId: cycleId,
        newValue: { finalizedCount: result.finalizedCount },
      },
    });

    return result;
  }

  /**
   * Safer wrapper over transition(cycleId, 'closed') — explicitly runs
   * bulkFinalize first, so every composite_computed row is flipped to
   * `finalized` as an audited step.
   */
  async closeCycle(orgId: TenantId, cycleId: string, actorId: string) {
    await this.bulkFinalize(orgId, cycleId, actorId);
    const updated = await this.transition(orgId, cycleId, 'closed');

    await prismaAdmin.auditLog.create({
      data: {
        orgId,
        actorId,
        action: 'cycle.closed',
        entityType: 'cycle',
        entityId: cycleId,
        newValue: { status: 'closed' },
      },
    });

    return updated;
  }
}
