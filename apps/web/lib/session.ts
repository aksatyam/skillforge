/**
 * Client-side session utilities.
 *
 * JWTs now live in httpOnly cookies and are NOT readable from JS. Role- and
 * tenant-based UI gates must use `useMe()` (the typed `/auth/me` query) —
 * the old `getCurrentUser()` / `hasRole()` helpers that decoded the token
 * are intentionally removed.
 *
 * What remains:
 *   - `hasSession()`   — one-shot fetch to `/api/session/me` (boolean)
 *   - `useHasSession()` — reactive hook version, for shell-level guards
 *   - `clearSession()` — POSTs `/api/session/logout` to revoke + clear cookies
 */
'use client';

import { useEffect, useState } from 'react';

/**
 * Probe the session by hitting the BFF `/api/session/me` endpoint.
 * Returns true iff the cookie is valid and the upstream returned 200.
 */
export async function hasSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/session/me', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Reactive session probe for use in client components (e.g. the app shell).
 *
 * Returns:
 *   - `null`  — probe in flight (render a spinner)
 *   - `true`  — signed in
 *   - `false` — not signed in (caller should redirect)
 */
export function useHasSession(): boolean | null {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    hasSession().then((ok) => {
      if (active) setState(ok);
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}

/**
 * Sign out: POST to `/api/session/logout` which revokes the refresh token
 * upstream and deletes both cookies. Resolves even if the call fails so the
 * UI can always return to the login screen.
 */
export async function clearSession(): Promise<void> {
  try {
    await fetch('/api/session/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    /* ignore — the user is logging out either way */
  }
}
