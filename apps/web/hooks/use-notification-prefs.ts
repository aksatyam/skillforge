'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  NotificationPrefs,
  UpdateNotificationPrefsDto,
} from '@skillforge/shared-types';

const KEY = ['notification-prefs'] as const;

export function useNotificationPrefs() {
  return useQuery<NotificationPrefs>({
    queryKey: KEY,
    queryFn: () => api.get<NotificationPrefs>('/notifications/preferences'),
    staleTime: 60 * 1000,
  });
}

/**
 * Optimistic patch. Applies the partial update to the cached value immediately,
 * rolls back on error, and invalidates on settle so we re-sync with the server
 * (in case the server normalized something).
 */
export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation<
    NotificationPrefs,
    Error,
    UpdateNotificationPrefsDto,
    { previous?: NotificationPrefs }
  >({
    mutationFn: (patch) =>
      api.patch<NotificationPrefs>('/notifications/preferences', patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<NotificationPrefs>(KEY);
      if (previous) {
        const next: NotificationPrefs = {
          reminders: {
            enabled: patch.reminders?.enabled ?? previous.reminders.enabled,
            digestFrequency:
              patch.reminders?.digestFrequency ?? previous.reminders.digestFrequency,
          },
          assignment: {
            enabled: patch.assignment?.enabled ?? previous.assignment.enabled,
          },
          managerReview: {
            enabled: patch.managerReview?.enabled ?? previous.managerReview.enabled,
          },
        };
        qc.setQueryData<NotificationPrefs>(KEY, next);
      }
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData<NotificationPrefs>(KEY, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
