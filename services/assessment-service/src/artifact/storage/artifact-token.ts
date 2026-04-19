/**
 * Signed tokens for the local-mode artifact upload/download URLs.
 *
 * Sprint 6 audit flagged the previous design (HMAC over `scope:artifactId`
 * with no expiry and a `JWT_SECRET ?? 'dev'` fallback) as a triple risk:
 *
 *   1. No expiry → token stolen today could be replayed next year.
 *   2. No tenant binding → valid token + artifactId from another tenant
 *      would let the caller write into that tenant's `prisma` scope,
 *      which runs outside `withTenant()` in `acceptUpload()`.
 *   3. `'dev'` fallback → if env wasn't set in prod, the service would
 *      silently sign with a known-public string.
 *
 * The replacement is a short-lived JWT (HS256) carrying
 * `{ scope, artifactId, orgId, exp }`. `verifyArtifactToken` returns the
 * decoded claims so the service layer can scope its DB writes via
 * `withTenant(orgId, …)` instead of bypass-mode.
 *
 * Secret hygiene:
 *   - `getSecret()` throws on missing JWT_SECRET — no silent fallback.
 *   - In production we additionally require >= 32 bytes of entropy.
 *
 * TTLs:
 *   - upload   → 15 min (matches S3 presigned PUT window)
 *   - download →  5 min (shorter — URL is often logged by browsers)
 */
import { SignJWT, jwtVerify } from 'jose';

export type ArtifactTokenScope = 'upload' | 'download';

const UPLOAD_TTL_SECONDS = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 5 * 60;

export interface ArtifactTokenClaims {
  scope: ArtifactTokenScope;
  artifactId: string;
  orgId: string;
}

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      'JWT_SECRET is not set — refusing to mint artifact tokens without a signing key',
    );
  }
  if (process.env.NODE_ENV === 'production' && raw.length < 32) {
    throw new Error(
      'JWT_SECRET must be >= 32 characters in production (got ' + raw.length + ')',
    );
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

/**
 * Test-only reset — the secret is memoised for perf, but vitest mutates
 * process.env between tests and needs to re-read it.
 */
export function __resetArtifactTokenSecretCache(): void {
  cachedSecret = null;
}

export async function signArtifactToken(
  scope: ArtifactTokenScope,
  artifactId: string,
  orgId: string,
): Promise<string> {
  const ttl = scope === 'upload' ? UPLOAD_TTL_SECONDS : DOWNLOAD_TTL_SECONDS;
  return new SignJWT({ scope, artifactId, orgId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .setSubject(artifactId)
    .setIssuer('skillforge-artifact')
    .sign(getSecret());
}

/**
 * Verifies a token and enforces the scope + artifactId the caller
 * expected. Returns `null` on any failure (expired, wrong scope,
 * artifact mismatch, tampered signature) so the caller can throw a
 * uniform 403 without leaking which check failed.
 */
export async function verifyArtifactToken(
  token: string,
  expected: { scope: ArtifactTokenScope; artifactId: string },
): Promise<ArtifactTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: 'skillforge-artifact',
      algorithms: ['HS256'],
    });
    const claims = payload as unknown as Partial<ArtifactTokenClaims> & {
      sub?: string;
    };
    if (claims.scope !== expected.scope) return null;
    if (claims.artifactId !== expected.artifactId) return null;
    if (typeof claims.orgId !== 'string' || claims.orgId.length === 0) {
      return null;
    }
    return {
      scope: claims.scope,
      artifactId: claims.artifactId,
      orgId: claims.orgId,
    };
  } catch {
    return null;
  }
}
