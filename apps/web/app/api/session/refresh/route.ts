/**
 * POST /api/session/refresh
 *
 * Reads the `sf_refresh` cookie, calls the assessment service `/auth/refresh`,
 * and on success rotates both cookies. On failure, clears both cookies so the
 * client stops assuming it's signed in.
 *
 * Shared refresh logic used by the `/api/assessment/*` proxy is exported via
 * `refreshTokens()` for in-process reuse (no internal HTTP hop needed).
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { AuthTokens } from '@skillforge/shared-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieAttrs,
  refreshCookieAttrs,
  clearAccessCookieAttrs,
  clearRefreshCookieAttrs,
  assessmentApiBase,
  checkSameOrigin,
} from '@/lib/session-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SuccessBody = { ok: true };
type ErrorBody = { ok: false; error: string };

/**
 * Pure refresh: call upstream with a given refreshToken string.
 * Returns the new token pair or null. Used by both the Route Handler below
 * and the `/api/assessment/*` catch-all on 401.
 */
export async function refreshWithUpstream(refreshToken: string): Promise<AuthTokens | null> {
  try {
    const res = await fetch(`${assessmentApiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthTokens;
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const originError = checkSameOrigin(req);
  if (originError) {
    return NextResponse.json({ ok: false, error: originError }, { status: 403 });
  }

  const jar = cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;

  if (!refresh) {
    return NextResponse.json(
      { ok: false, error: 'No refresh token' },
      { status: 401 },
    );
  }

  const tokens = await refreshWithUpstream(refresh);
  if (!tokens) {
    jar.set(ACCESS_COOKIE, '', clearAccessCookieAttrs());
    jar.set(REFRESH_COOKIE, '', clearRefreshCookieAttrs());
    return NextResponse.json(
      { ok: false, error: 'Refresh failed' },
      { status: 401 },
    );
  }

  jar.set(ACCESS_COOKIE, tokens.accessToken, accessCookieAttrs(tokens.expiresInSec));
  jar.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieAttrs());
  return NextResponse.json({ ok: true });
}
