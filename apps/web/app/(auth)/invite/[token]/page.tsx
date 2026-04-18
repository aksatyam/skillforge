'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AcceptInviteDtoSchema, type AcceptInviteDto } from '@skillforge/shared-types';
import { api } from '@/lib/api';
import type { AuthTokens } from '@skillforge/shared-types';

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInviteDto>({
    resolver: zodResolver(AcceptInviteDtoSchema),
    defaultValues: { token, password: '' },
  });

  async function onSubmit(dto: AcceptInviteDto) {
    setServerError(null);
    try {
      const tokens = await api.post<AuthTokens>('/auth/accept-invite', dto);
      sessionStorage.setItem('sf:access', tokens.accessToken);
      sessionStorage.setItem('sf:refresh', tokens.refreshToken);
      router.push('/dashboard');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-2xl font-bold text-brand-navy">Welcome to SkillForge</h1>
        <p className="mb-6 text-sm text-brand-medium">Set your password to activate your account</p>

        <input type="hidden" {...register('token')} />

        <label className="mb-4 block">
          <span className="text-sm font-medium text-brand-dark">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            {...register('password')}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
          />
          {errors.password && (
            <span className="mt-1 text-xs text-brand-red">{errors.password.message}</span>
          )}
          <p className="mt-1 text-xs text-brand-medium">
            At least 10 chars, with upper, lower, digit, and symbol.
          </p>
        </label>

        {serverError && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-brand-navy py-2 text-sm font-semibold text-white hover:bg-brand-blue disabled:opacity-50"
        >
          {isSubmitting ? 'Activating…' : 'Activate account & sign in'}
        </button>
      </form>
    </main>
  );
}
