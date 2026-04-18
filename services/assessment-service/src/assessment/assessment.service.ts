import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import type {
  SubmitSelfAssessmentDto,
  SubmitManagerAssessmentDto,
} from '@skillforge/shared-types';
import { ScoringService } from './scoring.service';

/**
 * Assessment lifecycle orchestrator. See BUILD_PLAN.md §5 Sprint 2 for scope.
 *
 * State machine (see sf-assessment-workflow skill):
 *   not_started → self_submitted → manager_in_progress → peer_submitted
 *               → ai_analyzed → manager_scored → composite_computed → finalized
 */
@Injectable()
export class AssessmentService {
  constructor(private readonly scoring: ScoringService) {}

  async listForUser(orgId: TenantId, userId: string) {
    return withTenant(orgId, (tx) =>
      tx.assessment.findMany({
        where: { userId, deletedAt: null },
        include: { cycle: true, artifacts: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listForManager(orgId: TenantId, managerId: string) {
    return withTenant(orgId, async (tx) => {
      const reports = await tx.user.findMany({
        where: { managerId, deletedAt: null },
        select: { id: true },
      });
      const reportIds = reports.map((r) => r.id);
      return tx.assessment.findMany({
        where: { userId: { in: reportIds }, deletedAt: null },
        include: { user: true, cycle: true },
        orderBy: [{ cycle: { startDate: 'desc' } }, { user: { name: 'asc' } }],
      });
    });
  }

  async submitSelf(orgId: TenantId, userId: string, dto: SubmitSelfAssessmentDto) {
    return withTenant(orgId, async (tx) => {
      const a = await tx.assessment.findUnique({ where: { id: dto.assessmentId } });
      if (!a) throw new NotFoundException();
      if (a.userId !== userId)
        throw new BadRequestException('Cannot submit another user\'s self-assessment');
      if (a.status !== 'not_started')
        throw new BadRequestException(`Already submitted (status: ${a.status})`);

      // Weighted average of response scores → self_score (0–5 scale)
      const selfScore =
        dto.responses.reduce((sum, r) => sum + r.score, 0) / dto.responses.length;

      return tx.assessment.update({
        where: { id: dto.assessmentId },
        data: {
          selfScore,
          status: 'self_submitted',
          submittedAt: new Date(),
        },
      });
    });
  }

  async submitManager(
    orgId: TenantId,
    managerUserId: string,
    dto: SubmitManagerAssessmentDto,
  ) {
    return withTenant(orgId, async (tx) => {
      const a = await tx.assessment.findUnique({
        where: { id: dto.assessmentId },
        include: { user: true, cycle: { include: { org: true } } },
      });
      if (!a) throw new NotFoundException();
      if (a.user.managerId !== managerUserId)
        throw new BadRequestException('You are not the manager of this employee');
      if (!['self_submitted', 'manager_in_progress', 'ai_analyzed'].includes(a.status))
        throw new BadRequestException(`Cannot score in status: ${a.status}`);

      // Compute composite from all available component scores
      const weights = (a.cycle.org.settingsJson as { assessmentWeights?: unknown })
        .assessmentWeights as { self: number; manager: number; peer: number; ai: number };
      const composite = this.scoring.computeComposite(
        {
          self: a.selfScore,
          manager: dto.managerScore as never,
          peer: a.peerScore,
          ai: a.aiScore,
        },
        weights ?? { self: 0.15, manager: 0.5, peer: 0.2, ai: 0.15 },
      );

      return tx.assessment.update({
        where: { id: dto.assessmentId },
        data: {
          managerScore: dto.managerScore,
          managerRationale: dto.rationale,
          compositeScore: composite,
          status: 'composite_computed',
        },
      });
    });
  }
}
