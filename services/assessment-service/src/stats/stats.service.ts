import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';

/**
 * StatsService — Sprint 4 Feature #3 + #1 + #2.
 *
 * Provides aggregate reads for:
 *   - Employee scorecards (self/manager/peer/ai per dimension + historical trend)
 *   - Manager team overview (completion rate, pending reviews, at-risk, activity)
 *   - Org-wide completion + score distribution (HR reports)
 *
 * All queries go through `withTenant` so RLS scopes them by org_id.
 *
 * Sensitive rule: cohort averages hide scores when N<3 (manager team avg,
 * role-family mean). Prevents inference attacks where a manager's 1 report's
 * score is trivially readable from a team "average".
 */
const MIN_COHORT_SIZE = 3;

const PROGRESSED_STATUSES = [
  'self_submitted',
  'manager_in_progress',
  'peer_submitted',
  'ai_analyzed',
  'manager_scored',
  'composite_computed',
  'finalized',
] as const;

const FINAL_STATUSES = ['composite_computed', 'finalized'] as const;

const BUCKET_EDGES = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function bucketLabel(min: number, max: number): string {
  return `${min.toFixed(1)}-${max.toFixed(1)}`;
}

function emptyBuckets() {
  return BUCKET_EDGES.slice(0, -1).map((min, i) => ({
    bucket: bucketLabel(min, BUCKET_EDGES[i + 1]),
    min,
    max: BUCKET_EDGES[i + 1],
    count: 0,
  }));
}

function bucketize(scores: number[]) {
  const buckets = emptyBuckets();
  for (const s of scores) {
    const idx = Math.min(
      Math.floor(s / 0.5),
      buckets.length - 1,
    );
    buckets[idx].count += 1;
  }
  return buckets;
}

function stats(scores: number[]) {
  if (scores.length === 0) return { mean: null, median: null, stdDev: null };
  const mean = +(scores.reduce((s, x) => s + x, 0) / scores.length).toFixed(2);
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = +(sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]).toFixed(2);
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
  const stdDev = +Math.sqrt(variance).toFixed(2);
  return { mean, median, stdDev };
}

@Injectable()
export class StatsService {
  // ── Employee scorecard ─────────────────────────────────────────
  async employeeScorecard(orgId: TenantId, userId: string) {
    return withTenant(orgId, async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
      });
      if (!user) throw new NotFoundException();

      // Find the employee's most recent assessment (any status) as "current"
      const all = await tx.assessment.findMany({
        where: { userId, deletedAt: null },
        include: {
          cycle: {
            include: {
              framework: { include: { roleMappings: true } },
            },
          },
        },
        orderBy: [{ cycle: { startDate: 'desc' } }, { createdAt: 'desc' } as const],
      });

      const current = all[0] ?? null;
      const history = all
        .slice(1)
        .map((a) => ({
          cycleId: a.cycle.id,
          cycleName: a.cycle.name,
          endDate: a.cycle.endDate.toISOString(),
          compositeScore: a.compositeScore ? +a.compositeScore : null,
          status: a.status,
        }));

      let currentPayload: null | {
        cycleId: string;
        cycleName: string;
        status: string;
        selfScore: number | null;
        managerScore: number | null;
        peerScore: number | null;
        aiScore: number | null;
        compositeScore: number | null;
        perDimension: Array<{
          dimension: string;
          self: number | null;
          manager: number | null;
          composite: number | null;
          weight: number;
        }>;
        maturityLevels: Array<{ level: number; name: string; description: string }>;
        targetLevel: number | null;
      } = null;

      if (current) {
        const rm = current.cycle.framework.roleMappings.find(
          (m) => m.roleFamily === user.roleFamily,
        );
        const rubric =
          (rm?.assessmentCriteriaJson as { rubric?: Array<{ dimension: string; weight: number }> })
            ?.rubric ?? [];
        const selfBlock =
          (current.responsesJson as {
            self?: { responses?: Array<{ dimension: string; score: number }> };
            manager?: { responses?: Array<{ dimension: string; score: number }> };
          } | null)?.self;
        const mgrBlock =
          (current.responsesJson as {
            self?: { responses?: Array<{ dimension: string; score: number }> };
            manager?: { responses?: Array<{ dimension: string; score: number }> };
          } | null)?.manager;
        const selfByDim = new Map((selfBlock?.responses ?? []).map((r) => [r.dimension, r.score]));
        const mgrByDim = new Map((mgrBlock?.responses ?? []).map((r) => [r.dimension, r.score]));

        currentPayload = {
          cycleId: current.cycle.id,
          cycleName: current.cycle.name,
          status: current.status,
          selfScore: current.selfScore ? +current.selfScore : null,
          managerScore: current.managerScore ? +current.managerScore : null,
          peerScore: current.peerScore ? +current.peerScore : null,
          aiScore: current.aiScore ? +current.aiScore : null,
          compositeScore: current.compositeScore ? +current.compositeScore : null,
          perDimension: rubric.map((r) => {
            const self = selfByDim.get(r.dimension) ?? null;
            const mgr = mgrByDim.get(r.dimension) ?? null;
            // Composite per-dimension: blend self + manager using org weights
            // Simplification: average for display (full weighted compute is cycle-level)
            const composite =
              self != null && mgr != null ? +((self + mgr) / 2).toFixed(2) : (mgr ?? self);
            return { dimension: r.dimension, self, manager: mgr, composite, weight: r.weight };
          }),
          maturityLevels: (current.cycle.framework.maturityLevelsJson as Array<{
            level: number;
            name: string;
            description: string;
          }>) ?? [],
          targetLevel: rm?.targetLevel ?? null,
        };
      }

