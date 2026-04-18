/**
 * POST /api/session/login
 *
 * BFF login bridge. Validates input with zod, proxies to the assessment
 * service `/auth/login`, and on success sets two httpOnly cookies:
 *   - `sf_access`  (15 min, path=/)
 *   - `sf_refresh` (7 day, path=/api/session)
 *
 * The response body never contains the tokens — the client only sees
 * `{ ok: true }` or `{ ok: false, error }`. This keeps JWTs out of JS.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LoginDtoSchema, type AuthTokens } from '@skillforge/shared-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieAttrs,
  refreshCookieAttrs,
  assessmentApiBase,
} from '@/lib/session-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ErrorBody = { ok: false; error: string };
type SuccessBody = { ok: true };

export async function POST(req: Request): Promise<NextResponse<ErrorBody | SuccessBody>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = LoginDtoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${assessmentApiBase()}/auth/login`, {
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
    let msg = 'Login failed';
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (body.message) {
        msg = Array.isArray(body.message) ? body.message.join('; ') : body.message;
      }
    } catch {
      /* non-JSON — keep default */
    }
    return NextResponse.json({ ok: false, error: msg }, { status: upstream.status });
  }

  const tokens = (await upstream.json()) as AuthTokens;

  const jar = cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, accessCookieAttrs(tokens.expiresInSec));
  jar.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieAttrs());

  return NextResponse.json({ ok: true });
}
