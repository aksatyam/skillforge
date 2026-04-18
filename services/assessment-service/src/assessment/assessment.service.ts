import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import {
  AssessmentWeightsSchema,
  DEFAULT_ASSESSMENT_WEIGHTS,
  type SaveSelfDraftDto,
  type SubmitSelfAssessmentDto,
  type SubmitManagerAssessmentDto,
  type AssessmentSubmissionJson,
} from '@skillforge/shared-types';
import { ScoringService } from './scoring.service';

@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);
  constructor(private readonly scoring: ScoringService) {}

  // ── Helpers ────────────────────────────────────────────────────

  private resolveWeights(settingsJson: unknown) {
    const raw = (settingsJson as { assessmentWeights?: unknown } | null)?.assessmentWeights;
    const parsed = AssessmentWeightsSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn(
        `Invalid/missing assessmentWeights in org settings; using defaults. ${parsed.error.message}`,
      );
      return DEFAULT_ASSESSMENT_WEIGHTS;
    }
    return parsed.data;
  }

  /** Unweighted average of response scores → single selfScore (0-5). */
  private aggregateResponses(responses: { score: number }[]): number {
    if (responses.length === 0) return 0;
    const sum = responses.reduce((s, r) => s + r.score, 0);
    return +(sum / responses.length).toFixed(2);
  }

  // ── Read paths ─────────────────────────────────────────────────

  async listForUser(orgId: TenantId, userId: string) {
    return withTenant(orgId, (tx) =>
      tx.assessment.findMany({
        where: { userId, deletedAt: null },
        include: {
          cycle: {
            include: { framework: { select: { name: true, maturityLevelsJson: true } } },
          },
          artifacts: {
            select: { id: true, fileName: true, artifactType: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async getById(orgId: TenantId, userId: string, assessmentId: string) {
    return withTenant(orgId, async (tx) => {
      const a = await tx.assessment.findFirst({
        where: { id: assessmentId, deletedAt: null },
        include: {
          cycle: { include: { framework: { include: { roleMappings: true } } } },
          artifacts: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              roleFamily: true,
              designation: true,
              managerId: true,
            },
          },
        },
      });
      if (!a) throw new NotFoundException();
      // Ownership/manager check at controller; belt-and-suspenders here:
      // RLS has already filtered to the tenant.
      return a;
    });
  }

  async listForManager(orgId: TenantId, managerId: string) {
    return withTenant(orgId, async (tx) => {
      const reports = await tx.user.findMany({
        where: { managerId, deletedAt: null },
        select: { id: true },
      });
      if (reports.length === 0) return [];
      const reportIds = reports.map((r) => r.id);
      return tx.assessment.findMany({
        where: { userId: { in: reportIds }, deletedAt: null },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              roleFamily: true,
              designation: true,
            },
          },
          cycle: { select: { id: true, name: true, endDate: true, status: true } },
        },
        orderBy: [{ cycle: { startDate: 'desc' } }, { user: { name: 'asc' } }],
      });
    });
  }

  async listForHr(orgId: TenantId, cycleId: string) {
    return withTenant(orgId, (tx) =>
      tx.assessment.findMany({
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
        orderBy: { user: { name: 'asc' } },
      }),
    );
  }

  // ── Self-assessment write paths (Sprint 2) ─────────────────────

  async saveSelfDraft(orgId: TenantId, userId: string, dto: SaveSelfDraftDto) {
    return withTenant(orgId, async (tx) => {
      const a = await tx.assessment.findFirst({
        where: { id: dto.assessmentId, deletedAt: null },
        include: { cycle: true },
      });
      if (!a) throw new NotFoundException();
      if (a.userId !== userId) throw new ForbiddenException();
      if (a.cycle.status !== 'open')
        throw new BadRequestException(`Cycle is ${a.cycle.status} — cannot save draft`);
      if (!['not_started', 'self_submitted'].includes(a.status)) {
        throw new BadRequestException(`Cannot edit self-assessment in status: ${a.status}`);
      }

      const existing =
        (a.responsesJson as { self?: AssessmentSubmissionJson; manager?: unknown } | null) ?? {};
      const nextSelf: AssessmentSubmissionJson = {
        responses: dto.responses,
        savedAt: new Date().toISOString(),
        submittedAt: existing.self?.submittedAt,
      };

      return tx.assessment.update({
        where: { id: dto.assessmentId },
        data: {
          responsesJson: { ...existing, self: nextSelf },
          version: { increment: 1 },
        },
        select: { id: true, status: true, responsesJson: true, updatedAt: true },
      });
    });
  }

  async submitSelf(orgId: TenantId, userId: string, dto: SubmitSelfAssessmentDto) {
    return withTenant(orgId, async (tx) => {
      const a = await tx.assessment.findFirst({
        where: { id: dto.assessmentId, deletedAt: null },
        include: { cycle: true },
      });
      if (!a) throw new NotFoundException();
      if (a.userId !== userId) throw new ForbiddenException();
      if (a.cycle.status !== 'open')
        throw new BadRequestException(`Cycle is ${a.cycle.status} — cannot submit`);
      if (a.status !== 'not_started') {
        throw new BadRequestException(`Already submitted (status: ${a.status})`);
      }

      // Require coverage of every rubric dimension defined for the user's role
      const framework = await tx.competencyFramework.findUnique({
        where: { id: a.cycle.frameworkId },
        include: { roleMappings: true },
      });
      const user = await tx.user.findUnique({ where: { id: userId } });
      const mapping = framework?.roleMappings.find(
        (rm) => rm.roleFamily === user?.roleFamily,
      );
      if (mapping) {
        const required = (
          mapping.assessmentCriteriaJson as { rubric: { dimension: string }[] }
        ).rubric.map((r) => r.dimension);
        const provided = new Set(dto.responses.map((r) => r.dimension));
        const missing = required.filter((d) => !provided.has(d));
        if (missing.length > 0) {
          throw new BadRequestException(
            `Missing responses for dimensions: ${missing.join(', ')}`,
          );
        }
      }

      const now = new Date();
      const selfScore = this.aggregateResponses(dto.responses);
      const existing =
        (a.responsesJson as { self?: unknown; manager?: unknown } | null) ?? {};
      const selfBlock: AssessmentSubmissionJson = {
        responses: dto.responses,
        savedAt: now.toISOString(),
        submittedAt: now.toISOString(),
      };

      return tx.assessment.update({
        where: { id: dto.assessmentId },
        data: {
          selfScore,
          status: 'self_submitted',
          submittedAt: now,
          responsesJson: { ...existing, self: selfBlock },
          version: { increment: 1 },
        },
      });
    });
  }

  // ── Manager scoring ────────────────────────────────────────────

  async submitManager(
    orgId: TenantId,
    managerUserId: string,
    dto: SubmitManagerAssessmentDto,
  ) {
    return withTenant(orgId, async (tx) => {
      const a = await tx.assessment.findFirst({
        where: { id: dto.assessmentId, deletedAt: null },
        include: { user: true, cycle: { include: { org: true } } },
      });
      if (!a) throw new NotFoundException();
      if (a.user.managerId !== managerUserId)
        throw new ForbiddenException('You are not the manager of this employee');
      if (!['self_submitted', 'manager_in_progress', 'ai_analyzed'].includes(a.status))
        throw new BadRequestException(`Cannot score in status: ${a.status}`);

      const weights = this.resolveWeights(a.cycle.org.settingsJson);
      const composite = this.scoring.computeComposite(
        {
          self: a.selfScore,
          manager: dto.managerScore as never,
          peer: a.peerScore,
          ai: a.aiScore,
        },
        weights,
      );

      const existing =
        (a.responsesJson as { self?: unknown; manager?: unknown } | null) ?? {};
      const now = new Date();
      const managerBlock: AssessmentSubmissionJson = {
        responses: dto.responses,
        savedAt: now.toISOString(),
        submittedAt: now.toISOString(),
      };

      return tx.assessment.update({
        where: { id: dto.assessmentId },
        data: {
          managerScore: dto.managerScore,
          managerRationale: dto.rationale,
          compositeScore: composite,
          status: 'composite_computed',
          responsesJson: { ...existing, manager: managerBlock },
          version: { increment: 1 },
        },
      });
    });
  }
}
