import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TenantId } from '@skillforge/tenant-guard';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('@skillforge/db', () => {
  // Lightweight Decimal stand-in — `+x` coerces via valueOf().
  class Decimal {
    private readonly n: number;
    constructor(v: number | string) {
      this.n = typeof v === 'string' ? parseFloat(v) : v;
    }
    valueOf() {
      return this.n;
    }
    toNumber() {
      return this.n;
    }
  }
  return {
    prisma: { artifact: { update: vi.fn() } },
    prismaAdmin: {},
    Prisma: { Decimal },
  };
});

const withTenantMock = vi.fn();
vi.mock('@skillforge/tenant-guard', () => ({
  withTenant: (orgId: unknown, fn: (tx: unknown) => unknown) => withTenantMock(orgId, fn),
}));

// Import AFTER mocks
import { AssessmentService } from './assessment.service';
import { ScoringService } from './scoring.service';

// ── Helpers ──────────────────────────────────────────────────────────
const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as TenantId;
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MANAGER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ASSESSMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CYCLE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const FRAMEWORK_ID = '99999999-9999-4999-8999-999999999999';

type TxDouble = {
  assessment: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  competencyFramework: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

function makeTx(): TxDouble {
  return {
    assessment: { findFirst: vi.fn(), update: vi.fn() },
    competencyFramework: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  };
}

function makeService() {
  return new AssessmentService(new ScoringService());
}

describe('AssessmentService', () => {
  let svc: AssessmentService;
  let tx: TxDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = makeService();
    tx = makeTx();
    withTenantMock.mockImplementation(async (_orgId, fn) => fn(tx));
  });

  describe('aggregateResponses() [private]', () => {
    const call = (svc: AssessmentService, rs: { score: number }[]) =>
      (svc as unknown as { aggregateResponses: (r: { score: number }[]) => number })
        .aggregateResponses(rs);

    it('returns 4.00 for scores [3,4,5]', () => {
      expect(call(svc, [{ score: 3 }, { score: 4 }, { score: 5 }])).toBe(4);
    });

    it('returns 0 for an empty array', () => {
      expect(call(svc, [])).toBe(0);
    });

    it('rounds to 2 decimals', () => {
      expect(call(svc, [{ score: 3 }, { score: 4 }])).toBe(3.5);
      expect(call(svc, [{ score: 1 }, { score: 2 }, { score: 2 }])).toBeCloseTo(1.67, 2);
    });
  });

  describe('saveSelfDraft()', () => {
    it('rejects if cycle.status !== "open"', async () => {
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        userId: USER_ID,
        status: 'not_started',
        cycle: { status: 'draft' },
        responsesJson: null,
      });
      await expect(
        svc.saveSelfDraft(ORG_ID, USER_ID, { assessmentId: ASSESSMENT_ID, responses: [] }),
      ).rejects.toThrow(/cannot save draft/);
    });

    it('rejects if assessment.userId !== caller', async () => {
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        userId: OTHER_USER_ID,
        status: 'not_started',
        cycle: { status: 'open' },
        responsesJson: null,
      });
      await expect(
        svc.saveSelfDraft(ORG_ID, USER_ID, { assessmentId: ASSESSMENT_ID, responses: [] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when status is not in [not_started, self_submitted]', async () => {
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        userId: USER_ID,
        status: 'composite_computed',
        cycle: { status: 'open' },
        responsesJson: null,
      });
      await expect(
        svc.saveSelfDraft(ORG_ID, USER_ID, { assessmentId: ASSESSMENT_ID, responses: [] }),
      ).rejects.toThrow(/Cannot edit self-assessment/);
    });

    it('preserves existing manager block when merging responsesJson', async () => {
      const managerBlock = {
        responses: [{ dimension: 'd1', score: 4 }],
        savedAt: '2026-04-01T00:00:00.000Z',
      };
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        userId: USER_ID,
        status: 'self_submitted',
        cycle: { status: 'open' },
        responsesJson: { manager: managerBlock },
      });
      tx.assessment.update.mockImplementation(async ({ data }) => ({ id: ASSESSMENT_ID, ...data }));

      await svc.saveSelfDraft(ORG_ID, USER_ID, {
        assessmentId: ASSESSMENT_ID,
        responses: [{ dimension: 'd1', score: 2 }],
      });

      const updateArg = tx.assessment.update.mock.calls[0][0];
      expect(updateArg.data.responsesJson.manager).toEqual(managerBlock);
      expect(updateArg.data.responsesJson.self.responses).toEqual([{ dimension: 'd1', score: 2 }]);
      expect(updateArg.data.version).toEqual({ increment: 1 });
    });

    it('throws NotFound when assessment is missing', async () => {
      tx.assessment.findFirst.mockResolvedValue(null);
      await expect(
        svc.saveSelfDraft(ORG_ID, USER_ID, { assessmentId: ASSESSMENT_ID, responses: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitSelf()', () => {
    const setupAssessment = (overrides: Record<string, unknown> = {}) =>
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        userId: USER_ID,
        status: 'not_started',
        cycle: { status: 'open', frameworkId: FRAMEWORK_ID },
        responsesJson: null,
        ...overrides,
      });

    it('rejects if status !== "not_started"', async () => {
      setupAssessment({ status: 'self_submitted' });
      await expect(
        svc.submitSelf(ORG_ID, USER_ID, {
          assessmentId: ASSESSMENT_ID,
          responses: [{ dimension: 'd1', score: 3 }],
        }),
      ).rejects.toThrow(/Already submitted/);
    });

    it('rejects if required dimensions (per roleMapping) are missing', async () => {
      setupAssessment();
      tx.competencyFramework.findUnique.mockResolvedValue({
        id: FRAMEWORK_ID,
        roleMappings: [
          {
            roleFamily: 'engineering',
            assessmentCriteriaJson: {
              rubric: [{ dimension: 'd1' }, { dimension: 'd2' }, { dimension: 'd3' }],
            },
          },
        ],
      });
      tx.user.findUnique.mockResolvedValue({ id: USER_ID, roleFamily: 'engineering' });

      await expect(
        svc.submitSelf(ORG_ID, USER_ID, {
          assessmentId: ASSESSMENT_ID,
          responses: [{ dimension: 'd1', score: 3 }],
        }),
      ).rejects.toThrow(/Missing responses for dimensions: d2, d3/);
    });

    it('sets selfScore to aggregated value and status to self_submitted', async () => {
      setupAssessment();
      tx.competencyFramework.findUnique.mockResolvedValue({
        id: FRAMEWORK_ID,
        roleMappings: [],
      });
      tx.user.findUnique.mockResolvedValue({ id: USER_ID, roleFamily: 'engineering' });
      tx.assessment.update.mockImplementation(async ({ data }) => ({ id: ASSESSMENT_ID, ...data }));

      await svc.submitSelf(ORG_ID, USER_ID, {
        assessmentId: ASSESSMENT_ID,
        responses: [
          { dimension: 'd1', score: 3 },
          { dimension: 'd2', score: 4 },
          { dimension: 'd3', score: 5 },
        ],
      });

      const arg = tx.assessment.update.mock.calls[0][0];
      expect(arg.data.selfScore).toBe(4);
      expect(arg.data.status).toBe('self_submitted');
      expect(arg.data.submittedAt).toBeInstanceOf(Date);
      expect(arg.data.responsesJson.self.submittedAt).toBeTypeOf('string');
    });

    it('rejects if cycle is not open', async () => {
      setupAssessment({ cycle: { status: 'locked', frameworkId: FRAMEWORK_ID } });
      await expect(
        svc.submitSelf(ORG_ID, USER_ID, {
          assessmentId: ASSESSMENT_ID,
          responses: [{ dimension: 'd1', score: 3 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if caller is not the assessment owner', async () => {
      setupAssessment({ userId: OTHER_USER_ID });
      await expect(
        svc.submitSelf(ORG_ID, USER_ID, {
          assessmentId: ASSESSMENT_ID,
          responses: [{ dimension: 'd1', score: 3 }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('submitManager()', () => {
    // NOTE: intentionally NOT `as const` — `submitManager()` expects a mutable
    // `responses: {...}[]`, so `as const` would produce a `readonly [...]` that
    // TS rejects at the call site.
    const DEFAULT_DTO: {
      assessmentId: string;
      managerScore: number;
      rationale: string;
      responses: { dimension: string; score: number }[];
      overrodeAiSuggestion: boolean;
    } = {
      assessmentId: ASSESSMENT_ID,
      managerScore: 4,
      rationale: 'solid work',
      responses: [{ dimension: 'd1', score: 4 }],
      overrodeAiSuggestion: false,
    };

    const setupAssessment = (overrides: Record<string, unknown> = {}) =>
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'self_submitted',
        selfScore: 3,
        peerScore: null,
        aiScore: null,
        responsesJson: null,
        user: { id: USER_ID, managerId: MANAGER_ID },
        cycle: { id: CYCLE_ID, frameworkId: FRAMEWORK_ID, org: { settingsJson: null } },
        ...overrides,
      });

    it('rejects if caller is not the manager of the subject', async () => {
      setupAssessment({ user: { id: USER_ID, managerId: 'some-other-manager' } });
      await expect(svc.submitManager(ORG_ID, MANAGER_ID, DEFAULT_DTO)).rejects.toThrow(
        /not the manager/,
      );
    });

    it('rejects if status is not in [self_submitted, manager_in_progress, ai_analyzed]', async () => {
      setupAssessment({ status: 'not_started' });
      await expect(svc.submitManager(ORG_ID, MANAGER_ID, DEFAULT_DTO)).rejects.toThrow(
        /Cannot score in status/,
      );
    });

    it('computes composite score from weights and all available component scores', async () => {
      setupAssessment({
        selfScore: 3,
        peerScore: 3.5,
        aiScore: 4.2,
        cycle: {
          frameworkId: FRAMEWORK_ID,
          org: {
            settingsJson: {
              assessmentWeights: { self: 0.15, manager: 0.5, peer: 0.2, ai: 0.15 },
            },
          },
        },
      });
      tx.assessment.update.mockImplementation(async ({ data }) => ({ id: ASSESSMENT_ID, ...data }));

      await svc.submitManager(ORG_ID, MANAGER_ID, { ...DEFAULT_DTO, managerScore: 4 });

      const arg = tx.assessment.update.mock.calls[0][0];
      expect(arg.data.managerScore).toBe(4);
      expect(arg.data.compositeScore).toBeCloseTo(0.15 * 3 + 0.5 * 4 + 0.2 * 3.5 + 0.15 * 4.2, 2);
      expect(arg.data.status).toBe('composite_computed');
      expect(arg.data.managerRationale).toBe('solid work');
    });

    it('throws NotFound when assessment does not exist', async () => {
      tx.assessment.findFirst.mockResolvedValue(null);
      await expect(svc.submitManager(ORG_ID, MANAGER_ID, DEFAULT_DTO)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
