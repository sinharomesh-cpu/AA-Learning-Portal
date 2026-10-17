/**
 * Usual weekly times (PR-D1c): shared helpers that are safe in the browser and on the server.
 * A range is a wall-clock time on one weekday in the teacher's time zone, in 30-minute steps.
 */
export interface UsualTime {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Minutes after midnight, multiple of 30, 0 … 1410. */
  start: number;
  /** Minutes after midnight, multiple of 30, 30 … 1440 (1440 = midnight at the end of the day). */
  end: number;
}

export const USUAL_TIMES_MAX = 14;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type UsualTimesProblem = 'count' | 'invalid' | 'overlap';

/** "4:00 pm", "12:00 pm" (noon), "12:00 am" (midnight). */
export function formatMinute(minute: number): string {
  const m = minute % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${suffix}`;
}

/** Sorted by day and start time, so lists always read the same way. */
export function sortUsualTimes(ranges: UsualTime[]): UsualTime[] {
  return [...ranges].sort((a, b) => a.weekday - b.weekday || a.start - b.start);
}

/** Checks a full set of ranges (the form always saves the whole week). */
export function checkUsualTimes(ranges: UsualTime[]): UsualTimesProblem | null {
  if (ranges.length > USUAL_TIMES_MAX) return 'count';
  for (const r of ranges) {
    const ok =
      Number.isInteger(r.weekday) &&
      r.weekday >= 1 &&
      r.weekday <= 7 &&
      Number.isInteger(r.start) &&
      Number.isInteger(r.end) &&
      r.start % 30 === 0 &&
      r.end % 30 === 0 &&
      r.start >= 0 &&
      r.end <= 1440 &&
      r.end > r.start;
    if (!ok) return 'invalid';
  }
  const sorted = sortUsualTimes(ranges);
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (a.weekday === b.weekday && b.start < a.end) return 'overlap';
  }
  return null;
}

/** "Mon 4:00–6:00 pm" style lines, in the teacher's time zone. */
export function describeUsualTime(r: UsualTime): string {
  const start = formatMinute(r.start);
  const end = formatMinute(r.end);
  const sameHalf = start.slice(-2) === end.slice(-2);
  return `${WEEKDAYS_SHORT[r.weekday - 1]} ${sameHalf ? start.slice(0, -3) : start}–${end}`;
}
