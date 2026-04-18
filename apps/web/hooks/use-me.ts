'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MeResponse } from '@skillforge/shared-types';

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/auth/me'),
    staleTime: 5 * 60 * 1000,
  });
}
