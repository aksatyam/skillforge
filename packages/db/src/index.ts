/**
 * @skillforge/db
 *
 * Exports TWO Prisma clients:
 *
 *   1. `prisma` — normal client, runs as the `skillforge` DB role which is
 *      subject to RLS. All tenant-scoped reads/writes go through this.
 *
 *   2. `prismaAdmin` — admin client, runs as the `skillforge_admin` role
 *      which has BYPASSRLS. Use ONLY for:
 *        - Pre-tenant auth flows (login, refresh, accept-invite) where
 *          we don't yet know which tenant to scope to.
 *        - Audit log inserts from the HTTP interceptor.
 *        - Cross-tenant support/super_admin operations via `withoutTenant()`.
 *
 * Using `prismaAdmin` for application logic is a security bug — it bypasses
 * tenant isolation. ESLint should flag imports of `prismaAdmin` outside of
 * the whitelisted paths (auth service, audit interceptor, tenant-guard pkg).
 */
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaAdmin: PrismaClient | undefined;
}

const logLevel =
  process.env.NODE_ENV === 'development' ? (['query', 'error', 'warn'] as const) : (['error'] as const);

/** RLS-enforced client. Every tenant-scoped query must go through this. */
export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: [...logLevel],
  });

/**
 * Admin client with BYPASSRLS. Falls back to DATABASE_URL if
 * DATABASE_URL_ADMIN is not set (dev convenience — only works if the
 * default role also has BYPASSRLS, which local-up.sh configures).
 */
export const prismaAdmin: PrismaClient =
  global.__prismaAdmin ??
  new PrismaClient({
    log: [...logLevel],
    datasources: {
      db: {
        url: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL!,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
  global.__prismaAdmin = prismaAdmin;
}
