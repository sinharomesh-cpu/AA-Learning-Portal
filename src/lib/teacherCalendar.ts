import type { ChipKind } from '@/components/StatusChip';
import { formatClock, lessonStatusText, localDate, type CloseReason, type ClosedBy } from './lessonDisplay';
import { formatMinute, type UsualTime } from './usualTimes';

/**
 * The teacher's week calendar on My schedule. Safe on the server and in the browser.
 *
 * It shows only what is already recorded: lesson requests, confirmed lessons and the teacher's
 * own recorded outcome (D3A-7), with the teacher's usual weekly times as a guide. It shows no
 * attendance, package counting or charge (Teaching Model rev 7.1 keeps those separate).
 * Weeks run Monday to Sunday in the teacher's time zone.
 */

/** Lessons that ended up to 30 days ago are listed (lessonsForTeacher), so earlier weeks would look empty. */
export const CALENDAR_PAST_DAYS = 30;
/** Families can request from 24 hours to 4 weeks ahead (D3A-2 / D3A-3). */
export const REQUEST_NOTICE_HOURS = 24;
export const REQUEST_WINDOW_DAYS = 28;
/** Lessons can be cancelled up to 30 minutes before the start (OC-46). */
export const CANCEL_CUTOFF_MINUTES = 30;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD calendar date moved by whole days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  return ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** The Monday of the week containing a calendar date. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30 and anything else). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export interface WeekBounds {
  /** Monday of the earliest week that can be shown (the last 30 days of lessons). */
  first: string;
  /** Monday of the latest week that can be shown (the 4-week request window). */
  last: string;
  /** Monday of this week. */
  current: string;
  today: string;
}

export function weekBounds(now: Date, timeZone: string): WeekBounds {
  const today = localDate(now, timeZone);
  return {
    first: mondayOf(localDate(new Date(now.getTime() - CALENDAR_PAST_DAYS * DAY), timeZone)),
    last: mondayOf(localDate(new Date(now.getTime() + REQUEST_WINDOW_DAYS * DAY), timeZone)),
    current: mondayOf(today),
    today,
  };
}

/** The week to show for a `?week=` value: snapped to its Monday and kept within the bounds. */
export function chooseWeek(param: unknown, now: Date, timeZone: string): string {
  const b = weekBounds(now, timeZone);
  if (!isCalendarDate(param)) return b.current;
  const monday = mondayOf(param);
  if (monday < b.first) return b.first;
  if (monday > b.last) return b.last;
  return monday;
}

/** The fields of a lesson the calendar needs (a subset of the server's LessonItem). */
export interface CalendarLessonInput {
  id: string;
  startsAt: Date;
  endsAt: Date;
  minutes: number;
  status: 'requested' | 'confirmed' | 'declined' | 'withdrawn' | 'expired' | 'cancelled';
  closedBy: ClosedBy;
  closeReason: CloseReason;
  outcome: 'taught' | 'not_taken_place' | null;
  canAnswer: boolean;
  canCancel: boolean;
  needsOutcome: boolean;
  ended: boolean;
  subjectName: string;
  childName: string;
}

export type CalendarState = 'request' | 'confirmed' | 'record' | 'taught' | 'not_held' | 'ended' | 'closed';

export interface CalendarEntry {
  id: string;
  state: CalendarState;
  /** "4:00 pm – 4:30 pm" in the teacher's zone. */
  timeText: string;
  minutes: number;
  subjectName: string;
  childName: string;
  chip: { text: string; kind: ChipKind };
  /** For an upcoming confirmed lesson: the 30-minute cut-off in words. */
  cancelNote: string | null;
  /** Closed lessons (cancelled, declined …) are shown struck through and don't count as teaching time. */
  closed: boolean;
  /** Full description for screen readers and the link to the lesson's card. */
  label: string;
}

/** What the calendar shows for one lesson, from its recorded state only. */
export function calendarEntry(l: CalendarLessonInput, timeZone: string, now: Date): CalendarEntry {
  let state: CalendarState;
  let chip: { text: string; kind: ChipKind };
  if (l.status === 'confirmed') {
    if (l.outcome === 'taught') [state, chip] = ['taught', { text: 'Taught', kind: 'success' }];
    else if (l.outcome === 'not_taken_place')
      [state, chip] = ['not_held', { text: 'Did not take place', kind: 'neutral' }];
    else if (l.needsOutcome) [state, chip] = ['record', { text: 'Record how it went', kind: 'warning' }];
    else if (l.ended) [state, chip] = ['ended', { text: 'Ended', kind: 'neutral' }];
    else [state, chip] = ['confirmed', { text: 'Confirmed', kind: 'success' }];
  } else if (l.status === 'requested' && l.canAnswer) {
    [state, chip] = ['request', { text: 'Waiting for your answer', kind: 'warning' }];
  } else {
    state = 'closed';
    chip = lessonStatusText(
      { status: l.status, closedBy: l.closedBy, closeReason: l.closeReason, closedByYou: l.closedBy === 'teacher' },
      'teacher',
    );
  }
  let cancelNote: string | null = null;
  if (state === 'confirmed') {
    const cutoff = new Date(l.startsAt.getTime() - CANCEL_CUTOFF_MINUTES * MIN);
    cancelNote =
      l.canCancel && now < cutoff
        ? `Can be cancelled until ${formatClock(cutoff, timeZone)}`
        : 'Within 30 minutes of the start: can’t be cancelled';
  }
  const timeText = `${formatClock(l.startsAt, timeZone)} – ${formatClock(l.endsAt, timeZone)}`;
  return {
    id: l.id,
    state,
    timeText,
    minutes: l.minutes,
    subjectName: l.subjectName,
    childName: l.childName,
    chip,
    cancelNote,
    closed: state === 'closed',
    label: `${l.subjectName} with ${l.childName}, ${timeText}: ${chip.text}`,
  };
}

