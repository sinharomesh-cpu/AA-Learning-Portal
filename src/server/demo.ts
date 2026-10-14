import 'server-only';
import { demoEnabled, isHostedDemo } from '@/config/demoGate';

/**
 * Demo mode (OC-27 / D-39, hosted preview OC-34). The rule lives in `config/demoGate.ts`,
 * shared with `next.config.ts`, which refuses to build an unsafe combination.
 */
export function isDemoMode(): boolean {
  return demoEnabled(process.env);
}

/** True on the approved hosted demo preview, where a site-wide "sample data" banner is shown. */
export function isHostedDemoPreview(): boolean {
  return isDemoMode() && isHostedDemo(process.env);
}
