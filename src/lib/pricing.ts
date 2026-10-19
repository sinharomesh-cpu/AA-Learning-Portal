import { CURRENCIES, type Currency, formatAmount, SESSION_MINUTES_MAX, SESSION_MINUTES_MIN } from './listing';
import type { UsualTime } from './usualTimes';

/**
 * CR-15 pricing model (FR-041, FR-042; OC-102 to OC-104): hourly lessons and learning packages,
 * two independent offers. Shared by the server rules and the screens; safe in the browser.
 */

export const PACKAGE_CLASSES_MIN = 22; // P-2
export const PACKAGE_CLASSES_MAX = 60; // R-3
export const PACKAGE_CLASSES_DEFAULT = 22;
export const PER_WEEK_MIN = 2; // R-5
export const PER_WEEK_MAX = 7;
export const WEEKS_MAX = 26; // R-4
export const WEEKS_DEFAULT = 6; // P-1
export const TERMS_NOTE_MAX = 1000;
/** Versioned draft terms (R-10); legal approval is a launch prerequisite. */
export const PACKAGE_TERMS_VERSION = 'package-terms-draft-v1';
export const RATE_MINOR_MAX = 100_000_000;
export const PACKAGE_PRICE_MINOR_MAX = 1_000_000_000;

export interface HourlyOffer {
  currency: Currency;
  /** Per hour, in the smallest unit (paise, cents). */
  rateMinor: number;
  /** One lesson length for hourly lessons, 10–40 minutes (R-6). */
  minutes: number;
}

/** A package class time in the teacher's time zone. */
export interface PackageTime {
  weekday: number;
  /** Minutes after midnight, 30-minute steps. */
  start: number;
}

export interface PackageTerms {
  currency: Currency;
  priceMinor: number;
  classes: number;
  perWeek: number;
  minutes: number;
  weeks: number;
  times: PackageTime[];
  termsVersion: string;
  termsNote: string | null;
}

/** P-1: ⌈classes ÷ classes a week⌉. */
export const minWeeks = (classes: number, perWeek: number) => Math.ceil(classes / perWeek);

/** OC-104: the default period is the greater of 6 weeks and the minimum. */
export const defaultWeeks = (classes: number, perWeek: number) => Math.max(WEEKS_DEFAULT, minWeeks(classes, perWeek));

/** The lowest frequency that fits the class count within 26 weeks (60 classes → 3 a week). */
export const minPerWeekFor = (classes: number) => Math.max(PER_WEEK_MIN, Math.ceil(classes / WEEKS_MAX));

/**
 * FR-041 / OC-104 §4: the price of one hourly lesson. The rate is per hour in the smallest unit;
 * the result is rounded once, half up, to the smallest unit of the same currency (R-14).
 */
export function lessonPriceMinor(rateMinor: number, minutes: number): number {
  if (!Number.isSafeInteger(rateMinor) || rateMinor < 1 || !Number.isInteger(minutes) || minutes < 1) {
    throw new RangeError('invalid rate or minutes');
  }
  // Integer arithmetic: floor((rate × minutes × 2 + 60) ÷ 120) is "round half up" of rate × minutes ÷ 60.
  return Math.floor((rateMinor * minutes * 2 + 60) / 120);
}

/** True when rate × minutes ÷ 60 is a whole number of paise / cents (no rounding needed). */
export const lessonPriceIsExact = (rateMinor: number, minutes: number) => (rateMinor * minutes) % 60 === 0;

/**
 * OC-107 (1): prices are never rounded silently. When a lesson price had to be rounded from the
 * hourly rate, this says so ("rounded to the nearest paisa"); otherwise null.
 */
export function lessonRoundingNote(currency: Currency, rateMinor: number, minutes: number): string | null {
  if (lessonPriceIsExact(rateMinor, minutes)) return null;
  return currency === 'INR' ? 'rounded to the nearest paisa' : 'rounded to the nearest cent';
}

/** "₹400 a 40-minute lesson"; "₹133.33 a 40-minute lesson (rounded to the nearest paisa)". */
export function describeLessonPrice(currency: Currency, rateMinor: number, minutes: number): string {
  const note = lessonRoundingNote(currency, rateMinor, minutes);
  return `${formatAmount(currency, lessonPriceMinor(rateMinor, minutes))} a ${minutes}-minute lesson${note ? ` (${note})` : ''}`;
}

export type HourlyProblem = 'currency' | 'rate' | 'minutes' | 'times';

export function checkHourly(h: HourlyOffer, usualTimes: UsualTime[]): HourlyProblem[] {
  const out: HourlyProblem[] = [];
  if (!(CURRENCIES as readonly string[]).includes(h.currency)) out.push('currency');
  if (!Number.isSafeInteger(h.rateMinor) || h.rateMinor < 1 || h.rateMinor > RATE_MINOR_MAX) out.push('rate');
  if (!Number.isInteger(h.minutes) || h.minutes < SESSION_MINUTES_MIN || h.minutes > SESSION_MINUTES_MAX)
    out.push('minutes');
  else if (usualTimes.length === 0 || !usualTimes.some((u) => u.end - u.start >= h.minutes)) out.push('times');
  return out;
}

export type PackageProblem =
  | 'currency'
  | 'price'
  | 'classes'
  | 'per_week'
  | 'minutes'
  | 'weeks_short'
  | 'weeks_long'
  | 'times_count'
  | 'times_outside'
  | 'times_overlap';

