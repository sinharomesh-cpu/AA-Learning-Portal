import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test of the hosted demo preview (OC-34): a real production build with
 * AA_DEMO_MODE=true and AA_HOSTED_DEMO=true. Run `npm run build` with both flags first.
 */
const port = Number(process.env.E2E_PORT ?? 3200);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: './tests/hosted',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start --port ${port} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: '1', AA_DEMO_MODE: 'true', AA_HOSTED_DEMO: 'true' },
  },
});
