/**
 * POST /api/session/accept-invite
 *
 * Validates { token, password } with zod, proxies to the assessment service
 * `/auth/accept-invite`, and on success sets both session cookies just like
 * `/api/session/login`. The new user is effectively signed in.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AcceptInviteDtoSchema, type AuthTokens } from '@skillforge/shared-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieAttrs,
  refreshCookieAttrs,
  assessmentApiBase,
  checkSameOrigin,
} from '@/lib/session-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ErrorBody = { ok: false; error: string };
type SuccessBody = { ok: true };

export async function POST(req: Request): Promise<NextResponse<ErrorBody | SuccessBody>> {
  const originError = checkSameOrigin(req);
  if (originError) {
    return NextResponse.json({ ok: false, error: originError }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AcceptInviteDtoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${assessmentApiBase()}/auth/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Auth service unreachable' },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    let msg = 'Failed to accept invite';
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (body.message) {
        msg = Array.isArray(body.message) ? body.message.join('; ') : body.message;
      }
    } catch {
      /* non-JSON */
    }
    return NextResponse.json({ ok: false, error: msg }, { status: upstream.status });
  }

  const tokens = (await upstream.json()) as AuthTokens;
  const jar = cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, accessCookieAttrs(tokens.expiresInSec));
  jar.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieAttrs());

  return NextResponse.json({ ok: true });
}
