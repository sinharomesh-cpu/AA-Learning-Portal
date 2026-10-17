import { describe, expect, it } from 'vitest';
import { checkUsualTimes, convertUsualTimes, describeUsualTime, formatMinute } from './usualTimes';

describe('usual weekly times (PR-D1c)', () => {
  it('formats times of day', () => {
    expect(formatMinute(0)).toBe('12:00 am');
    expect(formatMinute(570)).toBe('9:30 am');
    expect(formatMinute(720)).toBe('12:00 pm');
    expect(formatMinute(1440)).toBe('12:00 am');
    expect(describeUsualTime({ weekday: 1, start: 960, end: 1080 })).toBe('Mon 4:00–6:00 pm');
    expect(describeUsualTime({ weekday: 6, start: 600, end: 720 })).toBe('Sat 10:00 am–12:00 pm');
  });

  it('accepts a valid week and refuses bad, overlapping or too many ranges', () => {
    expect(checkUsualTimes([])).toBeNull();
    expect(
      checkUsualTimes([
        { weekday: 1, start: 960, end: 1080 },
        { weekday: 1, start: 1080, end: 1140 },
        { weekday: 7, start: 1380, end: 1440 },
      ]),
    ).toBeNull();
    expect(checkUsualTimes([{ weekday: 0, start: 960, end: 1080 }])).toBe('invalid');
    expect(checkUsualTimes([{ weekday: 1, start: 965, end: 1080 }])).toBe('invalid');
    expect(checkUsualTimes([{ weekday: 1, start: 1080, end: 1080 }])).toBe('invalid');
    expect(checkUsualTimes([{ weekday: 1, start: Number.NaN, end: 1080 }])).toBe('invalid');
    expect(
      checkUsualTimes([
        { weekday: 2, start: 960, end: 1080 },
        { weekday: 2, start: 1020, end: 1140 },
      ]),
    ).toBe('overlap');
    expect(
      checkUsualTimes(Array.from({ length: 15 }, (_, i) => ({ weekday: 1, start: i * 60, end: i * 60 + 30 }))),
    ).toBe('count');
  });
});

describe('converting usual times to the viewer’s time zone', () => {
  const ref = new Date('2026-10-19T00:00:00Z');
  it('shifts by the difference between the zones', () => {
    // 4–6 pm in India is 6:30–8:30 pm in Singapore.
    expect(convertUsualTimes([{ weekday: 1, start: 960, end: 1080 }], 'Asia/Kolkata', 'Asia/Singapore', ref)).toEqual([
      { weekday: 1, start: 1110, end: 1230 },
    ]);
    expect(convertUsualTimes([{ weekday: 1, start: 960, end: 1080 }], 'Asia/Kolkata', 'Asia/Kolkata', ref)).toEqual([
      { weekday: 1, start: 960, end: 1080 },
    ]);
  });

  it('splits a range that crosses midnight and wraps Sunday into Monday', () => {
    // Sunday 11 pm – midnight in Singapore is Sunday 8:30–9:30 pm in India; the other way round crosses midnight.
    expect(convertUsualTimes([{ weekday: 7, start: 1290, end: 1440 }], 'Asia/Kolkata', 'Asia/Singapore', ref)).toEqual([
      { weekday: 1, start: 0, end: 150 },
    ]);
    expect(convertUsualTimes([{ weekday: 3, start: 1380, end: 1440 }], 'Asia/Kolkata', 'Asia/Singapore', ref)).toEqual([
      { weekday: 4, start: 90, end: 150 },
    ]);
    expect(convertUsualTimes([{ weekday: 2, start: 1320, end: 1440 }], 'Asia/Kolkata', 'Asia/Singapore', ref)).toEqual([
      { weekday: 3, start: 30, end: 150 },
    ]);
    expect(convertUsualTimes([{ weekday: 2, start: 1260, end: 1380 }], 'Asia/Kolkata', 'Asia/Singapore', ref)).toEqual([
      { weekday: 2, start: 1410, end: 1440 },
      { weekday: 3, start: 0, end: 90 },
    ]);
  });
});
