'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginDtoSchema, type LoginDto } from '@skillforge/shared-types';

// NEXT_PUBLIC_ prefix makes this available at build-time in the client bundle.
const SSO_ENABLED = process.env.NEXT_PUBLIC_SSO_ENABLED === 'true';

/** Friendly strings for the ?sso_error=... codes emitted by the callback route. */
const SSO_ERROR_LABELS: Record<string, string> = {
  state_mismatch: 'Login expired or was tampered with. Please try again.',
  state_missing: 'Login session lost. Please try signing in again.',
  missing_params: 'Single sign-on did not complete. Please try again.',
  token_exchange_failed: 'Identity provider rejected the sign-in.',
  bridge_failed: 'Could not complete sign-in with SkillForge. Contact your admin.',
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  // Surface SSO errors posted via ?sso_error=...
  useEffect(() => {
    const code = searchParams.get('sso_error');
    if (!code) return;
    setServerError(SSO_ERROR_LABELS[code] ?? 'Single sign-on failed. Please try again.');
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({ resolver: zodResolver(LoginDtoSchema) });

  async function onSubmit(data: LoginDto) {
    setServerError(null);
    try {
      // BFF login: the Route Handler sets httpOnly cookies. The response
      // body is just `{ ok: true }` — tokens never touch JS.
      const res = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => ({}))) as
        | { ok: true }
        | { ok: false; error?: string };
      if (!res.ok || !('ok' in body) || body.ok !== true) {
        const msg = 'error' in body && body.error ? body.error : 'Login failed';
        throw new Error(msg);
      }
      router.push('/dashboard');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-2xl font-bold text-brand-navy">SkillForge</h1>
        <p className="mb-6 text-sm text-brand-medium">Sign in to your account</p>

        {SSO_ENABLED && (
          <>
            <a
              href="/api/session/sso/start?returnTo=/dashboard"
              className="mb-4 flex w-full items-center justify-center rounded-md border border-brand-navy bg-white py-2 text-sm font-semibold text-brand-navy hover:bg-brand-navy hover:text-white"
            >
              Sign in with SSO
            </a>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-neutral-200" />
              <span className="text-xs uppercase tracking-wide text-brand-medium">or</span>
              <span className="h-px flex-1 bg-neutral-200" />
            </div>
          </>
        )}

        <label className="mb-3 block">
          <span className="text-sm font-medium text-brand-dark">Email</span>
          <input
            type="email"
            autoComplete="email"
            {...register('email')}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
          />
          {errors.email && (
            <span className="mt-1 text-xs text-brand-red">{errors.email.message}</span>
          )}
        </label>

        <label className="mb-4 block">
          <span className="text-sm font-medium text-brand-dark">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            {...register('password')}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
          />
          {errors.password && (
            <span className="mt-1 text-xs text-brand-red">{errors.password.message}</span>
          )}
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
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="mt-4 text-center text-xs text-brand-medium">
          Dev-only auth. Production uses Keycloak SSO (ADR-009).
        </p>
      </form>
    </main>
  );
}
