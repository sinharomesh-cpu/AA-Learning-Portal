/**
 * Words for the AI Tutor allowance (OC-89(4)): shown to the child and the parent. Safe in the
 * browser and on the server.
 */
export const AI_RULE_TEXT = 'One AI class a day, 15 minutes each.';

export interface AllowanceView {
  canStart: boolean;
  active: { endsAt: Date } | null;
  nextAvailableAt: Date;
}

const clock = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d)
    .replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`);

const dayKey = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);

/** "Available now", "Running now, ends 5:30 pm", "Next: tomorrow at 5:15 pm", "Next: Mon 20 Oct at 9:00 am". */
export function describeAllowance(a: AllowanceView, timeZone: string, now: Date): string {
  if (a.active) return `Running now, ends at ${clock(a.active.endsAt, timeZone)}`;
  if (a.canStart) return 'Available now';
  const next = a.nextAvailableAt;
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let day: string;
  if (dayKey(next, timeZone) === dayKey(now, timeZone)) day = 'today';
  else if (dayKey(next, timeZone) === dayKey(tomorrow, timeZone)) day = 'tomorrow';
  else
    day = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(next);
  return `Next: ${day} at ${clock(next, timeZone)}`;
}
