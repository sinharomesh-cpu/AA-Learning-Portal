import 'server-only';

/**
 * Real accounts are on when a database and the server secret are configured and demo mode is
 * off (demo builds refuse these settings anyway, OC-34). Until then the app shows the sample
 * sign-in in demo mode, or "sign-in is not available yet".
 */
export function realAuthEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET) && process.env.AA_DEMO_MODE !== 'true';
}

/** Local mailbox page for development and tests only; never in a production build. */
export function devMailboxEnabled(): boolean {
  return process.env.AA_DEV_MAILBOX === 'true' && process.env.NODE_ENV !== 'production';
}
