/**
 * @skillforge/db
 * Exports the Prisma client + helpers for all services.
 * Every service imports from here — there is no other way to reach the DB.
 */
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// Singleton to avoid "too many connections" across hot-reloads.
// Each service process gets ONE PrismaClient instance.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
