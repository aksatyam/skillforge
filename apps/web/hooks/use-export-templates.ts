'use client';

/**
 * TanStack Query hooks for Sprint 6 feature #3 — HR-editable CSV export
 * templates. The backend stores them on `organization.settings_json.exportTemplates`
 * and merges them with 4 built-ins (default, SAP SuccessFactors, Workday,
 * Oracle HCM). This hook drives the HR templates page and the "Export as…"
 * picker on the cycle detail page.
 *
 * Backend surface:
 *   GET    /export/templates
 *   PUT    /export/templates/:id
 *   DELETE /export/templates/:id
 *
 * Note: `builtin` is server-controlled. We don't let the client PUT it; the
 * `upsertTemplateBody` type omits it deliberately.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ExportTemplate,
  UpsertExportTemplateDto,
} from '@skillforge/shared-types';
import { api } from '@/lib/api';

const QK = ['export', 'templates'] as const;

export function useExportTemplates() {
  return useQuery<ExportTemplate[]>({
    queryKey: QK,
    queryFn: () => api.get<ExportTemplate[]>('/export/templates'),
    staleTime: 60_000,
  });
}

export function useUpsertExportTemplate() {
  const qc = useQueryClient();
  return useMutation<ExportTemplate, Error, UpsertExportTemplateDto>({
    mutationFn: (dto) =>
      api.put<ExportTemplate>(`/export/templates/${encodeURIComponent(dto.id)}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useDeleteExportTemplate() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete(`/export/templates/${encodeURIComponent(id)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

/**
 * The dot-paths HR can choose from in the column dropdown. Mirrors the
 * server-side `columnSourcePaths` allowlist in
 * services/assessment-service/src/export/export.templates.ts. Keeping a
 * copy here (rather than importing from the service) avoids a cross-boundary
 * dep — the server is still authoritative.
 */
export const COLUMN_SOURCE_PATHS = [
  'user.id',
  'user.name',
  'user.email',
  'user.roleFamily',
  'user.designation',
  'user.manager.name',
  'user.manager.email',
  'selfScore',
  'managerScore',
  'peerScore',
  'aiScore',
  'compositeScore',
  'status',
  'submittedAt',
  'finalizedAt',
  'managerRationale',
  'cycle.name',
  'cycle.endDate',
] as const;

export type ColumnSourcePath = (typeof COLUMN_SOURCE_PATHS)[number];
