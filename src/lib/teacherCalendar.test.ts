import { describe, expect, it } from 'vitest';
import {
  buildCalendarWeek,
  calendarEntry,
  chooseWeek,
  formatTeachingTime,
  isCalendarDate,
  mondayOf,
  weekBounds,
  type CalendarLessonInput,
} from './teacherCalendar';

const TZ = 'Asia/Kolkata';
// Thursday 29 October 2026, 12:30 pm in India.
const NOW = new Date('2026-10-29T07:00:00Z');

let n = 0;
function lesson(startIso: string, over: Partial<CalendarLessonInput> = {}): CalendarLessonInput {
  const startsAt = new Date(startIso);
  const minutes = over.minutes ?? 30;
  n += 1;
  return {
    id: `l${n}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    minutes,
    status: 'confirmed',
    closedBy: null,
    closeReason: null,
    outcome: null,
    canAnswer: false,
    canCancel: true,
    needsOutcome: false,
    ended: startsAt.getTime() + minutes * 60_000 <= NOW.getTime(),
    subjectName: 'Maths',
    childName: 'Kiran',
    ...over,
  };
}

describe('weeks and their bounds', () => {
  it('snaps any date to its Monday', () => {
    expect(mondayOf('2026-10-29')).toBe('2026-10-26');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the week before
  });

  it('accepts only real calendar dates', () => {
    expect(isCalendarDate('2026-11-02')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-11-2')).toBe(false);
    expect(isCalendarDate("2026-11-02'; --")).toBe(false);
    expect(isCalendarDate(undefined)).toBe(false);
  });

  it('runs from the week 30 days back to the week 4 weeks ahead', () => {
    expect(weekBounds(NOW, TZ)).toEqual({
      first: '2026-09-28', // 29 Sep is a Tuesday
      last: '2026-11-23', // 26 Nov is a Thursday
      current: '2026-10-26',
      today: '2026-10-29',
    });
  });

  it('chooses this week by default and keeps any other choice inside the bounds', () => {
    expect(chooseWeek(undefined, NOW, TZ)).toBe('2026-10-26');
    expect(chooseWeek('not-a-date', NOW, TZ)).toBe('2026-10-26');
    expect(chooseWeek('2026-11-05', NOW, TZ)).toBe('2026-11-02');
    expect(chooseWeek('2027-03-01', NOW, TZ)).toBe('2026-11-23');
    expect(chooseWeek('2026-01-01', NOW, TZ)).toBe('2026-09-28');
  });

  it('uses the teacher’s own zone for “today”', () => {
    // 20:00 UTC on Sunday 1 Nov is already Monday 2 Nov in India: a new week.
    expect(weekBounds(new Date('2026-11-01T20:00:00Z'), TZ).current).toBe('2026-11-02');
    expect(weekBounds(new Date('2026-11-01T20:00:00Z'), 'Europe/London').current).toBe('2026-10-26');
  });
});

describe('one lesson on the calendar', () => {
  it('shows a request waiting for the teacher', () => {
    const e = calendarEntry(
      lesson('2026-11-02T10:30:00Z', { status: 'requested', canAnswer: true, canCancel: false }),
      TZ,
      NOW,
    );
    expect(e.state).toBe('request');
    expect(e.chip).toEqual({ text: 'Waiting for your answer', kind: 'warning' });
    expect(e.timeText).toBe('4:00 pm – 4:30 pm');
    expect(e.label).toBe('Maths with Kiran, 4:00 pm – 4:30 pm: Waiting for your answer');
    expect(e.cancelNote).toBeNull();
  });

  it('gives the 30-minute cancellation cut-off of a confirmed lesson', () => {
    const e = calendarEntry(lesson('2026-11-02T10:30:00Z'), TZ, NOW);
    expect(e.state).toBe('confirmed');
    expect(e.cancelNote).toBe('Can be cancelled until 3:30 pm');
  });

  it('says a lesson can’t be cancelled within 30 minutes of the start', () => {
    // 29 minutes from now: the server no longer allows cancelling (canCancel false).
    const soon = calendarEntry(lesson('2026-10-29T07:29:00Z', { canCancel: false }), TZ, NOW);
    expect(soon.cancelNote).toBe('Within 30 minutes of the start: can’t be cancelled');
    // 31 minutes ahead is still allowed by the server; the note follows the server’s answer.
    const edge = calendarEntry(lesson('2026-10-29T07:31:00Z'), TZ, NOW);
    expect(edge.cancelNote).toBe('Can be cancelled until 12:31 pm');
  });

  it('shows only the teacher’s own recorded outcome, never attendance or package counting', () => {
    expect(calendarEntry(lesson('2026-10-27T10:30:00Z', { needsOutcome: true }), TZ, NOW).chip.text).toBe(
      'Record how it went',
    );
    expect(calendarEntry(lesson('2026-10-27T10:30:00Z', { outcome: 'taught' }), TZ, NOW).chip.text).toBe('Taught');
    expect(calendarEntry(lesson('2026-10-27T10:30:00Z', { outcome: 'not_taken_place' }), TZ, NOW).chip.text).toBe(
      'Did not take place',
    );
    const e = calendarEntry(lesson('2026-10-27T10:30:00Z', { outcome: 'taught' }), TZ, NOW);
    expect(Object.keys(e)).not.toContain('attendance');
    expect(Object.keys(e)).not.toContain('price');
  });

  it('marks closed lessons with who closed them', () => {
    const byParent = calendarEntry(
      lesson('2026-11-03T10:30:00Z', { status: 'cancelled', closedBy: 'parent', canCancel: false }),
      TZ,
      NOW,
    );
    expect(byParent).toMatchObject({ state: 'closed', closed: true, chip: { text: 'Cancelled by the parent' } });
    const byMe = calendarEntry(
      lesson('2026-11-03T10:30:00Z', { status: 'cancelled', closedBy: 'teacher', canCancel: false }),
      TZ,
      NOW,
    );
    expect(byMe.chip.text).toBe('Cancelled by you');
    expect(
      calendarEntry(lesson('2026-11-03T10:30:00Z', { status: 'expired', canCancel: false }), TZ, NOW).chip.text,
    ).toBe('Expired');
  });
});

describe('the week', () => {
  const usual = [
    { weekday: 1, start: 960, end: 1080 },
    { weekday: 4, start: 600, end: 660 },
    { weekday: 4, start: 960, end: 1020 },
  ];

  it('lays out Monday to Sunday with each day’s lessons in time order and usual times', () => {
    const lessons = [
      lesson('2026-10-26T11:30:00Z', { outcome: 'taught' }), // Mon 5:00 pm
      lesson('2026-10-26T10:30:00Z', { outcome: 'taught', minutes: 40 }), // Mon 4:00 pm
      lesson('2026-10-29T10:30:00Z'), // Thu 4:00 pm, later today
      lesson('2026-10-31T10:30:00Z', { status: 'requested', canAnswer: true, canCancel: false }), // Sat
      lesson('2026-11-02T10:30:00Z'), // next week: not shown
    ];
    const w = buildCalendarWeek({ weekStart: '2026-10-26', timeZone: TZ, now: NOW, lessons, usual });
    expect(w.title).toBe('26 October – 1 November 2026');
    expect(w.days.map((d) => `${d.short} ${d.dayMonth}`)).toEqual([
      'Mon 26 Oct',
      'Tue 27 Oct',
      'Wed 28 Oct',
      'Thu 29 Oct',
      'Fri 30 Oct',
      'Sat 31 Oct',
      'Sun 1 Nov',
    ]);
    expect(w.days[0]!.entries.map((e) => e.timeText)).toEqual(['4:00 pm – 4:40 pm', '5:00 pm – 5:30 pm']);
    expect(w.days[0]!.usual).toEqual(['4:00 pm – 6:00 pm']);
    expect(w.days[3]!.usual).toEqual(['10:00 am – 11:00 am', '4:00 pm – 5:00 pm']);
    expect(w.days[3]!.isToday).toBe(true);
    expect(w.days.flatMap((d) => d.entries)).toHaveLength(4);
    expect(w.totals).toEqual({ requests: 1, confirmed: 3, toRecord: 0, minutes: 100 });
    expect(w).toMatchObject({ isCurrent: true, prev: '2026-10-19', next: '2026-11-02' });
  });

  it('marks the request window: past, too soon, opening time, open, closing time, beyond', () => {
    const now = new Date('2026-10-29T07:00:00Z'); // Thu 12:30 pm
    const kinds = (start: string) =>
      buildCalendarWeek({ weekStart: start, timeZone: TZ, now, lessons: [], usual: [] }).days.map((d) => d.window);
    expect(kinds('2026-10-26').slice(0, 5)).toEqual([
      { kind: 'past' },
      { kind: 'past' },
      { kind: 'past' },
      { kind: 'too_soon' }, // today
      { kind: 'opens', at: '12:30 pm' }, // tomorrow, 24 hours from now
    ]);
    expect(kinds('2026-10-26')[5]).toEqual({ kind: 'open' });
    // 4 weeks ahead = Thu 26 Nov 12:30 pm.
    expect(kinds('2026-11-23').slice(2, 5)).toEqual([
      { kind: 'open' },
      { kind: 'closes', at: '12:30 pm' },
      { kind: 'beyond' },
    ]);
  });

  it('stops at the first and last weeks that can be shown', () => {
    const first = buildCalendarWeek({ weekStart: '2026-09-28', timeZone: TZ, now: NOW, lessons: [], usual: [] });
    expect(first.prev).toBeNull();
    expect(first.next).toBe('2026-10-05');
    const last = buildCalendarWeek({ weekStart: '2026-11-23', timeZone: TZ, now: NOW, lessons: [], usual: [] });
    expect(last.next).toBeNull();
    expect(last.isCurrent).toBe(false);
  });

  it('counts closed lessons nowhere and places a lesson by its start in the teacher’s zone', () => {
    const lessons = [
      lesson('2026-10-30T18:45:00Z'), // Sat 31 Oct 12:15 am in India, Fri in UTC
      lesson('2026-10-30T10:30:00Z', { status: 'cancelled', closedBy: 'parent', canCancel: false }),
    ];
    const w = buildCalendarWeek({ weekStart: '2026-10-26', timeZone: TZ, now: NOW, lessons, usual: [] });
    expect(w.days[4]!.entries.map((e) => e.state)).toEqual(['closed']);
    expect(w.days[5]!.entries.map((e) => e.timeText)).toEqual(['12:15 am – 12:45 am']);
    expect(w.totals).toEqual({ requests: 0, confirmed: 1, toRecord: 0, minutes: 30 });
  });

  it('formats teaching time', () => {
    expect(formatTeachingTime(45)).toBe('45 min');
    expect(formatTeachingTime(60)).toBe('1 h');
    expect(formatTeachingTime(100)).toBe('1 h 40 min');
  });
});
