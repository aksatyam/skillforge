/**
 * GET /api/session/sso/start?returnTo=/dashboard
 *
 * OIDC authorization-code + PKCE start endpoint (ADR-009 / Sprint 6 #1).
 *
 * Flow:
 *   1. Generate a CSRF `state` (32 random bytes, hex) and a PKCE
 *      `code_verifier` (43+ chars of base64url). Derive `code_challenge`
 *      = BASE64URL(SHA256(verifier)) and fix method S256 (non-optional).
 *   2. Store state + verifier + the caller's `returnTo` path in three
 *      short-lived httpOnly cookies (10 min TTL, SameSite=Lax so the
 *      Keycloak redirect back to us re-sends them).
 *   3. Redirect (302) to Keycloak's authorize URL.
 *
 * The callback route reads the cookies back and validates state.
 *
 * NOTE: SAML 2.0 is deferred to Phase 3 per ADR-009. This endpoint
 * handles OIDC only.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as crypto from 'node:crypto';
import {
  SSO_STATE_COOKIE,
  SSO_VERIFIER_COOKIE,
  SSO_RETURN_TO_COOKIE,
  ssoStateCookieAttrs,
  keycloakAuthorizeUrl,
  appBaseUrl,
  sanitizeReturnTo,
} from '@/lib/sso-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** base64url (RFC 4648 §5) without padding. */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** PKCE S256 challenge: BASE64URL(SHA256(verifier)). */
function s256Challenge(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const returnToRaw = url.searchParams.get('returnTo') ?? '/dashboard';
  const returnTo = sanitizeReturnTo(returnToRaw);

  // CSRF state — 32 bytes hex, 64 chars
  const state = crypto.randomBytes(32).toString('hex');
  // PKCE verifier — 32 bytes → 43 chars base64url (spec minimum is 43)
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = s256Challenge(verifier);

  const redirectUri = `${appBaseUrl()}/api/session/sso/callback`;
  const clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'skillforge-web';

  const authorize = keycloakAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
    scope: 'openid email profile',
  });

  const res = NextResponse.redirect(authorize, 302);
  const attrs = ssoStateCookieAttrs();
  // NextResponse.cookies.set preserves SameSite/Secure/httpOnly flags
  res.cookies.set(SSO_STATE_COOKIE, state, attrs);
  res.cookies.set(SSO_VERIFIER_COOKIE, verifier, attrs);
  res.cookies.set(SSO_RETURN_TO_COOKIE, returnTo, attrs);
  // touch cookies() to keep Next from warning about unused helper in some setups
  void cookies;
  return res;
}