export type DayWindow =
  /** Before today. */
  | { kind: 'past' }
  /** Today, or days inside the 24-hour notice: families can't request new lessons. */
  | { kind: 'too_soon' }
  /** The day the 24-hour notice ends: requests possible from this time. */
  | { kind: 'opens'; at: string }
  | { kind: 'open' }
  /** The last day of the 4-week window: requests possible until this time. */
  | { kind: 'closes'; at: string }
  /** After the 4-week window. */
  | { kind: 'beyond' };

export interface CalendarDay {
  date: string;
  /** "Mon" */
  short: string;
  /** "3 Nov" */
  dayMonth: string;
  /** "Monday 3 November" */
  long: string;
  isToday: boolean;
  window: DayWindow;
  /** The teacher's usual weekly times on this weekday, in words ("4:00 pm – 6:00 pm"). */
  usual: string[];
  entries: CalendarEntry[];
}

export interface CalendarWeek {
  start: string;
  end: string;
  /** "3 – 9 November 2026" */
  title: string;
  days: CalendarDay[];
  /** The Monday of the previous / next week, or null at the bounds. */
  prev: string | null;
  next: string | null;
  isCurrent: boolean;
  current: string;
  totals: { requests: number; confirmed: number; toRecord: number; minutes: number };
}

function windowFor(date: string, today: string, now: Date, timeZone: string): DayWindow {
  if (date < today) return { kind: 'past' };
  const opens = new Date(now.getTime() + REQUEST_NOTICE_HOURS * HOUR);
  const closes = new Date(now.getTime() + REQUEST_WINDOW_DAYS * DAY);
  const opensDate = localDate(opens, timeZone);
  const closesDate = localDate(closes, timeZone);
  if (date < opensDate) return { kind: 'too_soon' };
  if (date === opensDate) return { kind: 'opens', at: formatClock(opens, timeZone) };
  if (date < closesDate) return { kind: 'open' };
  if (date === closesDate) return { kind: 'closes', at: formatClock(closes, timeZone) };
  return { kind: 'beyond' };
}

function fmt(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${date}T12:00:00Z`));
}

function weekTitle(start: string, end: string): string {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const from = sameMonth
    ? fmt(start, { day: 'numeric' })
    : sameYear
      ? fmt(start, { day: 'numeric', month: 'long' })
      : fmt(start, { day: 'numeric', month: 'long', year: 'numeric' });
  return `${from} – ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** Builds one Monday-to-Sunday week of the teacher's calendar. */
export function buildCalendarWeek(input: {
  weekStart: string;
  timeZone: string;
  now: Date;
  lessons: CalendarLessonInput[];
  usual: UsualTime[];
}): CalendarWeek {
  const { weekStart, timeZone, now } = input;
  const b = weekBounds(now, timeZone);
  const totals = { requests: 0, confirmed: 0, toRecord: 0, minutes: 0 };
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const weekday = isoWeekday(date);
    const entries = input.lessons
      .filter((l) => localDate(l.startsAt, timeZone) === date)
      .sort((a, c) => a.startsAt.getTime() - c.startsAt.getTime() || a.id.localeCompare(c.id))
      .map((l) => calendarEntry(l, timeZone, now));
    for (const e of entries) {
      if (e.state === 'request') totals.requests += 1;
      if (e.state === 'record') totals.toRecord += 1;
      if (e.state === 'confirmed' || e.state === 'record' || e.state === 'taught' || e.state === 'ended') {
        totals.confirmed += 1;
        totals.minutes += e.minutes;
      }
    }
    return {
      date,
      short: fmt(date, { weekday: 'short' }),
      dayMonth: fmt(date, { day: 'numeric', month: 'short' }),
      long: fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }),
      isToday: date === b.today,
      window: windowFor(date, b.today, now, timeZone),
      usual: input.usual
        .filter((u) => u.weekday === weekday)
        .sort((a, c) => a.start - c.start)
        .map((u) => `${formatMinute(u.start)} – ${formatMinute(u.end)}`),
      entries,
    };
  });
  const end = addDays(weekStart, 6);
  return {
    start: weekStart,
    end,
    title: weekTitle(weekStart, end),
    days,
    prev: weekStart > b.first ? addDays(weekStart, -7) : null,
    next: weekStart < b.last ? addDays(weekStart, 7) : null,
    isCurrent: weekStart === b.current,
    current: b.current,
    totals,
  };
}

/** "1 h 15 min", "45 min", "2 h". */
export function formatTeachingTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
