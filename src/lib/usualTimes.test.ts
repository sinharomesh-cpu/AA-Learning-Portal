import { describe, expect, it } from 'vitest';
import { checkUsualTimes, describeUsualTime, formatMinute } from './usualTimes';

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
