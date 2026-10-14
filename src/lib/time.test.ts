import { addMinutes, formatClockTime, formatDayLabel, formatZoneName, isSameLocalDay } from './time';

describe('time display (FR-019)', () => {
  const instant = '2026-10-14T11:00:00.000Z';

  it('shows the same instant in each viewer’s own zone', () => {
    expect(formatClockTime(instant, { timeZone: 'Asia/Kolkata' })).toBe('4:30 pm');
    expect(formatClockTime(instant, { timeZone: 'Asia/Singapore' })).toBe('7:00 pm');
  });

  it('handles daylight-saving zones', () => {
    // New York is on EDT (UTC-4) in October and EST (UTC-5) in December.
    expect(formatClockTime('2026-10-14T15:00:00.000Z', { timeZone: 'America/New_York' })).toBe('11:00 am');
    expect(formatClockTime('2026-12-14T15:00:00.000Z', { timeZone: 'America/New_York' })).toBe('10:00 am');
  });

  it('rejects an unknown time zone instead of guessing', () => {
    expect(() => formatClockTime(instant, { timeZone: 'Mars/Olympus' })).toThrow(RangeError);
  });

  it('formats day labels and zone names', () => {
    expect(formatDayLabel(instant, { timeZone: 'Asia/Kolkata' })).toMatch(/Wed.*14.*Oct/);
    expect(formatZoneName(instant, { timeZone: 'Asia/Kolkata' })).toBe('IST');
  });

  it('adds minutes and compares local days', () => {
    expect(addMinutes(instant, 40)).toBe('2026-10-14T11:40:00.000Z');
    // 20:00 UTC is already the next day in Kolkata (01:30) but the same day in UTC.
    expect(isSameLocalDay(instant, '2026-10-14T20:00:00.000Z', 'Asia/Kolkata')).toBe(false);
    expect(isSameLocalDay(instant, '2026-10-14T20:00:00.000Z', 'UTC')).toBe(true);
  });
});
