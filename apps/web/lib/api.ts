/**
 * Typed API client for the SkillForge web app.
 *
 * Responsibilities:
 *   - Attach bearer token to every request
 *   - On 401, attempt a single silent refresh; retry once
 *   - Normalize error responses
 *   - Parse JSON defensively
 *
 * All routes go through `/api/assessment/*` → rewritten by next.config.mjs
 * to the assessment-service. Other services (Phase 2) will add their own
 * rewrite prefixes.
 */
import type { QueryClient } from '@tanstack/react-query';
import { clearSession } from '@/lib/session';

const API_PREFIX = '/api/assessment';

// Registered at app mount by `Providers` so 401 handler can flush the cache
let queryClientRef: QueryClient | null = null;
export function registerQueryClient(qc: QueryClient) {
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

function getAccess(): string | null {
  return typeof window === 'undefined' ? null : sessionStorage.getItem('sf:access');
}

function setTokens(access: string, refresh: string) {
  sessionStorage.setItem('sf:access', access);
  sessionStorage.setItem('sf:refresh', refresh);
}

async function refreshSilently(): Promise<boolean> {
  const refresh = sessionStorage.getItem('sf:refresh');
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_PREFIX}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const tokens = await res.json();
    setTokens(tokens.accessToken, tokens.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  _retried = false,
): Promise<T> {
  const access = getAccess();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (access) headers.set('authorization', `Bearer ${access}`);

  const res = await fetch(`${API_PREFIX}${path}`, { ...init, headers });

  if (res.status === 401 && !_retried) {
    if (await refreshSilently()) {
      return request<T>(path, init, true);
    }
    clearSession();
    queryClientRef?.clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError('Not authenticated', 401);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  let body: Json = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      /* leave as text */
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
