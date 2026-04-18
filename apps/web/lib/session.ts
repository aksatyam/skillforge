import { decodeJwt } from 'jose';
import type { JwtClaims, UserRole } from '@skillforge/shared-types';

/**
 * Client-side session utilities. Reads the JWT from sessionStorage (dev stub).
 * In production, tokens live in httpOnly cookies and we resolve session via a
 * server-side route handler.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('sf:access');
}

export function getCurrentUser(): JwtClaims | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    return decodeJwt(token) as unknown as JwtClaims;
  } catch {
    return null;
  }
}

export function hasRole(required: UserRole | UserRole[]): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const roles = Array.isArray(required) ? required : [required];
  return roles.includes(user.role);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('sf:access');
  sessionStorage.removeItem('sf:refresh');
}
