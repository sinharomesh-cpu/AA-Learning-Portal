import Link from 'next/link';
import { Icon } from '@/components/icons/Icon';
import { StatusChip } from '@/components/StatusChip';
import { SHELL } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { type CalendarDay, type CalendarEntry, type CalendarWeek, formatTeachingTime } from '@/lib/teacherCalendar';

/**
 * My schedule: the teacher's week, Monday to Sunday in their own time zone. Each lesson links to
 * its card further down the page, where its actions are (accept, decline, cancel, meeting link,
 * outcome). The usual weekly times are shown as a guide; the request window (24 hours to 4 weeks
 * ahead) is marked on each day. Plain links: works without JavaScript.
 */

const BAR: Record<CalendarEntry['state'], string> = {
  request: 'bg-secondary',
  confirmed: 'bg-primary',
  record: 'bg-secondary',
  taught: 'bg-tertiary',
  not_held: 'bg-outline',
  ended: 'bg-outline',
  closed: 'bg-outline-variant',
};

function windowNote(day: CalendarDay): string | null {
  switch (day.window.kind) {
    case 'too_soon':
      return 'Too soon for new requests';
    case 'opens':
      return `New requests from ${day.window.at}`;
    case 'closes':
      return `New requests until ${day.window.at}`;
    case 'beyond':
      return 'Beyond the 4-week request window';
    default:
      return null;
  }
}

function Entry({ e }: { e: CalendarEntry }) {
  return (
    <li>
      <a
        href={`#lesson-${e.id}`}
        aria-label={e.label}
        data-testid="calendar-lesson"
        data-state={e.state}
        className={cx(
          'relative flex min-h-11 flex-col gap-1 overflow-hidden rounded-[14px] border border-card-border bg-surface-container-lowest py-2 pl-4 pr-2 text-on-surface no-underline shadow-sm hover:border-primary hover:shadow-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-primary',
          e.closed && 'bg-surface-container-low text-on-surface-variant shadow-none',
        )}
      >
        <span aria-hidden="true" className={cx('absolute bottom-0 left-0 top-0 w-1.5', BAR[e.state])} />
        <span className={cx('text-[13px] font-extrabold leading-[18px]', e.closed && 'line-through')}>
          {e.timeText}
        </span>
        <span className="break-words text-[14px] font-bold leading-5">
          {e.subjectName} · {e.childName}
        </span>
        <StatusChip
          kind={e.chip.kind}
          className="max-w-full self-start whitespace-normal! px-2 py-0.5 text-[12px] leading-4"
        >
          {e.chip.text}
        </StatusChip>
        {e.cancelNote ? <span className="text-[12px] leading-4 text-on-surface-variant">{e.cancelNote}</span> : null}
      </a>
    </li>
  );
}

