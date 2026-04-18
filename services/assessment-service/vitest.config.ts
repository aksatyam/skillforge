import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
      exclude: ['src/main.ts', '**/*.module.ts', '**/*.test.ts'],
    },
  },
});
