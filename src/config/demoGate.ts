/**
 * Demo-mode gate (OC-27, OC-34). Plain module with no framework imports so `next.config.ts`
 * and the server can share one rule.
 *
 * - Local development and tests: `AA_DEMO_MODE=true` with `next dev`.
 * - Hosted demo preview (OC-34): a production build is allowed to run demo mode only when
 *   `AA_HOSTED_DEMO=true` is also set, and only when no real-service setting is present,
 *   so a demo build can never run next to real data, sign-in or providers.
 * - Any other production build with `AA_DEMO_MODE=true` is refused.
 */
type Env = Record<string, string | undefined>;

/** Settings that mean a real service is connected. None may be set in a demo build. */
export const REAL_SERVICE_SETTINGS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_AGENT_ID',
  'ZOOM_ACCOUNT_ID',
  'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET',
  'EMAIL_PROVIDER_API_KEY',
  'WHATSAPP_PROVIDER_API_KEY',
] as const;

export function isHostedDemo(env: Env): boolean {
  return env.AA_DEMO_MODE === 'true' && env.AA_HOSTED_DEMO === 'true';
}

/** Returns why this environment must not run, or null when it is safe. */
export function demoGateError(env: Env): string | null {
  if (env.AA_DEMO_MODE !== 'true') return null;
  const realServices = REAL_SERVICE_SETTINGS.filter((name) => (env[name] ?? '') !== '');
  if (realServices.length > 0) {
    return `Demo mode cannot run with real-service settings present: ${realServices.join(', ')}.`;
  }
  if (env.NODE_ENV === 'production' && env.AA_HOSTED_DEMO !== 'true') {
    return 'AA_DEMO_MODE=true is not allowed in a production build unless AA_HOSTED_DEMO=true (approved demo preview only).';
  }
  return null;
}

/** True when sample sign-in may be used in this environment. */
export function demoEnabled(env: Env): boolean {
  if (env.AA_DEMO_MODE !== 'true' || demoGateError(env) !== null) return false;
  return env.NODE_ENV !== 'production' || isHostedDemo(env);
}