const fits = (t: PackageTime, minutes: number, usual: UsualTime[]) =>
  Number.isInteger(t.weekday) &&
  Number.isInteger(t.start) &&
  t.start % 30 === 0 &&
  usual.some((u) => u.weekday === t.weekday && u.start <= t.start && t.start + minutes <= u.end);

/** Every rule an offered package must meet (P-1, P-2, R-3 to R-6). The database checks them again. */
export function checkPackage(p: PackageTerms, usualTimes: UsualTime[]): PackageProblem[] {
  const out: PackageProblem[] = [];
  const int = (n: number) => Number.isInteger(n);
  if (!(CURRENCIES as readonly string[]).includes(p.currency)) out.push('currency');
  if (!Number.isSafeInteger(p.priceMinor) || p.priceMinor < 1 || p.priceMinor > PACKAGE_PRICE_MINOR_MAX)
    out.push('price');
  const classesOk = int(p.classes) && p.classes >= PACKAGE_CLASSES_MIN && p.classes <= PACKAGE_CLASSES_MAX;
  if (!classesOk) out.push('classes');
  const perWeekOk = int(p.perWeek) && p.perWeek >= PER_WEEK_MIN && p.perWeek <= PER_WEEK_MAX;
  if (!perWeekOk) out.push('per_week');
  const minutesOk = int(p.minutes) && p.minutes >= SESSION_MINUTES_MIN && p.minutes <= SESSION_MINUTES_MAX;
  if (!minutesOk) out.push('minutes');
  if (!int(p.weeks) || p.weeks < 1) out.push('weeks_short');
  else if (p.weeks > WEEKS_MAX) out.push('weeks_long');
  else if (classesOk && perWeekOk && p.weeks < minWeeks(p.classes, p.perWeek)) out.push('weeks_short');
  if (perWeekOk && p.times.length !== p.perWeek) out.push('times_count');
  if (minutesOk) {
    if (p.times.some((t) => !fits(t, p.minutes, usualTimes))) out.push('times_outside');
    const overlap = p.times.some((a, i) =>
      p.times.some(
        (b, j) => j !== i && a.weekday === b.weekday && a.start < b.start + p.minutes && b.start < a.start + p.minutes,
      ),
    );
    if (overlap) out.push('times_overlap');
  }
  return out;
}

/** Plain-language messages for the editor (board PM3). */
export const PACKAGE_PROBLEM_TEXT: Record<PackageProblem, string> = {
  currency: 'Choose a currency.',
  price: 'Enter a package price above 0, with at most 2 decimal places.',
  classes: `Packages have ${PACKAGE_CLASSES_MIN} to ${PACKAGE_CLASSES_MAX} classes.`,
  per_week: `Choose ${PER_WEEK_MIN} to ${PER_WEEK_MAX} classes a week.`,
  minutes: `Lessons can be ${SESSION_MINUTES_MIN} to ${SESSION_MINUTES_MAX} minutes.`,
  weeks_short: 'The completion period is too short for this many classes at this frequency.',
  weeks_long: `The completion period can be at most ${WEEKS_MAX} weeks.`,
  times_count: 'Choose one time for each class a week.',
  times_outside: 'Each class time must fit inside one of your usual times.',
  times_overlap: 'Two class times overlap.',
};

export const HOURLY_PROBLEM_TEXT: Record<HourlyProblem, string> = {
  currency: 'Choose a currency.',
  rate: 'Enter an hourly rate above 0, with at most 2 decimal places.',
  minutes: `Lessons can be ${SESSION_MINUTES_MIN} to ${SESSION_MINUTES_MAX} minutes.`,
  times: 'Add at least one usual time long enough for a lesson before offering hourly lessons.',
};

/** "22 classes × 40 min · 2 a week · complete within 11 weeks" (never "a month", P-1). */
export const describePackage = (p: Pick<PackageTerms, 'classes' | 'minutes' | 'perWeek' | 'weeks'>) =>
  `${p.classes} classes × ${p.minutes} min · ${p.perWeek} a week · complete within ${p.weeks} weeks`;

/**
 * OC-108 (board PT0): every start time where a package class of this length fits inside a usual
 * time, in 30-minute steps, ordered by day and time. Same-day classes are allowed (OC-108 (2)).
 */
export function packageStartTimes(usualTimes: UsualTime[], minutes: number): PackageTime[] {
  if (!Number.isInteger(minutes) || minutes < SESSION_MINUTES_MIN || minutes > SESSION_MINUTES_MAX) return [];
  const out: PackageTime[] = [];
  for (const u of usualTimes) {
    const first = Math.ceil(u.start / 30) * 30;
    for (let t = first; t + minutes <= u.end; t += 30) out.push({ weekday: u.weekday, start: t });
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.start - b.start);
}

/** True when two classes of this length on the same day would overlap. */
export const packageTimesOverlap = (a: PackageTime, b: PackageTime, minutes: number) =>
  a.weekday === b.weekday && a.start < b.start + minutes && b.start < a.start + minutes;

/**
 * The most classes a week that fit the usual times without overlapping (board PT1): earliest
 * start first, which is optimal for same-length classes on one line.
 */
export function maxClassesPerWeek(usualTimes: UsualTime[], minutes: number): number {
  const starts = packageStartTimes(usualTimes, minutes);
  let count = 0;
  let last: PackageTime | null = null;
  for (const s of starts) {
    if (last && packageTimesOverlap(last, s, minutes)) continue;
    count += 1;
    last = s;
  }
  return count;
}
