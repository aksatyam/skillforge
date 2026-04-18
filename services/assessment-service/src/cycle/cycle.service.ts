import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CycleStatus } from '@skillforge/db';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import type { CreateCycleDto } from '@skillforge/shared-types';

/**
 * Valid state transitions (see plan §7.4 + assessment workflow skill):
 *   draft  → open
 *   open   → locked
 *   locked → closed | open  (unlock requires audit log)
 *   closed → (terminal)
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
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async create(orgId: TenantId, actorId: string, dto: CreateCycleDto) {
    if (dto.endDate <= dto.startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return withTenant(orgId, (tx) =>
      tx.assessmentCycle.create({
        data: {
          orgId,
          frameworkId: dto.frameworkId,
          name: dto.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status: 'draft',
          createdById: actorId,
        },
      }),
    );
  }

  async transition(orgId: TenantId, cycleId: string, to: CycleStatus) {
    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findUnique({ where: { id: cycleId } });
      if (!cycle) throw new NotFoundException();
      if (!TRANSITIONS[cycle.status].includes(to)) {
        throw new BadRequestException(
          `Invalid transition: ${cycle.status} → ${to}`,
        );
      }
      return tx.assessmentCycle.update({
        where: { id: cycleId },
        data: { status: to },
      });
    });
  }
}
