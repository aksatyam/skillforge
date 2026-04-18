'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateFrameworkDto, UpsertRoleMappingDto } from '@skillforge/shared-types';

export type FrameworkSummary = {
  id: string;
  name: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  maturityLevelsJson: Array<{ level: number; name: string; description: string }>;
  createdAt: string;
  updatedAt: string;
  _count: { roleMappings: number };
};

export type FrameworkDetail = FrameworkSummary & {
  roleMappings: Array<{
    id: string;
    roleFamily: string;
    targetLevel: number;
    assessmentCriteriaJson: unknown;
  }>;
};

export function useFrameworks() {
  return useQuery<FrameworkSummary[]>({
    queryKey: ['frameworks'],
    queryFn: () => api.get('/frameworks'),
  });
}

export function useFramework(id: string | undefined) {
  return useQuery<FrameworkDetail>({
    queryKey: ['frameworks', id],
    queryFn: () => api.get(`/frameworks/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateFramework() {
  const qc = useQueryClient();
  return useMutation<FrameworkSummary, Error, CreateFrameworkDto>({
    mutationFn: (dto) => api.post('/frameworks', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frameworks'] }),
  });
}

export function useUpsertRoleMapping(frameworkId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, UpsertRoleMappingDto>({
    mutationFn: (dto) => api.put(`/frameworks/${frameworkId}/role-mappings`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frameworks', frameworkId] }),
  });
}

export function usePublishFramework() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.post(`/frameworks/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frameworks'] }),
  });
}
