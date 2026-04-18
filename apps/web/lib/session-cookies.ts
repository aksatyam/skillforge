/**
 * Server-only helpers for the BFF cookie bridge.
 *
 * Tokens live in two httpOnly cookies set by our Next.js origin:
 *   - `sf_access`  (15 min, path=/)           — forwarded as Bearer by the
 *                                                `/api/assessment/*` proxy
 *   - `sf_refresh` (7 days, path=/api/session) — only sent to the session
 *                                                endpoints that actually
 *                                                need to rotate tokens
 *
 * Never expose these to client JS. Only Route Handlers import this file.
 */
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

export const ACCESS_COOKIE = 'sf_access';
export const REFRESH_COOKIE = 'sf_refresh';

export const ACCESS_PATH = '/';
export const REFRESH_PATH = '/api/session';

/**
 * 15 min access / 7 day refresh. Keep these in sync with the service-side
 * JWT_ACCESS_TTL / JWT_REFRESH_TTL defaults; exact figures are not critical
 * because the service rejects expired tokens regardless of cookie TTL.
 */
export const ACCESS_MAX_AGE_SEC = 60 * 15;
export const REFRESH_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export function assessmentApiBase(): string {
  return process.env.ASSESSMENT_API ?? 'http://localhost:4001';
}

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

type CookieAttrs = Omit<ResponseCookie, 'name' | 'value'>;

function baseAttrs(): Pick<CookieAttrs, 'httpOnly' | 'secure' | 'sameSite' | 'domain'> {
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  };
}

export function accessCookieAttrs(maxAge = ACCESS_MAX_AGE_SEC): CookieAttrs {
  return { ...baseAttrs(), path: ACCESS_PATH, maxAge };
}

export function refreshCookieAttrs(maxAge = REFRESH_MAX_AGE_SEC): CookieAttrs {
  return { ...baseAttrs(), path: REFRESH_PATH, maxAge };
}

/** Clear attrs: same path + domain, maxAge=0, empty value. */
export function clearAccessCookieAttrs(): CookieAttrs {
  return { ...baseAttrs(), path: ACCESS_PATH, maxAge: 0 };
}
export function clearRefreshCookieAttrs(): CookieAttrs {
  return { ...baseAttrs(), path: REFRESH_PATH, maxAge: 0 };
}
