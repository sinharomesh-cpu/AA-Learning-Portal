import Link from 'next/link';
import { cx } from '@/lib/cx';
import { formatDayName } from '@/lib/lessonDisplay';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY = 86_400_000;

/** Every calendar date from `first` to `last` (YYYY-MM-DD, inclusive). */
function datesBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${first}T12:00:00Z`); t <= Date.parse(`${last}T12:00:00Z`); t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const monthName = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`),
  );
/** 0 = Monday … 6 = Sunday. */
const column = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Book a teacher, step 3 (CR-17 PR 2, U2): the 4-week window as a calendar, one month heading
 * and a Mon–Sun grid per month. Days with free times are links (the chosen one is marked);
 * other days are shown greyed and can't be chosen. Plain links: works without JavaScript.
 */
export function DayGrid({
  first,
  last,
  free,
  chosen,
  href,
}: {
  /** The window's first and last dates in the parent's time zone. */
  first: string;
  last: string;
  /** Dates with at least one free time, with how many. */
  free: Map<string, number>;
  chosen: string;
  href: (date: string) => string;
}) {
  const months = new Map<string, string[]>();
  for (const d of datesBetween(first, last)) {
    const key = d.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), d]);
  }
  return (
    <nav aria-label="Days with free times" className="flex flex-col gap-4">
      {[...months.entries()].map(([key, dates]) => (
        <section key={key} aria-labelledby={`month-${key}`} className="flex flex-col gap-2">
          <h3 id={`month-${key}`} className="m-0 text-[17px] font-bold">
            {monthName(dates[0]!)}
          </h3>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAYS.map((w) => (
              <span
                key={w}
                aria-hidden="true"
                className="text-center text-xs font-bold uppercase tracking-wide text-on-surface-variant"
              >
                {w}
              </span>
            ))}
            {Array.from({ length: column(dates[0]!) }, (_, i) => (
              <span key={`blank-${i}`} aria-hidden="true" />
            ))}
            {dates.map((d) => {
              const n = free.get(d) ?? 0;
              const day = Number(d.slice(8));
              if (!n) {
                return (
                  <span
                    key={d}
                    className="flex min-h-12 items-center justify-center rounded-[14px] text-[15px] text-on-surface-variant"
                  >
                    {day}
                    <span className="sr-only">, {formatDayName(d)}, no free times</span>
                  </span>
                );
              }
              const on = d === chosen;
              return (
                <Link
                  key={d}
                  href={href(d)}
                  aria-current={on ? 'date' : undefined}
                  aria-label={`${formatDayName(d)}, ${n} free ${n === 1 ? 'time' : 'times'}`}
                  className={cx(
                    'flex min-h-12 items-center justify-center rounded-[14px] border-2 text-[15px] font-bold no-underline',
                    on
                      ? 'border-primary bg-primary text-on-primary hover:text-on-primary'
                      : 'border-outline bg-surface-container-lowest text-on-surface hover:bg-surface-container-low',
                  )}
                >
                  {day}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
