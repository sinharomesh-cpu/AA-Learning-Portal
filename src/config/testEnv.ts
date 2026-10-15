/**
 * Hosted test environment (OC-57): a separate Vercel project with its own test database, for
 * the owner to try real accounts with test data only. Plain module shared by next.config.ts,
 * proxy.ts and the server.
 *
 * - `AA_TEST_ENVIRONMENT=true` turns it on.
 * - The whole site then sits behind a password (`AA_TEST_ACCESS_PASSWORD`, at least 16
 *   characters), shows a "Test environment" banner, and is hidden from search engines.
 * - The test mailbox page may be switched on there (`AA_DEV_MAILBOX=true`), because no email
 *   provider is approved yet (A-02) and the site is password-protected.
 * - It cannot be combined with demo mode.
 */
type Env = Record<string, string | undefined>;

export const TEST_ACCESS_USER = 'aapro';
export const MIN_ACCESS_PASSWORD = 16;

export function isTestEnvironment(env: Env): boolean {
  return env.AA_TEST_ENVIRONMENT === 'true';
}

export function testEnvGateError(env: Env): string | null {
  if (!isTestEnvironment(env)) return null;
  if (env.AA_DEMO_MODE === 'true') return 'AA_TEST_ENVIRONMENT cannot be combined with AA_DEMO_MODE.';
  if ((env.AA_TEST_ACCESS_PASSWORD ?? '').length < MIN_ACCESS_PASSWORD) {
    return `AA_TEST_ENVIRONMENT needs AA_TEST_ACCESS_PASSWORD with at least ${MIN_ACCESS_PASSWORD} characters.`;
  }
  return null;
}