function Day({ day }: { day: CalendarDay }) {
  const note = windowNote(day);
  const headId = `day-${day.date}`;
  return (
    <li
      data-testid="calendar-day"
      data-date={day.date}
      className={cx(
        'flex min-w-0 flex-col gap-2 rounded-[20px] border border-card-border p-3',
        day.isToday ? 'border-2 border-primary bg-primary-fixed/20' : 'bg-surface-container-low/40',
        (day.window.kind === 'past' || day.window.kind === 'beyond') && !day.isToday && 'opacity-90',
      )}
    >
      <h3 id={headId} className="m-0 flex items-baseline justify-between gap-2 text-[15px] font-extrabold leading-5">
        <span>
          <span className="sr-only">{day.long}</span>
          <span aria-hidden="true">
            {day.short} <span className="font-headline text-[18px]">{day.dayMonth}</span>
          </span>
        </span>
        {day.isToday ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-on-primary">
            Today
          </span>
        ) : null}
      </h3>
      {note ? <p className="m-0 text-[12px] font-bold leading-4 text-on-surface-variant">{note}</p> : null}
      {day.entries.length ? (
        <ul aria-label={`Lessons on ${day.long}`} className="m-0 flex list-none flex-col gap-2 p-0">
          {day.entries.map((e) => (
            <Entry key={e.id} e={e} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] leading-[18px] text-on-surface-variant">No lessons</p>
      )}
      {day.usual.length ? (
        <div className="mt-auto flex flex-col gap-0.5 border-t border-dashed border-outline-variant pt-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-on-surface-variant">
            Usually free
          </span>
          {day.usual.map((u) => (
            <span key={u} className="text-[12px] leading-4 text-on-surface-variant">
              {u}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

const NAV =
  'inline-flex min-h-11 items-center gap-1 rounded-full border border-outline px-3.5 text-[14px] font-extrabold text-on-surface no-underline hover:bg-surface-container focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-primary';
const NAV_OFF =
  'inline-flex min-h-11 items-center gap-1 rounded-full border border-outline-variant px-3.5 text-[14px] font-extrabold text-on-surface-variant opacity-60';

export function TeacherWeekCalendar({
  week,
  href,
  zoneText,
}: {
  week: CalendarWeek;
  /** The page URL for another week (a Monday, YYYY-MM-DD). */
  href: (weekStart: string) => string;
  /** "India Standard Time (Asia/Kolkata)" */
  zoneText: string;
}) {
  const t = week.totals;
  const summary = [
    `${t.confirmed} ${t.confirmed === 1 ? 'lesson' : 'lessons'}${t.minutes ? ` (${formatTeachingTime(t.minutes)})` : ''}`,
    t.requests ? `${t.requests} ${t.requests === 1 ? 'request' : 'requests'} to answer` : null,
    t.toRecord ? `${t.toRecord} to record` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section id="week" aria-labelledby="week-title" className={cx(SHELL, 'scroll-mt-24')} data-testid="week-calendar">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border bg-[linear-gradient(135deg,rgba(30,142,90,.08),rgba(0,97,148,.08))] px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="week-title" className="m-0 flex items-center gap-2 font-headline text-[22px] font-bold leading-7">
            <Icon name="calendar_view_week" className="text-primary" />
            <span>
              Week of <span data-testid="week-title">{week.title}</span>
            </span>
          </h2>
          <p className="m-0 text-[14px] leading-5 text-on-surface-variant" data-testid="week-summary">
            {summary}. Times are in {zoneText}.
          </p>
        </div>
        <nav aria-label="Choose a week" className="flex flex-wrap items-center gap-2">
          {week.prev ? (
            <Link href={href(week.prev)} className={NAV} scroll={false}>
              <Icon name="keyboard_arrow_down" size={18} className="rotate-90" />
              Previous week
            </Link>
          ) : (
            <span aria-disabled="true" className={NAV_OFF}>
              <Icon name="keyboard_arrow_down" size={18} className="rotate-90" />
              Previous week
            </span>
          )}
          {week.isCurrent ? (
            <span aria-current="date" className={cx(NAV_OFF, 'opacity-100')}>
              This week
            </span>
          ) : (
            <Link href={href(week.current)} className={NAV} scroll={false}>
              This week
            </Link>
          )}
          {week.next ? (
            <Link href={href(week.next)} className={NAV} scroll={false}>
              Next week
              <Icon name="keyboard_arrow_down" size={18} className="-rotate-90" />
            </Link>
          ) : (
            <span aria-disabled="true" className={NAV_OFF}>
              Next week
              <Icon name="keyboard_arrow_down" size={18} className="-rotate-90" />
            </span>
          )}
        </nav>
      </div>
      <div className="flex flex-col gap-3 px-3 py-4 sm:px-5">
        <ol
          aria-label={`Days, ${week.title}`}
          className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-7"
        >
          {week.days.map((d) => (
            <Day key={d.date} day={d} />
          ))}
        </ol>
        <p className="m-0 px-1 text-[13px] leading-[18px] text-on-surface-variant">
          Choose a lesson to see it below with its actions. Families can request lessons from 24 hours to 4 weeks ahead,
          inside your usual times; you accept or decline each request. Lessons can be cancelled up to 30 minutes before
          the start.
        </p>
      </div>
    </section>
  );
}
