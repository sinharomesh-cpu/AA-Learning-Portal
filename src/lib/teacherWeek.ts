import { localDayAt } from './localTime';

/** The teacher dashboard's seven-day strip (S21 availability grid). Safe in the browser and on the server. */

export type DayState = 'open' | 'full' | 'none';

export interface WeekDay {
  /** "Sat", "Sun" … in the teacher's zone. */
  short: string;
  /** Day of the month. */
  date: number;
  isToday: boolean;
  state: DayState;
  /** Spoken summary, e.g. "Saturday 17: 2 times open". */
  summary: string;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The next seven local days, today first, with the ISO weekday (1 = Monday) of each. */
export function nextSevenDays(timeZone: string, now: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const noon = new Date(localDayAt(i, 12, 0, timeZone, now));
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric' }).formatToParts(noon);
    const short = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const date = Number(parts.find((p) => p.type === 'day')?.value);
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(short) + 1;
    return { offset: i, short, date, weekday, iso: noon.toISOString() };
  });
}

const timesWord = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;

/** Builds the day strip from per-day counts of open and booked times. */
export function buildWeek(
  days: ReturnType<typeof nextSevenDays>,
  counts: Map<number, { open: number; taken: number }>,
): WeekDay[] {
  return days.map((d) => {
    const c = counts.get(d.offset);
    const state: DayState = !c || c.open + c.taken === 0 ? 'none' : c.open > 0 ? 'open' : 'full';
    const name = `${DAY_NAMES[d.weekday - 1] ?? d.short} ${d.date}`;
    const summary =
      state === 'none'
        ? `${name}: no times`
        : state === 'full'
          ? `${name}: fully booked`
          : `${name}: ${timesWord(c!.open)} open${c!.taken ? `, ${c!.taken} taken` : ''}`;
    return { short: d.short, date: d.date, isToday: d.offset === 0, state, summary };
  });
}
