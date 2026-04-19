/**
 * GET /api/session/sso/callback?code=...&state=...
 *
 * OIDC redirect target. Validates state, exchanges the authorization
 * code for tokens at Keycloak's token endpoint (with PKCE verifier),
 * then hands the tokens to our assessment-service's /auth/sso/exchange
 * bridge which returns our OWN SkillForge JWT pair. Those go into the
 * same `sf_access` / `sf_refresh` cookies that password login uses —
 * every downstream component is OIDC-agnostic from this point on.
 *
 * On ANY error, we redirect to /login?sso_error=<reason> and wipe the
 * three flow cookies. We never surface Keycloak or bridge detail to
 * the user.
 */
import { NextResponse } from 'next/server';
import type { AuthTokens } from '@skillforge/shared-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieAttrs,
  refreshCookieAttrs,
  assessmentApiBase,
} from '@/lib/session-cookies';
import {
  SSO_STATE_COOKIE,
  SSO_VERIFIER_COOKIE,
  SSO_RETURN_TO_COOKIE,
  clearSsoCookieAttrs,
  keycloakTokenUrl,
  keycloakRealmUrl,
  appBaseUrl,
  sanitizeReturnTo,
} from '@/lib/sso-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type KeycloakTokenResponse = {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in?: number;
  scope?: string;
};

function loginRedirect(reason: string): NextResponse {
  const url = new URL('/login', appBaseUrl());
  url.searchParams.set('sso_error', reason);
  const res = NextResponse.redirect(url.toString(), 302);
  // wipe SSO flow cookies on failure too
  const clear = clearSsoCookieAttrs();
  res.cookies.set(SSO_STATE_COOKIE, '', clear);
  res.cookies.set(SSO_VERIFIER_COOKIE, '', clear);
  res.cookies.set(SSO_RETURN_TO_COOKIE, '', clear);
  return res;
}

/**
 * Shape of the pre-normalised log envelope. We keep ONLY non-secret
 * fields — `error`, `error_description`, `status` — never the token
 * body or the Authorization header. An attacker who can read our server
 * logs shouldn't get any closer to impersonating a user.
 */
function logSsoFailure(
  where: 'keycloak' | 'bridge',
  status: number,
  body: unknown,
): void {
  const maybeObj =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : null;
  const payload = {
    where,
    status,
    error: maybeObj?.error ?? null,
    error_description: maybeObj?.error_description ?? null,
    message: maybeObj?.message ?? null,
  };
  // eslint-disable-next-line no-console
  console.error('[sso/callback] upstream failure', payload);
}

async function exchangeCodeAtKeycloak(
  code: string,
  codeVerifier: string,
): Promise<KeycloakTokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${appBaseUrl()}/api/session/sso/callback`,
    client_id: process.env.KEYCLOAK_CLIENT_ID ?? 'skillforge-web',
    code_verifier: codeVerifier,
  });
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  if (clientSecret) body.set('client_secret', clientSecret);

  try {
    const res = await fetch(keycloakTokenUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: body.toString(),
      cache: 'no-store',
    });
    if (!res.ok) {
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        /* non-JSON error body — the status code is still informative */
      }
      logSsoFailure('keycloak', res.status, parsed);
      return null;
    }
    return (await res.json()) as KeycloakTokenResponse;
  } catch (err) {
    // Network / DNS failure, rarely seen in steady state but worth
    // logging — a mistyped KEYCLOAK_URL lands here silently otherwise.
    // eslint-disable-next-line no-console
    console.error('[sso/callback] keycloak fetch threw', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function bridgeToAssessment(
  tokens: KeycloakTokenResponse,
): Promise<AuthTokens | null> {
  const bridgeSecret = process.env.SSO_BRIDGE_SECRET;
  if (!bridgeSecret) {
    // eslint-disable-next-line no-console
    console.error(
      '[sso/callback] SSO_BRIDGE_SECRET is unset — refusing to bridge',
    );
    return null;
  }

  try {
    const res = await fetch(`${assessmentApiBase()}/auth/sso/exchange`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-sso-bridge-secret': bridgeSecret,
      },
      body: JSON.stringify({
        idToken: tokens.id_token,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        issuer: keycloakRealmUrl(),
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        /* non-JSON */
      }
      logSsoFailure('bridge', res.status, parsed);
      return null;
    }
    return (await res.json()) as AuthTokens;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[sso/callback] bridge fetch threw', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);

  const errParam = url.searchParams.get('error');
  if (errParam) return loginRedirect(errParam);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return loginRedirect('missing_params');

  // Read flow cookies — raw strings (no decoding needed)
  const cookieHeader = req.headers.get('cookie') ?? '';
  const flowState = readCookie(cookieHeader, SSO_STATE_COOKIE);
  const verifier = readCookie(cookieHeader, SSO_VERIFIER_COOKIE);
  const returnToCookie = readCookie(cookieHeader, SSO_RETURN_TO_COOKIE);

  if (!flowState || !verifier) return loginRedirect('state_missing');
  if (!timingSafeEq(flowState, state)) return loginRedirect('state_mismatch');

  const kcTokens = await exchangeCodeAtKeycloak(code, verifier);
  if (!kcTokens) return loginRedirect('token_exchange_failed');

  const sfTokens = await bridgeToAssessment(kcTokens);
  if (!sfTokens) return loginRedirect('bridge_failed');

  const returnTo = sanitizeReturnTo(returnToCookie ?? '/dashboard');
  const res = NextResponse.redirect(new URL(returnTo, appBaseUrl()).toString(), 302);

  // Set our own session cookies
  res.cookies.set(ACCESS_COOKIE, sfTokens.accessToken, accessCookieAttrs(sfTokens.expiresInSec));
  res.cookies.set(REFRESH_COOKIE, sfTokens.refreshToken, refreshCookieAttrs());

  // Clear the three SSO flow cookies (they've served their purpose)
  const clear = clearSsoCookieAttrs();
  res.cookies.set(SSO_STATE_COOKIE, '', clear);
  res.cookies.set(SSO_VERIFIER_COOKIE, '', clear);
  res.cookies.set(SSO_RETURN_TO_COOKIE, '', clear);

  return res;
}

/** Tiny cookie reader — avoids pulling in a parsing dep. */
function readCookie(header: string, name: string): string | null {
  if (!header) return null;
  const prefix = `${name}=`;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

/** Constant-time string compare (ASCII). */
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
