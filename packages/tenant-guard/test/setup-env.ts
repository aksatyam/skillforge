/**
 * Global vitest setup for @skillforge/tenant-guard.
 *
 * The guard imports `@skillforge/db`, which eagerly constructs a
 * PrismaClient at module load — even if no test issues a query. That
 * constructor throws when `DATABASE_URL` / `DATABASE_URL_ADMIN` are unset.
 * Prisma is lazy about *connecting*, so seeding throwaway URLs here is
 * enough to let modules import without talking to a real database.
 *
 * Keep this file in sync with the equivalent one under
 * `services/assessment-service/test/setup-env.ts` — same variables, same
 * reasoning.
 */
process.env.DATABASE_URL ??=
  'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public';
process.env.DATABASE_URL_ADMIN ??=
  'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public';
process.env.JWT_SECRET ??=
  'test-jwt-secret-not-for-production-use-xxxxxxxxxx';
