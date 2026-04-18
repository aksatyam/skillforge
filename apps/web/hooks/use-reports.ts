'use client';

/**
 * TanStack Query hooks for Sprint 4 feature #3 — Basic reporting.
 *
 * Wraps two read-only aggregate endpoints on the stats service. Both are
 * cycle-scoped and role-gated upstream (hr_admin / super_admin). The org
 * completion response mirrors and extends `CycleProgress` so the reports
 * page can reuse the donut without a second fetch.
 *
 * Backend endpoints (being built in parallel):
 *   GET /stats/org/completion?cycleId=<uuid>
 *   GET /stats/org/score-distribution?cycleId=<uuid>
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Response shapes ────────────────────────────────────────────────

export type OrgCompletionRoleFamilyRow = {
  roleFamily: string;
  total: number;
  submitted: number;
  rate: number;
};

export type OrgCompletionManagerRow = {
  managerId: string | null;
  managerName: string;
  total: number;
  submitted: number;
  rate: number;
};

export type OrgCompletionResponse = {
  cycleId: string;
  cycleName: string;
  total: number;
  submitted: number;
  completionRate: number;
  byRoleFamily: OrgCompletionRoleFamilyRow[];
  byManager: OrgCompletionManagerRow[];
  byStatus: Record<string, number>;
};

export type ScoreBucket = {
  bucket: string;
  count: number;
  min: number;
  max: number;
};

export type ScoreDistributionByRoleFamily = {
  roleFamily: string;
  mean: number | null;
  count: number;
  buckets: ScoreBucket[];
};

export type ScoreDistributionResponse = {
  cycleId: string;
  total: number;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  buckets: ScoreBucket[];
  byRoleFamily: ScoreDistributionByRoleFamily[];
};

// ── Queries ────────────────────────────────────────────────────────

export function useOrgCompletion(cycleId: string | undefined) {
  return useQuery<OrgCompletionResponse>({
    queryKey: ['stats', 'org', 'completion', cycleId],
    queryFn: () =>
      api.get<OrgCompletionResponse>(
        `/stats/org/completion?cycleId=${encodeURIComponent(cycleId ?? '')}`,
      ),
    enabled: Boolean(cycleId),
    staleTime: 30_000,
  });
}

export function useScoreDistribution(cycleId: string | undefined) {
  return useQuery<ScoreDistributionResponse>({
    queryKey: ['stats', 'org', 'score-distribution', cycleId],
    queryFn: () =>
      api.get<ScoreDistributionResponse>(
        `/stats/org/score-distribution?cycleId=${encodeURIComponent(cycleId ?? '')}`,
      ),
    enabled: Boolean(cycleId),
    staleTime: 30_000,
  });
}
