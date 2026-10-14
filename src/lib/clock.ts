import { localDayAt } from './localTime';

/**
 * The current time for synthetic demo data. Normally the real clock. In demo mode only, the
 * end-to-end tests set `AA_DEMO_CLOCK=HH:MM` to pin "now" to that wall-clock time today in
 * the demo family's zone (Asia/Kolkata). Pages then look the same at any hour; without it,
 * for example, the Singapore teacher's "today" moves to the next day after 9:30 pm in India.
 * Ignored outside demo mode, so it can never affect real accounts.
 */
const DEMO_CLOCK_ZONE = 'Asia/Kolkata';

export function clockNow(): Date {
  const fixed = typeof process !== 'undefined' ? process.env.AA_DEMO_CLOCK : undefined;
  if (!fixed || process.env.AA_DEMO_MODE !== 'true') return new Date();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(fixed);
  if (!match) return new Date();
  return new Date(localDayAt(0, Number(match[1]), Number(match[2]), DEMO_CLOCK_ZONE, new Date()));
}
