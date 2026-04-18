'use client';

/**
 * TanStack Query hooks for Sprint 3 HR admin dashboard (feature #17).
 * All routes flow through the `api` client (auth + silent refresh).
 *
 * Assumes Sprint 3 backend endpoints:
 *   POST /cycles/:id/close          — finalize-all + transition → closed
 *   POST /cycles/:id/finalize-all   — bulk finalize eligible rows
 *   GET  /cycles/:id/export.csv     — streamed CSV download
 */
import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AssessmentStatus, CycleStatus } from '@skillforge/shared-types';

// ── Response shapes ────────────────────────────────────────────────

export type CycleFrameworkRef = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
};

export type CycleSummary = {
  id: string;
  name: string;
  status: CycleStatus;
  startDate: string;
  endDate: string;
  frameworkId: string;
  framework: Pick<CycleFrameworkRef, 'name' | 'status'>;
  createdAt: string;
  updatedAt: string;
  _count: { assessments: number };
};

export type CycleDetail = Omit<CycleSummary, 'framework'> & {
  framework: CycleFrameworkRef & {
    maturityLevelsJson: Array<{ level: number; name: string; description: string }>;
  };
};

export type CycleProgress = {
  cycleId: string;
  total: number;
  submitted: number;
  completionRate: number;
  byStatus: Partial<Record<AssessmentStatus, number>>;
};

export type HrAssessment = {
  id: string;
  userId: string;
  cycleId: string;
  status: AssessmentStatus;
  selfScore: number | null;
  managerScore: number | null;
  aiSuggestedScore: number | null;
  compositeScore: number | null;
  submittedAt: string | null;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    roleFamily: string;
    designation: string;
  };
};

// ── Queries ────────────────────────────────────────────────────────

export function useCycles() {
  return useQuery<CycleSummary[]>({
    queryKey: ['cycles'],
    queryFn: () => api.get<CycleSummary[]>('/cycles'),
  });
}

export function useCycle(id: string | undefined) {
  return useQuery<CycleDetail>({
    queryKey: ['cycles', id],
    queryFn: () => api.get<CycleDetail>(`/cycles/${id}`),
    enabled: Boolean(id),
  });
}

export function useCycleProgress(id: string | undefined) {
  return useQuery<CycleProgress>({
    queryKey: ['cycles', id, 'progress'],
    queryFn: () => api.get<CycleProgress>(`/cycles/${id}/progress`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useHrAssessments(cycleId: string | undefined) {
  return useQuery<HrAssessment[]>({
    queryKey: ['assessments', 'hr', cycleId],
    queryFn: () => api.get<HrAssessment[]>(`/assessments/hr/list?cycleId=${cycleId}`),
    enabled: Boolean(cycleId),
  });
}

/** Fan-out aggregator for the HR landing KPI strip. */
export type HrKpiTotals = {
  notStarted: number;
  completedToday: number;
  loading: boolean;
  isError: boolean;
};

export function useHrKpiTotals(openCycleIds: string[]): HrKpiTotals {
  const progressQs = useQueries({
    queries: openCycleIds.map((id) => ({
      queryKey: ['cycles', id, 'progress'],
      queryFn: () => api.get<CycleProgress>(`/cycles/${id}/progress`),
      staleTime: 30_000,
    })),
  });
  const rosterQs = useQueries({
    queries: openCycleIds.map((id) => ({
      queryKey: ['assessments', 'hr', id],
      queryFn: () => api.get<HrAssessment[]>(`/assessments/hr/list?cycleId=${id}`),
    })),
  });

  return useMemo(() => {
    const loading = progressQs.some((q) => q.isLoading) || rosterQs.some((q) => q.isLoading);
    const isError = progressQs.some((q) => q.isError) || rosterQs.some((q) => q.isError);
    const notStarted = progressQs.reduce((s, q) => s + (q.data?.byStatus.not_started ?? 0), 0);

    const startToday = new Date();
    startToday.setUTCHours(0, 0, 0, 0);
    const todayMs = startToday.getTime();

    const completedToday = rosterQs.reduce((s, q) => {
      if (!q.data) return s;
      return (
        s +
        q.data.filter(
          (a) =>
            isSubmittedStatus(a.status) &&
            new Date(a.updatedAt).getTime() >= todayMs,
        ).length
      );
    }, 0);

    return { notStarted, completedToday, loading, isError };
  }, [progressQs, rosterQs]);
}

const SUBMITTED = new Set<AssessmentStatus>([
  'self_submitted',
  'manager_in_progress',
  'peer_submitted',
  'ai_analyzed',
  'manager_scored',
  'composite_computed',
  'finalized',
]);
export const isSubmittedStatus = (s: AssessmentStatus): boolean => SUBMITTED.has(s);

export function countSubmitted(p: CycleProgress | undefined) {
  return p ? { submitted: p.submitted, total: p.total } : { submitted: 0, total: 0 };
}

// ── Mutations ──────────────────────────────────────────────────────

function invalidateCycle(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: ['cycles'] });
  qc.invalidateQueries({ queryKey: ['cycles', id] });
  qc.invalidateQueries({ queryKey: ['cycles', id, 'progress'] });
  qc.invalidateQueries({ queryKey: ['assessments', 'hr', id] });
}

export function useTransitionCycle() {
  const qc = useQueryClient();
  return useMutation<CycleSummary, Error, { id: string; status: CycleStatus }>({
    mutationFn: ({ id, status }) =>
      api.patch<CycleSummary>(`/cycles/${id}/status`, { status }),
    onSuccess: (res) => invalidateCycle(qc, res.id),
  });
}

/** Locked → Closed with implicit finalize-all (Sprint 3 backend). */
export function useCloseCycle() {
  const qc = useQueryClient();
  return useMutation<CycleSummary, Error, string>({
    mutationFn: (id) => api.post<CycleSummary>(`/cycles/${id}/close`),
    onSuccess: (res) => invalidateCycle(qc, res.id),
  });
}

/** Finalize composite-computed assessments in a cycle without closing. */
export function useBulkFinalize() {
  const qc = useQueryClient();
  return useMutation<{ finalized: number; skipped: number }, Error, string>({
    mutationFn: (id) =>
      api.post<{ finalized: number; skipped: number }>(`/cycles/${id}/finalize-all`),
    onSuccess: (_r, id) => invalidateCycle(qc, id),
  });
}

/** CSV export helper — anchor-click download with bearer token query param. */
export function useDownloadExport() {
  return (cycleId: string, fileLabel?: string) => {
    if (typeof window === 'undefined') return;
    const access = sessionStorage.getItem('sf:access') ?? '';
    const url =
      `/api/assessment/cycles/${encodeURIComponent(cycleId)}/export.csv` +
      (access ? `?access_token=${encodeURIComponent(access)}` : '');

    const a = document.createElement('a');
    a.href = url;
    a.download = `cycle-${fileLabel ?? cycleId}-export.csv`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
}
