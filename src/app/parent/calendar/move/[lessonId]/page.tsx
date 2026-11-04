import type { Metadata } from 'next';
import Link from 'next/link';
import { FormMessage } from '@/components/forms/FormMessage';
import { AccessDenied } from '@/components/states/AccessDenied';
import { SHELL } from '@/components/ui/styles';
import { SUBJECTS } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { formatClock, formatDayName, formatLessonTime, formatMoney, localDate } from '@/lib/lessonDisplay';
import { MOVE_TEXT } from '@/lib/moveText';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { chaptersForRequest } from '@/server/books';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { freeTimes, moveTarget, NOTICE_HOURS, WINDOW_DAYS } from '@/server/lessons';
import { rolePlaceholder } from '@/server/placeholder';
import { DayGrid } from '../../../book-teacher/DayGrid';
import { RequestForm } from '../../../book-teacher/RequestForm';

export const metadata: Metadata = { title: 'Move lesson' };
export const dynamic = 'force-dynamic';

const DemoPlaceholder = rolePlaceholder(
  'parent',
  'Move lesson',
  'Moving a lesson is available with real accounts. The lesson stays booked until the teacher accepts the new time.',
);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * TL-4: a parent asks to move a booked lesson of their child (request rules: the teacher's usual
 * times, 30-minute grid, 24 hours to 4 weeks ahead; the same length). Either active parent of the
 * child; only a confirmed lesson more than 30 minutes away with no move waiting (lessons.moveTarget,
 * checked again on sending and by the database). The lesson stays booked until the teacher accepts.
 */
export default async function ParentMovePage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isDemoMode()) return DemoPlaceholder();
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { lessonId } = await params;
  const raw = await searchParams;
  const now = clockNow();
  const sql = db();
  const tz = access.viewer.timeZone;
  const target = await moveTarget(sql, { id: access.viewer.id, role: 'parent' }, lessonId, now);
  if (!target.ok && target.reason === 'not_found') return <AccessDenied viewerRole="parent" />;
  const back = (
    <Link href="/parent/calendar" className="inline-flex min-h-11 items-center self-start font-bold">
      ‹ Family calendar
    </Link>
  );
  if (!target.ok) {
    return (
      <div className="mx-auto flex max-w-[980px] flex-col gap-6">
        {back}
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Move lesson</h1>
        <FormMessage tone="info">{MOVE_TEXT[target.reason]}</FormMessage>
      </div>
    );
  }
  const l = target.lesson;
  const subjectName = SUBJECTS[l.subject].name;
  const free = await freeTimes(
    sql,
    access.viewer.id,
    {
      childId: l.childId,
      teacherId: l.teacherId,
      subject: l.subject,
      minutes: l.minutes,
      parentZone: tz,
      movingLessonId: l.id,
    },
    now,
  );
  const days = free.ok ? free.days : [];
  const day = days.find((d) => d.date === one(raw.d)) ?? days[0] ?? null;
  const chapters = await chaptersForRequest(sql, access.viewer.id, l.childId, l.subject);
  const zone = `${formatZoneName(now.toISOString(), { timeZone: tz })}, ${tz}`;
  const end = new Date(l.startsAt.getTime() + l.minutes * 60_000);
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      {back}
      <div className="flex flex-col gap-2">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Move lesson</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          {l.childName}’s {subjectName} lesson with {l.teacherName}, booked for {formatLessonTime(l.startsAt, tz)}–
          {formatClock(end, tz)} · {l.minutes} min. It stays booked until the teacher accepts the new time. Times are in
          your time zone ({zone}).
        </p>
      </div>
      <section aria-labelledby="new-time" className={cx(SHELL, 'flex flex-col gap-5 p-5 sm:p-7')}>
        <h2 id="new-time" className="m-0 text-[22px] font-bold leading-7">
          Choose a new day and time
        </h2>
        {!free.ok ? (
          <FormMessage tone="info">
            {free.reason === 'no_rate'
              ? 'This teacher hasn’t set an hourly rate, so a new time can’t be requested.'
              : 'This teacher isn’t linked to this child for this subject any more.'}
          </FormMessage>
        ) : days.length === 0 || !day ? (
          <FormMessage tone="info">
            No free {l.minutes}-minute times in the next 4 weeks. The lesson stays booked; you can ask the teacher to
            propose a new time instead.
          </FormMessage>
        ) : (
          <>
            <DayGrid
              first={localDate(new Date(now.getTime() + NOTICE_HOURS * 3_600_000), tz)}
              last={localDate(new Date(now.getTime() + WINDOW_DAYS * 86_400_000), tz)}
              free={new Map(days.map((d) => [d.date, d.times.length]))}
              chosen={day.date}
              href={(d) => `/parent/calendar/move/${l.id}?${new URLSearchParams({ d }).toString()}`}
            />
            <RequestForm
              key={day.date}
              childId={l.childId}
              teacherId={l.teacherId}
              subject={l.subject}
              minutes={l.minutes}
              dayName={formatDayName(day.date)}
              options={day.times.map((t) => ({
                value: `${t.startsAt.toISOString()}|${t.priceMinor}|${t.currency}|${t.basis}`,
                clock: formatClock(t.startsAt, tz),
                price: formatMoney(t.priceMinor, t.currency),
                rate: formatMoney(t.rateMinor, t.currency),
                agreed: t.basis === 'agreed',
              }))}
              chapters={chapters}
              childName={l.childName}
              subjectName={subjectName}
              replacesLessonId={l.id}
              summary={`Moves ${l.childName}’s ${l.minutes}-minute ${subjectName} lesson with ${l.teacherName}. The teacher must answer within 48 hours, and at least 30 minutes before the lesson; until then it stays booked at its current time. Open material requests move with it. The price for the new time may differ and is for information: AA Pro takes no payment.`}
            />
          </>
        )}
      </section>
    </div>
  );
}
