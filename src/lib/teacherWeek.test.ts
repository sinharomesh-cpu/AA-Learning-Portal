import { describe, expect, it } from 'vitest';
import { buildWeek, nextSevenDays } from './teacherWeek';

// Saturday 17 October 2026, 12:00 in India.
const NOW = new Date('2026-10-17T06:30:00Z');

describe('the dashboard’s seven-day strip', () => {
  it('starts today in the teacher’s own zone and runs seven days', () => {
    const days = nextSevenDays('Asia/Kolkata', NOW);
    expect(days.map((d) => `${d.short} ${d.date}`)).toEqual([
      'Sat 17',
      'Sun 18',
      'Mon 19',
      'Tue 20',
      'Wed 21',
      'Thu 22',
      'Fri 23',
    ]);
    expect(days.map((d) => d.weekday)).toEqual([6, 7, 1, 2, 3, 4, 5]);
    // Late on Saturday in UTC is already Sunday in Auckland.
    expect(nextSevenDays('Pacific/Auckland', new Date('2026-10-17T13:00:00Z'))[0]).toMatchObject({
      short: 'Sun',
      date: 18,
    });
  });

  it('marks days as open, fully booked or empty, and says so in words', () => {
    const days = nextSevenDays('Asia/Kolkata', NOW);
    const week = buildWeek(
      days,
      new Map([
        [0, { open: 2, taken: 1 }],
        [2, { open: 0, taken: 3 }],
        [3, { open: 1, taken: 0 }],
      ]),
    );
    expect(week.map((d) => d.state)).toEqual(['open', 'none', 'full', 'open', 'none', 'none', 'none']);
    expect(week[0]).toMatchObject({ isToday: true, summary: 'Saturday 17: 2 times open, 1 taken' });
    expect(week[2]!.summary).toBe('Monday 19: fully booked');
    expect(week[3]!.summary).toBe('Tuesday 20: 1 time open');
    expect(week[1]!.summary).toBe('Sunday 18: no times');
  });
});
