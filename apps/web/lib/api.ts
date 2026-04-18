/**
 * Typed API client for the SkillForge web app.
 *
 * Auth model: JWTs live in httpOnly cookies set by our Next.js origin
 * (see `app/api/session/*`). The `/api/assessment/*` catch-all Route
 * Handler reads the cookie and forwards it as `Authorization: Bearer`
 * before proxying upstream. It also handles silent refresh on 401.
 *
 * This client therefore no longer:
 *   - reads `sessionStorage` for a token
 *   - attaches an Authorization header
 *   - attempts refresh itself
 *
 * On 401 we clear the React Query cache and redirect to /login.
 */
import type { QueryClient } from '@tanstack/react-query';

const API_PREFIX = '/api/assessment';

// Registered at app mount by `Providers` so the 401 handler can flush cache.
let queryClientRef: QueryClient | null = null;
export function registerQueryClient(qc: QueryClient): void {
  queryClientRef = qc;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  // `credentials: 'same-origin'` (the default) sends our BFF cookies,
  // but the proxy doesn't need them — it reads `sf_access` server-side.
  // We keep the default so the browser and proxy agree on cookie handling.
  const res = await fetch(`${API_PREFIX}${path}`, { ...init, headers });

  if (res.status === 401) {
    queryClientRef?.clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError('Not authenticated', 401);
  }

  if (res.status === 204) return undefined as T;

  let body: Json = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      /* leave as null — caller may not care */
    }
  }

  if (!res.ok) {
    const msg =
      (typeof body === 'object' && body && 'message' in body
        ? Array.isArray((body as { message: unknown }).message)
          ? (body as { message: string[] }).message.join('; ')
          : String((body as { message: string }).message)
        : null) ?? `HTTP ${res.status}`;
    throw new ApiError(
      msg,
      res.status,
      (body as { code?: string } | null)?.code,
      (body as { path?: string } | null)?.path,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body == null ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body == null ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body == null ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
