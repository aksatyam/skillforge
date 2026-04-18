/**
 * GET /api/session/me
 *
 * Reads `sf_access` and proxies to the assessment service `/auth/me`.
 * On 401 we do NOT attempt a silent refresh here — the `/api/assessment/*`
 * catch-all handles that for all other endpoints. This endpoint is a cheap
 * "is my session still valid?" probe; returning 401 lets the client redirect.
 *
 * Body passthrough preserves the shape of `MeResponse`.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE, assessmentApiBase } from '@/lib/session-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${assessmentApiBase()}/auth/me`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'Auth service unreachable' }, { status: 502 });
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
