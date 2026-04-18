'use client';

/**
 * TanStack Query hooks for Sprint 2 assessment flows.
 *
 * Server routes live under the assessment-service, rewritten to
 * `/api/assessment/*` by next.config.mjs. The `api` client handles auth,
 * silent refresh, and error normalisation — we never fetch directly
 * from components.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  SaveSelfDraftDto,
  SubmitSelfAssessmentDto,
  RequestUploadUrlDto,
  AssessmentStatus,
  CycleStatus,
} from '@skillforge/shared-types';

// ── Shapes returned by the assessment-service ────────────────────────
// These mirror the Prisma `include` clauses in AssessmentService.
// Kept local (rather than in shared-types) because they describe
// read-response aggregates, not write DTOs.

export type ResponsesJson = {
  self?: {
    responses: Array<{ dimension: string; score: number; comment?: string }>;
    savedAt: string;
    submittedAt?: string;
  };
  manager?: unknown;
} | null;

export type ArtifactSummary = {
  id: string;
  fileName: string;
  artifactType: 'document' | 'code' | 'presentation' | 'prompt' | 'other';
  createdAt: string;
  fileSizeBytes?: number;
  mimeType?: string;
};

export type AssessmentListItem = {
  id: string;
  userId: string;
  cycleId: string;
  status: AssessmentStatus;
  selfScore: number | null;
  managerScore: number | null;
  peerScore: number | null;
  aiScore: number | null;
  aiConfidence: number | null;
  compositeScore: number | null;
  managerRationale: string | null;
  finalizedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  responsesJson: ResponsesJson;
  cycle: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: CycleStatus;
    framework: {
      name: string;
      maturityLevelsJson: Array<{ level: number; name: string; description: string }>;
    };
  };
  artifacts: ArtifactSummary[];
};

export type RoleMapping = {
  id: string;
  roleFamily: string;
  targetLevel: number;
  assessmentCriteriaJson: {
    rubric: Array<{ dimension: string; weight: number }>;
  };
};

export type AssessmentDetail = AssessmentListItem & {
  cycle: AssessmentListItem['cycle'] & {
    org?: {
      settingsJson?: {
        assessmentWeights?: { self: number; manager: number; peer: number; ai: number };
      } | null;
    };
    framework: AssessmentListItem['cycle']['framework'] & {
      id: string;
      roleMappings: RoleMapping[];
    };
  };
  user: {
    id: string;
    name: string;
    email: string;
    roleFamily: string;
    designation: string;
    managerId: string | null;
  };
};

export type TeamAssessment = {
  id: string;
  status: AssessmentStatus;
  submittedAt: string | null;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    roleFamily: string;
    designation: string;
  };
  cycle: {
    id: string;
    name: string;
    endDate: string;
    status: CycleStatus;
  };
};

export type UploadUrlResponse = {
  artifactId: string;
  uploadUrl: string;
  headers: Record<string, string>;
};

// ── Queries ──────────────────────────────────────────────────────────

export function useMyAssessments() {
  return useQuery<AssessmentListItem[]>({
    queryKey: ['assessments', 'me'],
    queryFn: () => api.get('/assessments/me'),
  });
}

export function useAssessment(id: string | undefined) {
  return useQuery<AssessmentDetail>({
    queryKey: ['assessments', id],
    queryFn: () => api.get(`/assessments/${id}`),
    enabled: Boolean(id),
  });
}

export function useTeamAssessments() {
  return useQuery<TeamAssessment[]>({
    queryKey: ['assessments', 'team'],
    queryFn: () => api.get('/assessments/team/list'),
  });
}

// ── Mutations ────────────────────────────────────────────────────────

export function useSaveSelfDraft() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; status: AssessmentStatus; responsesJson: ResponsesJson; updatedAt: string },
    Error,
    SaveSelfDraftDto
  >({
    mutationFn: (dto) => api.post('/assessments/self/draft', dto),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['assessments', res.id] });
      qc.invalidateQueries({ queryKey: ['assessments', 'me'] });
    },
  });
}

export function useSubmitSelf() {
  const qc = useQueryClient();
  return useMutation<AssessmentListItem, Error, SubmitSelfAssessmentDto>({
    mutationFn: (dto) => api.post('/assessments/self/submit', dto),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['assessments', res.id] });
      qc.invalidateQueries({ queryKey: ['assessments', 'me'] });
      qc.invalidateQueries({ queryKey: ['assessments', 'team'] });
    },
  });
}

export function useRequestArtifactUpload() {
  return useMutation<UploadUrlResponse, Error, RequestUploadUrlDto>({
    mutationFn: (dto) => api.post('/artifacts/upload-url', dto),
  });
}

/**
 * PUTs the raw file bytes to the signed upload URL returned by
 * `/artifacts/upload-url`. The URL is returned as a relative path rooted
 * at the assessment-service; we prepend the `/api/assessment` rewrite
 * prefix if the URL starts with `/`.
 */
export function useUploadArtifact() {
  return useMutation<
    void,
    Error,
    { uploadUrl: string; file: File; contentType: string; headers?: Record<string, string> }
  >({
    mutationFn: async ({ uploadUrl, file, contentType, headers }) => {
      const url = uploadUrl.startsWith('/') ? `/api/assessment${uploadUrl}` : uploadUrl;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': contentType, ...(headers ?? {}) },
        body: file,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Upload failed (${res.status})`);
      }
    },
  });
}
