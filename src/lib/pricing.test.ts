import { describe, expect, it } from 'vitest';
import {
  checkHourly,
  checkPackage,
  defaultWeeks,
  describeLessonPrice,
  describePackage,
  lessonPriceMinor,
  lessonRoundingNote,
  maxClassesPerWeek,
  packageStartTimes,
  minPerWeekFor,
  minWeeks,
  type PackageTerms,
  PACKAGE_TERMS_VERSION,
} from './pricing';
import { formatAmount, parseAmount } from './listing';
import { parseOfferAmount } from './rateNegotiation';

const USUAL = [
  { weekday: 1, start: 1020, end: 1080 }, // Mon 5–6 pm
  { weekday: 3, start: 1020, end: 1110 }, // Wed 5–6:30 pm
  { weekday: 5, start: 960, end: 1080 }, // Fri 4–6 pm
];

const pkg = (over: Partial<PackageTerms> = {}): PackageTerms => ({
  currency: 'INR',
  priceMinor: 850000,
  classes: 22,
  perWeek: 2,
  minutes: 40,
  weeks: 11,
  times: [
    { weekday: 1, start: 1020 },
    { weekday: 3, start: 1020 },
  ],
  termsVersion: PACKAGE_TERMS_VERSION,
  termsNote: null,
  ...over,
});

describe('CR-15 lesson price (FR-041, R-14)', () => {
  it('is rate × minutes ÷ 60, in the smallest unit', () => {
    expect(lessonPriceMinor(60000, 40)).toBe(40000); // ₹600/h × 40 min = ₹400
    expect(lessonPriceMinor(55500, 40)).toBe(37000); // ₹555/h → ₹370
    expect(lessonPriceMinor(55000, 40)).toBe(36667); // ₹366.666… → ₹366.67 (minor unit, not whole rupees)
  });
  it('rounds once, half up', () => {
    expect(lessonPriceMinor(3, 30)).toBe(2); // 1.5 → 2
    expect(lessonPriceMinor(4550, 20)).toBe(1517); // 1516.67 → 1517 (S$15.17)
  });
  it('refuses invalid input', () => {
    expect(() => lessonPriceMinor(0, 40)).toThrow();
    expect(() => lessonPriceMinor(100, 0)).toThrow();
    expect(() => lessonPriceMinor(1.5, 40)).toThrow();
  });
});

describe('CR-15 completion period (P-1, R-4, R-5)', () => {
  it('minimum is ⌈classes ÷ a week⌉ and the default is max(6, minimum)', () => {
    expect([minWeeks(22, 5), defaultWeeks(22, 5)]).toEqual([5, 6]);
    expect([minWeeks(22, 4), defaultWeeks(22, 4)]).toEqual([6, 6]);
    expect([minWeeks(22, 2), defaultWeeks(22, 2)]).toEqual([11, 11]);
    expect([minWeeks(60, 3), defaultWeeks(60, 3)]).toEqual([20, 20]);
  });
  it('60 classes need at least 3 a week to fit 26 weeks', () => {
    expect(minPerWeekFor(22)).toBe(2);
    expect(minPerWeekFor(60)).toBe(3);
  });
  it('never says "month"', () => {
    expect(describePackage(pkg())).toBe('22 classes × 40 min · 2 a week · complete within 11 weeks');
    expect(describePackage(pkg())).not.toMatch(/month/i);
  });
});

describe('CR-15 package rules (P-1, P-2, R-3 to R-6)', () => {
  it('accepts a valid package', () => {
    expect(checkPackage(pkg(), USUAL)).toEqual([]);
    expect(checkPackage(pkg({ weeks: 26 }), USUAL)).toEqual([]);
  });
  it('22 to 60 classes', () => {
    expect(checkPackage(pkg({ classes: 21 }), USUAL)).toContain('classes');
    expect(checkPackage(pkg({ classes: 61 }), USUAL)).toContain('classes');
    expect(checkPackage(pkg({ classes: 60, weeks: 26 }), USUAL)).toContain('weeks_short'); // 60 at 2 needs 30
  });
  it('2 to 7 a week, one time each', () => {
    expect(checkPackage(pkg({ perWeek: 1, times: [{ weekday: 1, start: 1020 }] }), USUAL)).toContain('per_week');
    expect(checkPackage(pkg({ times: [{ weekday: 1, start: 1020 }] }), USUAL)).toContain('times_count');
  });
  it('period at least the minimum and at most 26 weeks', () => {
    expect(checkPackage(pkg({ weeks: 10 }), USUAL)).toContain('weeks_short');
    expect(checkPackage(pkg({ weeks: 27 }), USUAL)).toContain('weeks_long');
    expect(checkPackage(pkg({ weeks: 0 }), USUAL)).toContain('weeks_short');
  });
  it('10–40 minutes', () => {
    expect(checkPackage(pkg({ minutes: 45 }), USUAL)).toContain('minutes');
    expect(checkPackage(pkg({ minutes: 5 }), USUAL)).toContain('minutes');
  });
  it('times inside usual times, 30-minute steps, no overlap', () => {
    expect(
      checkPackage(
        pkg({
          times: [
            { weekday: 1, start: 1050 },
            { weekday: 3, start: 1020 },
          ],
        }),
        USUAL,
      ),
    ).toContain('times_outside'); // 5:30 + 40 min ends 6:10, after 6:00
    expect(
      checkPackage(
        pkg({
          times: [
            { weekday: 2, start: 1020 },
            { weekday: 3, start: 1020 },
          ],
        }),
        USUAL,
      ),
    ).toContain('times_outside'); // no Tuesday time
    expect(
      checkPackage(
        pkg({
          times: [
            { weekday: 1, start: 1025 },
            { weekday: 3, start: 1020 },
          ],
        }),
        USUAL,
      ),
    ).toContain('times_outside');
    expect(
      checkPackage(
        pkg({
          times: [
            { weekday: 5, start: 960 },
            { weekday: 5, start: 990 },
          ],
        }),
        USUAL,
      ),
    ).toContain('times_overlap');
    expect(
      checkPackage(
        pkg({
          times: [
            { weekday: 5, start: 960 },
            { weekday: 5, start: 1020 },
          ],
        }),
        USUAL,
      ),
    ).toEqual([]);
  });
  it('a positive price, never derived from anything', () => {
    expect(checkPackage(pkg({ priceMinor: 0 }), USUAL)).toContain('price');
    expect(checkPackage(pkg({ priceMinor: 1.5 }), USUAL)).toContain('price');
  });
});

