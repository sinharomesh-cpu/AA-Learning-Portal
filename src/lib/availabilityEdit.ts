/**
 * AV0–AV1 (approved 19 Oct 2026): editing rules for the availability calendar. Pure helpers,
 * safe in the browser and on the server. The saved rules are unchanged (checkUsualTimes and
 * the server's package check); these helpers only shape what the teacher builds before saving.
 */
import { checkUsualTimes, sortUsualTimes, USUAL_TIMES_MAX, type UsualTime } from './usualTimes';

export interface PackageLock {
  /** Class start times of the offered learning package (teacher's time zone). */
  times: Array<{ weekday: number; start: number }>;
  /** Class length in minutes. */
  minutes: number;
}

export type EditResult =
  | { ok: true; ranges: UsualTime[] }
  | { ok: false; reason: 'count' | 'invalid' }
  | { ok: false; reason: 'package'; times: Array<{ weekday: number; start: number }> };

const key = (r: UsualTime) => `${r.weekday}:${r.start}:${r.end}`;

/** Adds one range, joining it with any same-day range it overlaps or touches. */
function addOne(ranges: UsualTime[], next: UsualTime): UsualTime[] {
  let { start, end } = next;
  const keep: UsualTime[] = [];
  for (const r of ranges) {
    if (r.weekday === next.weekday && r.start <= end && start <= r.end) {
      start = Math.min(start, r.start);
      end = Math.max(end, r.end);
    } else {
      keep.push(r);
    }
  }
  return [...keep, { weekday: next.weekday, start, end }];
}

/** Package classes that the given week no longer covers (same test as the server's). */
export function uncoveredPackageTimes(ranges: UsualTime[], lock: PackageLock | null) {
  if (!lock) return [];
  return lock.times.filter(
    (t) => !ranges.some((u) => u.weekday === t.weekday && u.start <= t.start && t.start + lock.minutes <= u.end),
  );
}

/** True when a range holds a package class (shown with a lock; it can't be removed). */
export function isLocked(range: UsualTime, lock: PackageLock | null): boolean {
  if (!lock) return false;
  return lock.times.some(
    (t) => t.weekday === range.weekday && range.start <= t.start && t.start + lock.minutes <= range.end,
  );
}

function finish(next: UsualTime[], lock: PackageLock | null): EditResult {
  const sorted = sortUsualTimes(next);
  const problem = checkUsualTimes(sorted);
  if (problem === 'count') return { ok: false, reason: 'count' };
  if (problem) return { ok: false, reason: 'invalid' };
  const missing = uncoveredPackageTimes(sorted, lock);
  if (missing.length) return { ok: false, reason: 'package', times: missing };
  return { ok: true, ranges: sorted };
}

/** Adds the same time to each chosen day (several days at once). */
export function addToDays(
  ranges: UsualTime[],
  days: number[],
  start: number,
  end: number,
  lock: PackageLock | null = null,
): EditResult {
  if (!days.length || !(end > start)) return { ok: false, reason: 'invalid' };
  let next = ranges;
  for (const weekday of [...new Set(days)].sort()) next = addOne(next, { weekday, start, end });
  return finish(next, lock);
}

/** Replaces one range (edit or resize); joins it with neighbours it now overlaps or touches. */
export function replaceRange(
  ranges: UsualTime[],
  old: UsualTime,
  next: UsualTime,
  lock: PackageLock | null = null,
): EditResult {
  if (!(next.end > next.start)) return { ok: false, reason: 'invalid' };
  const rest = ranges.filter((r) => key(r) !== key(old));
  return finish(addOne(rest, next), lock);
}

/** Removes one range; refused while it holds a package class. */
export function removeRange(ranges: UsualTime[], old: UsualTime, lock: PackageLock | null = null): EditResult {
  return finish(
    ranges.filter((r) => key(r) !== key(old)),
    lock,
  );
}

/** Number of ranges added or removed compared with the saved week (for "N changes not saved"). */
export function changeCount(saved: UsualTime[], now: UsualTime[]): number {
  const a = new Set(saved.map(key));
  const b = new Set(now.map(key));
  let n = 0;
  for (const k of a) if (!b.has(k)) n += 1;
  for (const k of b) if (!a.has(k)) n += 1;
  return n;
}

/** Total minutes in the week. */
export function totalMinutes(ranges: UsualTime[]): number {
  return ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
}

/** "2 h", "1 h 30 min", "30 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "Mon, Wed and Sat" (or "every day"). */
export function listDays(days: number[], names: readonly string[]): string {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 7) return 'every day';
  const words = sorted.map((d) => names[d - 1]!);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

export { USUAL_TIMES_MAX };
