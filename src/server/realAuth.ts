import 'server-only';
import { isTestEnvironment, testEnvGateError } from '@/config/testEnv';

/**
 * Real accounts are on when a database and the server secret are configured and demo mode is
 * off (demo builds refuse these settings anyway, OC-34). Until then the app shows the sample
 * sign-in in demo mode, or "sign-in is not available yet".
 */
export function realAuthEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET) && process.env.AA_DEMO_MODE !== 'true';
}

/**
 * Test mailbox page: development and tests, or the password-protected hosted test
 * environment (OC-57). Never on a real production site.
 */
export function devMailboxEnabled(): boolean {
  if (process.env.AA_DEV_MAILBOX !== 'true') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return isTestEnvironment(process.env) && testEnvGateError(process.env) === null;
}
