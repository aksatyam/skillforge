/**
 * Vitest global setup — seeds the env vars that `@skillforge/db` and
 * other infra packages read at module-load time, so importing them from
 * a unit test never blows up on a missing connection string.
 *
 * Prisma is lazy: it only opens a socket on first query. Tests never
 * issue real queries (they mock the client via `vi.mock`), so these
 * placeholder URLs are never dialed.
 *
 * Loaded via `test.setupFiles` in vitest.config.ts.
 */
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.DATABASE_URL_ADMIN ??= process.env.DATABASE_URL;

// JWT secret is read by multiple services (auth, storage tokens). Giving
// it a long, obviously-non-prod value keeps prod-only length guards
// (>=32 chars) satisfied without leaking test secrets into real logs.
process.env.JWT_SECRET ??= 'test-jwt-secret-not-for-production-use-xxxxxxxxxx';

// Storage bridge secret — same rationale.
process.env.SSO_BRIDGE_SECRET ??= 'test-sso-bridge-secret-not-for-production-use-xx';

// Redis — tests that reach BullMQ code paths stub the queue, so the URL
// is just a placeholder to satisfy `new IORedis(url)` constructors that
// validate format.
process.env.REDIS_URL ??= 'redis://localhost:6379/0';