describe('CR-15 hourly rules (FR-041)', () => {
  it('rate, currency, 10–40 min, and a usual time long enough', () => {
    expect(checkHourly({ currency: 'INR', rateMinor: 60000, minutes: 40 }, USUAL)).toEqual([]);
    expect(checkHourly({ currency: 'INR', rateMinor: 0, minutes: 40 }, USUAL)).toEqual(['rate']);
    expect(checkHourly({ currency: 'EUR' as 'INR', rateMinor: 100, minutes: 40 }, USUAL)).toEqual(['currency']);
    expect(checkHourly({ currency: 'INR', rateMinor: 100, minutes: 50 }, USUAL)).toEqual(['minutes']);
    expect(checkHourly({ currency: 'INR', rateMinor: 100, minutes: 40 }, [])).toEqual(['times']);
  });
});

describe('OC-107 (1): amounts with paise, never rounded silently', () => {
  it('shows whole rupees without decimals and paise with two decimals', () => {
    expect(formatAmount('INR', 20000)).toBe('₹200');
    expect(formatAmount('INR', 13333)).toBe('₹133.33');
    expect(formatAmount('INR', 13330)).toBe('₹133.30');
    expect(formatAmount('INR', 150000)).toBe('₹1,500');
  });
  it('accepts up to two decimals and refuses more instead of rounding', () => {
    expect(parseAmount('133.33')).toBe(13333);
    expect(parseAmount('133.3')).toBe(13330);
    expect(parseAmount('133.333')).toBeNull();
    expect(parseOfferAmount('1,500.50')).toBe(150050);
    expect(parseOfferAmount('1500.505')).toBeNull();
  });
  it('says when a lesson price had to be rounded from the hourly rate', () => {
    expect(describeLessonPrice('INR', 60000, 40)).toBe('₹400 a 40-minute lesson');
    expect(describeLessonPrice('INR', 20000, 40)).toBe('₹133.33 a 40-minute lesson (rounded to the nearest paisa)');
    expect(describeLessonPrice('SGD', 4550, 30)).toBe('S$22.75 a 30-minute lesson');
    expect(lessonRoundingNote('USD', 1000, 40)).toBe('rounded to the nearest cent');
    expect(lessonRoundingNote('INR', 20050, 30)).toBeNull();
  });
});

describe('OC-108: class times for the package planner', () => {
  const FRI = [{ weekday: 5, start: 960, end: 1080 }]; // Friday 4:00–6:00 pm
  it('lists every start inside the usual times in 30-minute steps', () => {
    expect(packageStartTimes(FRI, 40).map((t) => t.start)).toEqual([960, 990, 1020]);
    expect(packageStartTimes(FRI, 9)).toEqual([]);
  });
  it('counts how many classes a week fit without overlapping (same-day classes allowed)', () => {
    expect(maxClassesPerWeek(FRI, 40)).toBe(2); // Fri 4:00 and 5:00
    expect(maxClassesPerWeek(FRI, 30)).toBe(4);
    expect(
      maxClassesPerWeek(
        [
          { weekday: 1, start: 960, end: 1080 },
          { weekday: 3, start: 1020, end: 1140 },
          { weekday: 6, start: 600, end: 720 },
        ],
        40,
      ),
    ).toBe(6);
    expect(maxClassesPerWeek([], 40)).toBe(0);
  });
  it('two non-overlapping classes on the same day pass the package rules', () => {
    const p: PackageTerms = {
      currency: 'INR',
      priceMinor: 150000,
      classes: 22,
      perWeek: 2,
      minutes: 40,
      weeks: 11,
      times: [
        { weekday: 5, start: 960 },
        { weekday: 5, start: 1020 },
      ],
      termsVersion: PACKAGE_TERMS_VERSION,
      termsNote: null,
    };
    expect(checkPackage(p, FRI)).toEqual([]);
    expect(
      checkPackage(
        {
          ...p,
          times: [
            { weekday: 5, start: 960 },
            { weekday: 5, start: 990 },
          ],
        },
        FRI,
      ),
    ).toContain('times_overlap');
  });
});
