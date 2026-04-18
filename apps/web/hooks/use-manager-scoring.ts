'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  SubmitManagerAssessmentDtoSchema,
  type SubmitManagerAssessmentDto,
} from '@skillforge/shared-types';
import type { AssessmentListItem, ArtifactSummary } from '@/hooks/use-assessments';

export function useArtifactsForAssessment(assessmentId: string | undefined) {
  return useQuery<ArtifactSummary[]>({
    queryKey: ['artifacts', 'by-assessment', assessmentId],
    queryFn: () => api.get(`/artifacts/by-assessment/${assessmentId}`),
    enabled: Boolean(assessmentId),
  });
}

export function useSubmitManagerScore() {
  const qc = useQueryClient();
  return useMutation<AssessmentListItem, Error, SubmitManagerAssessmentDto>({
    mutationFn: (dto) => {
      const parsed = SubmitManagerAssessmentDtoSchema.parse(dto);
      return api.post('/assessments/manager/submit', parsed);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['assessments', res.id] });
      qc.invalidateQueries({ queryKey: ['assessments', 'team'] });
      qc.invalidateQueries({ queryKey: ['artifacts', 'by-assessment', res.id] });
    },
  });
}
