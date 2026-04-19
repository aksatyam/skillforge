/**
 * POST /api/session/logout
 *
 * Revokes the refresh token upstream (best-effort; logout succeeds locally
 * even if the service is unreachable) and clears both cookies.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAccessCookieAttrs,
  clearRefreshCookieAttrs,
  assessmentApiBase,
  checkSameOrigin,
} from '@/lib/session-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse<{ ok: true } | { ok: false; error: string }>> {
  const originError = checkSameOrigin(req);
  if (originError) {
    return NextResponse.json({ ok: false, error: originError }, { status: 403 });
  }

  const jar = cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;

  if (refresh) {
    try {
      await fetch(`${assessmentApiBase()}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
        cache: 'no-store',
      });
    } catch {
      /* best-effort — cookie clear still proceeds */
    }
  }

  jar.set(ACCESS_COOKIE, '', clearAccessCookieAttrs());
  jar.set(REFRESH_COOKIE, '', clearRefreshCookieAttrs());

  return NextResponse.json({ ok: true });
}
