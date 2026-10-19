import { describe, expect, it } from 'vitest';
import {
  addToDays,
  changeCount,
  formatDuration,
  isLocked,
  listDays,
  removeRange,
  replaceRange,
  totalMinutes,
  uncoveredPackageTimes,
} from './availabilityEdit';
import { WEEKDAYS_SHORT, type UsualTime } from './usualTimes';

const mon: UsualTime = { weekday: 1, start: 960, end: 1080 };
const lock = { times: [{ weekday: 5, start: 1020 }], minutes: 60 };
const fri: UsualTime = { weekday: 5, start: 960, end: 1080 };

describe('availability calendar editing (AV0–AV1)', () => {
  it('adds one time to several days at once', () => {
    const r = addToDays([], [2, 4], 960, 1080);
    expect(r).toEqual({
      ok: true,
      ranges: [
        { weekday: 2, start: 960, end: 1080 },
        { weekday: 4, start: 960, end: 1080 },
      ],
    });
  });

  it('joins same-day times that overlap or touch, and leaves other days alone', () => {
    const r = addToDays([mon, { weekday: 3, start: 600, end: 660 }], [1], 1020, 1140);
    expect(r.ok && r.ranges).toEqual([
      { weekday: 1, start: 960, end: 1140 },
      { weekday: 3, start: 600, end: 660 },
    ]);
    const touch = addToDays([mon], [1], 1080, 1140);
    expect(touch.ok && touch.ranges).toEqual([{ weekday: 1, start: 960, end: 1140 }]);
    const apart = addToDays([mon], [1], 1110, 1140);
    expect(apart.ok && apart.ranges).toHaveLength(2);
  });

  it('a new time that bridges two times joins all three', () => {
    const r = addToDays(
      [
        { weekday: 1, start: 540, end: 600 },
        { weekday: 1, start: 660, end: 720 },
      ],
      [1],
      570,
      690,
    );
    expect(r.ok && r.ranges).toEqual([{ weekday: 1, start: 540, end: 720 }]);
  });

  it('refuses more than 14 times, an empty day choice and an end before the start', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      weekday: (i % 7) + 1,
      start: i < 7 ? 0 : 600,
      end: i < 7 ? 60 : 660,
    }));
    expect(addToDays(many, [1], 900, 960)).toEqual({ ok: false, reason: 'count' });
    // Joining keeps the count the same, so it is still allowed at 14.
    expect(addToDays(many, [1], 30, 90).ok).toBe(true);
    expect(addToDays([], [], 900, 960)).toEqual({ ok: false, reason: 'invalid' });
    expect(addToDays([], [1], 960, 960)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('keeps times used by the offered learning package', () => {
    expect(isLocked(fri, lock)).toBe(true);
    expect(isLocked(mon, lock)).toBe(false);
    expect(removeRange([mon, fri], fri, lock)).toEqual({
      ok: false,
      reason: 'package',
      times: [{ weekday: 5, start: 1020 }],
    });
    expect(removeRange([mon, fri], mon, lock).ok).toBe(true);
    // Shortening past the class (5–6 pm) is refused; shortening around it is fine.
    expect(replaceRange([fri], fri, { weekday: 5, start: 960, end: 1050 }, lock).ok).toBe(false);
    expect(replaceRange([fri], fri, { weekday: 5, start: 1020, end: 1080 }, lock).ok).toBe(true);
    expect(uncoveredPackageTimes([], null)).toEqual([]);
  });

  it('edits a time and joins it with a neighbour it now reaches', () => {
    const tue = { weekday: 1, start: 1140, end: 1200 };
    const r = replaceRange([mon, tue], tue, { weekday: 1, start: 1080, end: 1200 });
    expect(r.ok && r.ranges).toEqual([{ weekday: 1, start: 960, end: 1200 }]);
  });

  it('counts unsaved changes and totals the week', () => {
    expect(changeCount([mon], [mon])).toBe(0);
    expect(changeCount([mon], [fri])).toBe(2);
    expect(totalMinutes([mon, fri])).toBe(240);
    expect(formatDuration(240)).toBe('4 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(30)).toBe('30 min');
    expect(listDays([4, 2], WEEKDAYS_SHORT)).toBe('Tue and Thu');
    expect(listDays([1, 3, 6], WEEKDAYS_SHORT)).toBe('Mon, Wed and Sat');
    expect(listDays([1, 2, 3, 4, 5, 6, 7], WEEKDAYS_SHORT)).toBe('every day');
  });
});