      return {
        userId: user.id,
        name: user.name,
        roleFamily: user.roleFamily,
        designation: user.designation,
        currentCycle: currentPayload,
        history,
      };
    });
  }

  // ── Manager team overview ──────────────────────────────────────
  async managerTeamOverview(orgId: TenantId, managerId: string) {
    return withTenant(orgId, async (tx) => {
      const reports = await tx.user.findMany({
        where: { managerId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (reports.length === 0) {
        return {
          totalReports: 0,
          byStatus: {},
          completionRate: 0,
          averageScores: { self: null, manager: null, composite: null },
          distribution: emptyBuckets().map((b) => ({
            bucket: b.bucket,
            min: b.min,
            max: b.max,
            count: 0,
          })),
          pendingReviews: 0,
          recentActivity: [],
          atRiskReports: [],
        };
      }

      const reportIds = reports.map((r) => r.id);
      const assessments = await tx.assessment.findMany({
        where: { userId: { in: reportIds }, deletedAt: null },
        include: {
          user: { select: { id: true, name: true } },
          cycle: { select: { id: true, name: true, endDate: true, status: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const byStatus: Record<string, number> = {};
      for (const a of assessments) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      const total = assessments.length;
      const submittedCount = assessments.filter((a) =>
        (PROGRESSED_STATUSES as readonly string[]).includes(a.status),
      ).length;
      const completionRate = total > 0 ? +(submittedCount / total).toFixed(3) : 0;

      const selfScores = assessments
        .map((a) => (a.selfScore ? +a.selfScore : null))
        .filter((x): x is number => x != null);
      const mgrScores = assessments
        .map((a) => (a.managerScore ? +a.managerScore : null))
        .filter((x): x is number => x != null);
      const comps = assessments
        .map((a) => (a.compositeScore ? +a.compositeScore : null))
        .filter((x): x is number => x != null);

      const averageScores = {
        self: selfScores.length >= MIN_COHORT_SIZE
          ? +(selfScores.reduce((s, x) => s + x, 0) / selfScores.length).toFixed(2)
          : null,
        manager: mgrScores.length >= MIN_COHORT_SIZE
          ? +(mgrScores.reduce((s, x) => s + x, 0) / mgrScores.length).toFixed(2)
          : null,
        composite: comps.length >= MIN_COHORT_SIZE
          ? +(comps.reduce((s, x) => s + x, 0) / comps.length).toFixed(2)
          : null,
      };

      const distribution = bucketize(comps);
      const pendingReviews = byStatus['self_submitted'] ?? 0;

      const now = Date.now();
      const atRiskReports = assessments
        .filter(
          (a) =>
            a.cycle.status === 'open' &&
            a.status === 'not_started' &&
            Math.ceil((a.cycle.endDate.getTime() - now) / 86_400_000) <= 3,
        )
        .map((a) => ({
          userId: a.user.id,
          name: a.user.name,
          status: a.status,
          daysToDeadline: Math.max(
            0,
            Math.ceil((a.cycle.endDate.getTime() - now) / 86_400_000),
          ),
        }))
        .slice(0, 20);

      // Recent activity — latest 10 updates, turning the status into a human label
      const recentActivity = assessments.slice(0, 10).map((a) => ({
        userId: a.user.id,
        name: a.user.name,
        event: mapStatusToEvent(a.status),
        at: a.updatedAt.toISOString(),
      }));

      return {
        totalReports: reports.length,
        byStatus,
        completionRate,
        averageScores,
        distribution,
        pendingReviews,
        recentActivity,
        atRiskReports,
      };
    });
  }

  // ── Org completion ─────────────────────────────────────────────
  async orgCompletion(orgId: TenantId, cycleId: string) {
    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
      });
      if (!cycle) throw new NotFoundException();

      const assessments = await tx.assessment.findMany({
        where: { cycleId, deletedAt: null },
        include: {
          user: {
            select: {
              id: true,
              roleFamily: true,
              managerId: true,
              manager: { select: { id: true, name: true } },
            },
          },
        },
      });

      const total = assessments.length;
      const submitted = assessments.filter((a) =>
        (PROGRESSED_STATUSES as readonly string[]).includes(a.status),
      ).length;

      const byStatus: Record<string, number> = {};
      for (const a of assessments) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;

      const familyGroups = new Map<string, { total: number; submitted: number }>();
      for (const a of assessments) {
        const f = a.user.roleFamily;
        const grp = familyGroups.get(f) ?? { total: 0, submitted: 0 };
        grp.total += 1;
        if ((PROGRESSED_STATUSES as readonly string[]).includes(a.status)) grp.submitted += 1;
        familyGroups.set(f, grp);
      }
      const byRoleFamily = Array.from(familyGroups.entries())
        .map(([roleFamily, g]) => ({
          roleFamily,
          total: g.total,
          submitted: g.submitted,
          rate: g.total > 0 ? +(g.submitted / g.total).toFixed(3) : 0,
        }))
        .sort((a, b) => a.roleFamily.localeCompare(b.roleFamily));

      const mgrGroups = new Map<
        string,
        { managerName: string; total: number; submitted: number }
      >();
      for (const a of assessments) {
        const mid = a.user.managerId ?? '__unassigned__';
        const name = a.user.manager?.name ?? '— Unassigned —';
        const grp = mgrGroups.get(mid) ?? { managerName: name, total: 0, submitted: 0 };
        grp.total += 1;
        if ((PROGRESSED_STATUSES as readonly string[]).includes(a.status)) grp.submitted += 1;
        mgrGroups.set(mid, grp);
      }
      const byManager = Array.from(mgrGroups.entries())
        .map(([managerId, g]) => ({
          managerId: managerId === '__unassigned__' ? null : managerId,
          managerName: g.managerName,
          total: g.total,
          submitted: g.submitted,
          rate: g.total > 0 ? +(g.submitted / g.total).toFixed(3) : 0,
        }))
        .sort((a, b) => a.managerName.localeCompare(b.managerName));

      return {
        cycleId,
        cycleName: cycle.name,
        total,
        submitted,
        completionRate: total > 0 ? +(submitted / total).toFixed(3) : 0,
        byRoleFamily,
        byManager,
        byStatus,
      };
    });
  }

  // ── Org score distribution ─────────────────────────────────────
  async scoreDistribution(orgId: TenantId, cycleId: string) {
    return withTenant(orgId, async (tx) => {
      const cycle = await tx.assessmentCycle.findFirst({
        where: { id: cycleId, deletedAt: null },
      });
      if (!cycle) throw new NotFoundException();

      const assessments = await tx.assessment.findMany({
        where: {
          cycleId,
          deletedAt: null,
          status: { in: [...FINAL_STATUSES] },
          compositeScore: { not: null },
        },
        include: { user: { select: { roleFamily: true } } },
      });

      const scores = assessments
        .map((a) => (a.compositeScore ? +a.compositeScore : null))
        .filter((x): x is number => x != null);
      const agg = stats(scores);

      const byRoleFamilyMap = new Map<string, number[]>();
      for (const a of assessments) {
        const s = a.compositeScore ? +a.compositeScore : null;
        if (s == null) continue;
        const list = byRoleFamilyMap.get(a.user.roleFamily) ?? [];
        list.push(s);
        byRoleFamilyMap.set(a.user.roleFamily, list);
      }
      const byRoleFamily = Array.from(byRoleFamilyMap.entries())
        .map(([roleFamily, ss]) => ({
          roleFamily,
          count: ss.length,
          mean: ss.length >= MIN_COHORT_SIZE ? stats(ss).mean : null,
          buckets: bucketize(ss),
        }))
        .sort((a, b) => a.roleFamily.localeCompare(b.roleFamily));

      return {
        cycleId,
        total: scores.length,
        mean: agg.mean,
        median: agg.median,
        stdDev: agg.stdDev,
        buckets: bucketize(scores),
        byRoleFamily,
      };
    });
  }
}

function mapStatusToEvent(status: string): string {
  const m: Record<string, string> = {
    not_started: 'assigned',
    self_submitted: 'self-submitted',
    manager_in_progress: 'manager in progress',
    peer_submitted: 'peer submitted',
    ai_analyzed: 'AI analyzed',
    manager_scored: 'manager scored',
    composite_computed: 'composite ready',
    finalized: 'finalized',
  };
  return m[status] ?? status;
}
