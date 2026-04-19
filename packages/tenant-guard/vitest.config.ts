import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    // Seed DATABASE_URL before @skillforge/db's eager PrismaClient ctor.
    // See test/setup-env.ts for the full story.
    setupFiles: ['test/setup-env.ts'],
  },
});
