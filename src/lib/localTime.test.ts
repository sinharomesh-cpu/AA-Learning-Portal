import { greeting, todayAt, zoneOffsetMinutes } from './localTime';

describe('local-day helpers for fixtures', () => {
  const now = new Date('2026-10-14T06:00:00Z'); // 11:30 in Kolkata

  it('builds today’s wall-clock time in the viewer zone', () => {
    expect(todayAt(16, 30, 'Asia/Kolkata', now)).toBe('2026-10-14T11:00:00.000Z');
    expect(todayAt(16, 30, 'Asia/Singapore', now)).toBe('2026-10-14T08:30:00.000Z');
  });

  it('uses the local date, not the UTC date', () => {
    const lateUtc = new Date('2026-10-14T20:00:00Z'); // already 15 Oct in Kolkata
    expect(todayAt(9, 0, 'Asia/Kolkata', lateUtc)).toBe('2026-10-15T03:30:00.000Z');
  });

  it('reads zone offsets', () => {
    expect(zoneOffsetMinutes(now, 'Asia/Kolkata')).toBe(330);
    expect(zoneOffsetMinutes(now, 'UTC')).toBe(0);
  });

  it('greets by local time of day', () => {
    expect(greeting('Asia/Kolkata', now)).toBe('Good morning');
    expect(greeting('Asia/Kolkata', new Date('2026-10-14T09:00:00Z'))).toBe('Good afternoon');
    expect(greeting('Asia/Kolkata', new Date('2026-10-14T13:00:00Z'))).toBe('Good evening');
  });
});
