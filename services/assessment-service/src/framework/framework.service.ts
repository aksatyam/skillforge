import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FrameworkStatus } from '@skillforge/db';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import type {
  CreateFrameworkDto,
  UpsertRoleMappingDto,
} from '@skillforge/shared-types';

/**
 * Competency Framework engine.
 *
 * Lifecycle: draft → active → archived
 *
 * Rules:
 *   - Only `draft` frameworks can have maturity levels or role mappings edited.
 *   - At most ONE `active` framework per org at a time (simplifies cycle creation UI).
 *   - Archiving a framework does NOT cascade to in-flight cycles — those keep running.
 */
@Injectable()
export class FrameworkService {
  async list(orgId: TenantId) {
    return withTenant(orgId, (tx) =>
      tx.competencyFramework.findMany({
        where: { deletedAt: null },
        include: { _count: { select: { roleMappings: true } } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  }

  async get(orgId: TenantId, id: string) {
    return withTenant(orgId, async (tx) => {
      const fw = await tx.competencyFramework.findFirst({
        where: { id, deletedAt: null },
        include: { roleMappings: { orderBy: { roleFamily: 'asc' } } },
      });
      if (!fw) throw new NotFoundException();
      return fw;
    });
  }

  async create(orgId: TenantId, actorId: string, dto: CreateFrameworkDto) {
    return withTenant(orgId, (tx) =>
      tx.competencyFramework.create({
        data: {
          orgId,
          name: dto.name,
          version: 1,
          status: FrameworkStatus.draft,
          maturityLevelsJson: dto.maturityLevels,
          createdById: actorId,
        },
      }),
    );
  }

  async upsertRoleMapping(
    orgId: TenantId,
    frameworkId: string,
    dto: UpsertRoleMappingDto,
  ) {
    return withTenant(orgId, async (tx) => {
      const fw = await tx.competencyFramework.findFirst({
        where: { id: frameworkId, deletedAt: null },
      });
      if (!fw) throw new NotFoundException();
      if (fw.status !== 'draft') {
        throw new BadRequestException(
          'Role mappings can only be edited while the framework is in draft',
        );
      }
      const levels = fw.maturityLevelsJson as Array<{ level: number }>;
      if (!levels.some((l) => l.level === dto.targetLevel)) {
        throw new BadRequestException(
          `targetLevel ${dto.targetLevel} is not defined in this framework's maturity levels`,
        );
      }
      // Rubric weights must sum to ~1.0 (allow small float drift)
      const weightSum = dto.assessmentCriteria.rubric.reduce((s, r) => s + r.weight, 0);
      if (Math.abs(weightSum - 1) > 0.01) {
        throw new BadRequestException(
          `Rubric weights must sum to 1.0 (got ${weightSum.toFixed(3)})`,
        );
      }

      return tx.roleMapping.upsert({
        where: {
          frameworkId_roleFamily: {
            frameworkId,
            roleFamily: dto.roleFamily,
          },
        },
        update: {
          targetLevel: dto.targetLevel,
          assessmentCriteriaJson: dto.assessmentCriteria,
        },
        create: {
          frameworkId,
          roleFamily: dto.roleFamily,
          targetLevel: dto.targetLevel,
          assessmentCriteriaJson: dto.assessmentCriteria,
        },
      });
    });
  }

  async deleteRoleMapping(orgId: TenantId, frameworkId: string, roleFamily: string) {
    return withTenant(orgId, async (tx) => {
      const fw = await tx.competencyFramework.findFirst({
        where: { id: frameworkId, deletedAt: null },
      });
      if (!fw) throw new NotFoundException();
      if (fw.status !== 'draft') {
        throw new BadRequestException('Role mappings can only be removed while in draft');
      }
      await tx.roleMapping.delete({
        where: { frameworkId_roleFamily: { frameworkId, roleFamily } },
      });
    });
  }

  async publish(orgId: TenantId, frameworkId: string) {
    return withTenant(orgId, async (tx) => {
      const fw = await tx.competencyFramework.findFirst({
        where: { id: frameworkId, deletedAt: null },
        include: { _count: { select: { roleMappings: true } } },
      });
      if (!fw) throw new NotFoundException();
      if (fw.status !== 'draft') {
        throw new BadRequestException('Only draft frameworks can be published');
      }
      if (fw._count.roleMappings === 0) {
        throw new BadRequestException(
          'Add at least one role mapping before publishing',
        );
      }

      // Archive any other active framework (enforce single-active invariant)
      await tx.competencyFramework.updateMany({
        where: { status: 'active', id: { not: frameworkId } },
        data: { status: 'archived' },
      });

      return tx.competencyFramework.update({
        where: { id: frameworkId },
        data: { status: 'active' },
      });
    });
  }

  async archive(orgId: TenantId, frameworkId: string) {
    return withTenant(orgId, async (tx) => {
      const fw = await tx.competencyFramework.findFirst({
        where: { id: frameworkId, deletedAt: null },
      });
      if (!fw) throw new NotFoundException();
      return tx.competencyFramework.update({
        where: { id: frameworkId },
        data: { status: 'archived' },
      });
    });
  }
}
