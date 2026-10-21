import { defineConfig, devices } from '@playwright/test';

/**
 * Real accounts (Phase 2): run with `npm run test:e2e:real`, which creates a throwaway
 * database and sets DATABASE_URL, AUTH_SECRET and AA_DEV_MAILBOX for the dev server.
 */
const port = Number(process.env.E2E_REAL_PORT ?? 3300);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: './tests/real',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  // In CI, failures are also posted as check annotations so they can be read without the full log.
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  // These tests run against `next dev`, which compiles each page on its first visit; on a CI
  // machine that alone can take longer than Playwright's default 5 s (CI, 20 and 21 Oct 2026).
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `npx next dev --port ${port} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      APP_BASE_URL: `http://127.0.0.1:${port}`,
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      AUTH_SECRET: process.env.AUTH_SECRET ?? '',
      AA_DEV_MAILBOX: 'true',
      // Synthetic owner address for the one-off Super Admin set-up test (OC-50).
      AA_SUPERADMIN_EMAIL: 'owner@example.com',
    },
  },
});
