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

/** Offset in minutes of `timeZone` from UTC at `instant` (e.g. +330 for India). */
function offsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/**
 * Converts weekly ranges from the teacher's time zone to the viewer's, for the week around
 * `reference` (so daylight-saving changes are taken into account). A range that crosses
 * midnight in the viewer's zone is split into two days.
 */
export function convertUsualTimes(
  ranges: UsualTime[],
  fromZone: string,
  toZone: string,
  reference: Date = new Date(),
): UsualTime[] {
  if (fromZone === toZone) return sortUsualTimes(ranges);
  const out: UsualTime[] = [];
  const week = 7 * 1440;
  for (const r of ranges) {
    // Minutes since Monday 00:00 in the teacher's zone → shift by the difference in offsets.
    const shift = offsetMinutes(toZone, reference) - offsetMinutes(fromZone, reference);
    let start = (r.weekday - 1) * 1440 + r.start + shift;
    start = ((start % week) + week) % week;
    const length = r.end - r.start;
    let remaining = length;
    let cursor = start;
    while (remaining > 0) {
      const dayIndex = Math.floor(cursor / 1440) % 7;
      const minuteOfDay = cursor % 1440;
      const take = Math.min(remaining, 1440 - minuteOfDay);
      out.push({ weekday: dayIndex + 1, start: minuteOfDay, end: minuteOfDay + take });
      remaining -= take;
      cursor = (cursor + take) % week;
    }
  }
  return sortUsualTimes(out);
}
