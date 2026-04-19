/**
 * SSO-specific cookie + URL helpers.
 *
 * Three short-lived cookies are used during the OIDC dance:
 *   - `sf_sso_state`     — CSRF state (hex)
 *   - `sf_sso_verifier`  — PKCE code_verifier (base64url)
 *   - `sf_sso_return_to` — where to send the user after successful login
 *
 * All three are httpOnly, SameSite=Lax, 10-minute TTL. Secure in prod.
 * Path `/api/session/sso` so they only travel with SSO-flow requests.
 *
 * Keycloak URL helpers keep the query-string construction in one place so
 * start + logout don't drift.
 */
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { isProd } from '@/lib/session-cookies';

export const SSO_STATE_COOKIE = 'sf_sso_state';
export const SSO_VERIFIER_COOKIE = 'sf_sso_verifier';
export const SSO_RETURN_TO_COOKIE = 'sf_sso_return_to';
export const SSO_COOKIE_PATH = '/api/session/sso';
export const SSO_COOKIE_MAX_AGE_SEC = 60 * 10; // 10 minutes

type CookieAttrs = Omit<ResponseCookie, 'name' | 'value'>;

export function ssoStateCookieAttrs(maxAge = SSO_COOKIE_MAX_AGE_SEC): CookieAttrs {
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: SSO_COOKIE_PATH,
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export function clearSsoCookieAttrs(): CookieAttrs {
  return ssoStateCookieAttrs(0);
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'http://localhost:3000';
}

export function keycloakBaseUrl(): string {
  return process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
}

export function keycloakRealm(): string {
  return process.env.KEYCLOAK_REALM ?? 'qualtech';
}

export function keycloakRealmUrl(): string {
  return `${keycloakBaseUrl()}/realms/${keycloakRealm()}`;
}

export function keycloakAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: args.scope,
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${keycloakRealmUrl()}/protocol/openid-connect/auth?${params.toString()}`;
}

export function keycloakTokenUrl(): string {
  return `${keycloakRealmUrl()}/protocol/openid-connect/token`;
}

export function keycloakLogoutUrl(args: {
  idTokenHint?: string;
  postLogoutRedirectUri: string;
}): string {
  const params = new URLSearchParams({
    post_logout_redirect_uri: args.postLogoutRedirectUri,
  });
  if (args.idTokenHint) params.set('id_token_hint', args.idTokenHint);
  return `${keycloakRealmUrl()}/protocol/openid-connect/logout?${params.toString()}`;
}

/**
 * Accept only same-origin absolute paths to prevent open-redirect.
 * Anything that doesn't look like `/foo` falls back to `/dashboard`.
 */
export function sanitizeReturnTo(raw: string): string {
  if (!raw) return '/dashboard';
  // reject protocol-relative and absolute URLs
  if (raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return '/dashboard';
  if (!raw.startsWith('/')) return '/dashboard';
  // cap length — defensive
  return raw.length > 512 ? '/dashboard' : raw;
}
