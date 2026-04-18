'use client';

/**
 * TanStack Query hooks for Sprint 4 Feature #1 — Employee scorecard.
 *
 * The stats service is mounted behind the `/api/assessment` rewrite prefix
 * (see next.config.mjs), so the concrete URLs become
 * `/api/assessment/stats/employee/:userId/scorecard`.
 *
 * Consumers:
 *   - `useMyScorecard()` — the signed-in employee viewing their own card
 *   - `useUserScorecard(userId)` — manager / HR viewing another user
 *
 * The `EmployeeScorecardResponse` type mirrors the stats-service contract
 * documented in BUILD_PLAN.md §6. It lives here (not in shared-types)
 * because it describes a read-aggregate shape, not a write DTO.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ScorecardMaturityLevel = {
  level: number;
  name: string;
  description: string;
};

export type ScorecardDimensionRow = {
  dimension: string;
  self: number | null;
  manager: number | null;
  composite: number | null;
  weight: number;
};

export type ScorecardCurrentCycle = {
  cycleId: string;
  cycleName: string;
  status: string;
  selfScore: number | null;
  managerScore: number | null;
  peerScore: number | null;
  aiScore: number | null;
  compositeScore: number | null;
  perDimension: ScorecardDimensionRow[];
  maturityLevels: ScorecardMaturityLevel[];
  targetLevel: number | null;
};

export type ScorecardHistoryEntry = {
  cycleId: string;
  cycleName: string;
  endDate: string;
  compositeScore: number | null;
  status: string;
};

export type EmployeeScorecardResponse = {
  userId: string;
  name: string;
  roleFamily: string;
  designation: string;
  currentCycle: ScorecardCurrentCycle | null;
  history: ScorecardHistoryEntry[];
};

export function useMyScorecard() {
  return useQuery<EmployeeScorecardResponse>({
    queryKey: ['scorecard', 'me'],
    queryFn: () => api.get<EmployeeScorecardResponse>('/stats/employee/me/scorecard'),
  });
}

export function useUserScorecard(userId: string | undefined) {
  return useQuery<EmployeeScorecardResponse>({
    queryKey: ['scorecard', userId],
    queryFn: () => api.get<EmployeeScorecardResponse>(`/stats/employee/${userId}/scorecard`),
    enabled: Boolean(userId),
  });
}
