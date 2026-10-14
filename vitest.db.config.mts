import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Database integration tests (Phase 2). They need a Postgres server: set DATABASE_URL to an
 * admin connection. Each run creates a fresh, randomly named database, migrates it, runs the
 * tests and drops it again, so no test data is left behind.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/unit/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['./tests/db/global-setup.ts'],
    // Files share one database; keep them sequential so tests stay simple to reason about.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
