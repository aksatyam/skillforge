/**
 * GET /api/session/sso/logout
 *
 * Clears our SkillForge cookies and redirects to Keycloak's end-session
 * endpoint with `post_logout_redirect_uri=${APP_BASE_URL}/login`.
 *
 * PHASE-3 TODO: we do not currently persist the `id_token` from the
 * callback, so the `id_token_hint` parameter is omitted. Keycloak will
 * still log out the user's realm session via the browser's KEYCLOAK_SESSION
 * cookie — this works for the standard SSO-logout case — but official
 * single-sign-out (back-channel logout) should pass id_token_hint when we
 * start storing the id_token server-side. See ADR-009 follow-ups.
 */
import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAccessCookieAttrs,
  clearRefreshCookieAttrs,
} from '@/lib/session-cookies';
import { appBaseUrl, keycloakLogoutUrl } from '@/lib/sso-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const postLogout = `${appBaseUrl()}/login`;
  const target = keycloakLogoutUrl({ postLogoutRedirectUri: postLogout });

  const res = NextResponse.redirect(target, 302);
  res.cookies.set(ACCESS_COOKIE, '', clearAccessCookieAttrs());
  res.cookies.set(REFRESH_COOKIE, '', clearRefreshCookieAttrs());
  return res;
}
