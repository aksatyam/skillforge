import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    // Seeds DATABASE_URL / JWT_SECRET / etc. before any module (especially
    // `@skillforge/db`, which eagerly constructs PrismaClient) is loaded.
    // See test/setup-env.ts for rationale.
    setupFiles: ['test/setup-env.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
      exclude: ['src/main.ts', '**/*.module.ts', '**/*.test.ts'],
    },
  },
});
