'use client';

/**
 * TanStack Query hook for the manager team-overview dashboard.
 *
 * Back end: `GET /stats/manager/team-overview` (stats-service, rewritten to
 * `/api/stats/*` by next.config.mjs). Returns aggregated metrics for the
 * authenticated manager's direct reports for the active cycle.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AssessmentStatus } from '@skillforge/shared-types';

export type ManagerTeamOverviewResponse = {
  totalReports: number;
  byStatus: Record<string, number>; // AssessmentStatus → count
  completionRate: number; // 0..1
  averageScores: {
    // null if N<3 reports (anonymity floor)
    self: number | null;
    manager: number | null;
    composite: number | null;
  };
  distribution: Array<{ bucket: string; count: number; min: number; max: number }>;
  pendingReviews: number; // employees where status == 'self_submitted'
  recentActivity: Array<{ userId: string; name: string; event: string; at: string }>;
  atRiskReports: Array<{
    userId: string;
    name: string;
    status: AssessmentStatus | string;
    daysToDeadline: number;
  }>;
};

export function useTeamOverview() {
  return useQuery<ManagerTeamOverviewResponse>({
    queryKey: ['stats', 'manager', 'team-overview'],
    queryFn: () => api.get<ManagerTeamOverviewResponse>('/stats/manager/team-overview'),
    staleTime: 60 * 1000,
  });
}
