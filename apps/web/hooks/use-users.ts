'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  InviteUserDto,
  UpdateUserDto,
  UserResponse,
  UserRole,
} from '@skillforge/shared-types';

type ListFilter = { role?: UserRole; q?: string };

export function useUsers(filter: ListFilter = {}) {
  const params = new URLSearchParams();
  if (filter.role) params.set('role', filter.role);
  if (filter.q) params.set('q', filter.q);
  const query = params.toString() ? `?${params}` : '';

  return useQuery<UserResponse[]>({
    queryKey: ['users', filter],
    queryFn: () => api.get<UserResponse[]>(`/users${query}`),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation<
    { user: UserResponse; inviteToken: string; inviteExpiresAt: string },
    Error,
    InviteUserDto
  >({
    mutationFn: (dto) =>
      api.post<{ user: UserResponse; inviteToken: string; inviteExpiresAt: string }>(
        '/users/invite',
        dto,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation<UserResponse, Error, { id: string; dto: UpdateUserDto }>({
    mutationFn: ({ id, dto }) => api.patch<UserResponse>(`/users/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useReissueInvite() {
  return useMutation<{ token: string; expiresAt: string }, Error, string>({
    mutationFn: (userId) =>
      api.post<{ token: string; expiresAt: string }>(
        `/users/${userId}/reissue-invite`,
      ),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
