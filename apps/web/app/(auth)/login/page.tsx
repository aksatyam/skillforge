'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginDtoSchema, type LoginDto } from '@skillforge/shared-types';

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

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
