import 'server-only';

/**
 * Phase 1 demo mode (OC-27 / D-39). True only when explicitly enabled and never in a
 * production build (next.config.ts refuses to build with the flag set).
 */
export function isDemoMode(): boolean {
  return process.env.AA_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}
