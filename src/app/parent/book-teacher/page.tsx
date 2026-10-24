import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { CHOICE_CARD, INPUT, OVERLAY_INPUT, SHELL } from '@/components/ui/styles';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { formatClock, formatDayName, formatMoney, localDate } from '@/lib/lessonDisplay';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { rolePlaceholder } from '@/server/placeholder';
import {
  bookingOptions,
  freeTimes,
  defaultLessonMinutes,
  LESSON_MINUTES_MAX,
  LESSON_MINUTES_MIN,
  LESSON_MINUTES_STEP,
  NOTICE_HOURS,
  validMinutes,
  WINDOW_DAYS,
} from '@/server/lessons';
import { DayGrid } from './DayGrid';
import { RequestForm } from './RequestForm';

export const metadata: Metadata = { title: 'Book a human teacher' };
export const dynamic = 'force-dynamic';

const LENGTHS = Array.from(
  { length: (LESSON_MINUTES_MAX - LESSON_MINUTES_MIN) / LESSON_MINUTES_STEP + 1 },
  (_, i) => LESSON_MINUTES_MIN + i * LESSON_MINUTES_STEP,
);
const DemoPlaceholder = rolePlaceholder(
  'parent',
  'Book a human teacher',
  'Booking a teacher needs real accounts and the Zoom connection, which come in later phases.',
);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Book a teacher (CR-17 PR 2): a parent requests an hourly lesson of 10–40 minutes for one
 * child with a teacher linked to that child in that subject. Three steps on one page, each a
 * plain form, so it works without JavaScript: who and how long; the day; the start time. Only
 * times the rules allow are offered (§2.2), and the server and database check again on sending.
 * Demo mode keeps its placeholder: nothing is stored there.
 */
export default async function BookTeacherPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Demo mode: the existing placeholder, unchanged (nothing is stored in the demo).
  if (isDemoMode()) return DemoPlaceholder();
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const raw = await searchParams;
  const tz = access.viewer.timeZone;
  const now = clockNow();
  const sql = db();
  const options = await bookingOptions(sql, access.viewer.id);
  const choices = options.flatMap((c) =>
    c.teachers.flatMap((t) => t.subjects.map((s) => ({ child: c, teacher: t, subject: s as SubjectId }))),
  );
  const pick = one(raw.pick);
  const chosen = choices.find((x) => `${x.child.id}.${x.teacher.id}.${x.subject}` === pick) ?? null;
  // F6 (D3A-15): the length defaults to the chosen teacher's usual (listed) length, on the
  // 5-minute steps a lesson can have (a listed 32 minutes becomes 30), until the parent picks one.
  const minutesRaw = Number(one(raw.m));
  const chosenLength = validMinutes(minutesRaw) ? minutesRaw : null;
  const usualStep = defaultLessonMinutes(chosen?.teacher.hourly?.minutes);
  const minutes = chosenLength ?? usualStep ?? 30;
  const free =
    chosen && chosen.teacher.hourly
      ? await freeTimes(
          sql,
          access.viewer.id,
          { childId: chosen.child.id, teacherId: chosen.teacher.id, subject: chosen.subject, minutes, parentZone: tz },
          now,
        )
      : null;
  const days = free?.ok ? free.days : [];
  const day = days.find((d) => d.date === one(raw.d)) ?? days[0] ?? null;
  const zone = `${formatZoneName(now.toISOString(), { timeZone: tz })}, ${tz}`;
  const base = (extra: Record<string, string>) =>
    `/parent/book-teacher?${new URLSearchParams({ pick, m: chosenLength ? String(chosenLength) : '', ...extra }).toString()}`;

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <Link href="/parent" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ Family home
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Book a teacher</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Request a 1-on-1 lesson with a teacher linked to your child. Nothing is booked until the teacher accepts.
          Times are shown in your time zone ({zone}).
        </p>
      </div>

      {options.length === 0 ? (
        <EmptyState title="No children yet" action={<LinkButton href="/parent/children/new">Add a child</LinkButton>}>
          Add your child first, then link a teacher.
        </EmptyState>
      ) : choices.length === 0 ? (
        <EmptyState title="No teacher linked yet" action={<LinkButton href="/parent/teachers">My teachers</LinkButton>}>
          You can request lessons once a teacher has accepted your request to teach your child.
        </EmptyState>
      ) : (
        <>
          <form method="get" action="/parent/book-teacher" className={cx(SHELL, 'flex flex-col gap-5 p-5 sm:p-7')}>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-3 text-[17px] font-bold">1. Who is the lesson for, and with whom?</legend>
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                {choices.map((x) => {
                  const value = `${x.child.id}.${x.teacher.id}.${x.subject}`;
                  const rate = x.teacher.hourly;
                  return (
                    <li key={value}>
                      <label className={cx(CHOICE_CARD, !rate && 'cursor-not-allowed opacity-60')}>
                        <input
                          type="radio"
                          name="pick"
                          value={value}
                          defaultChecked={value === pick || (!pick && choices.length === 1)}
                          disabled={!rate}
                          required
                          className={OVERLAY_INPUT}
                        />
                        <span className="flex flex-col gap-0.5">
                          <strong className="text-[17px]">
                            {x.child.name}: {SUBJECTS[x.subject].name} with {x.teacher.name}
                          </strong>
                          <span className="text-sm text-on-surface-variant">
                            {rate
                              ? `Listed rate ${formatMoney(rate.rateMinor, rate.currency)} an hour · usual lesson ${rate.minutes} min`
                              : 'This teacher hasn’t set an hourly rate yet'}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="lesson-length" className="text-[17px] font-bold">
                  2. How long?
                </label>
                <select
                  id="lesson-length"
                  name="m"
                  defaultValue={chosenLength ? String(chosenLength) : ''}
                  className={cx(INPUT, 'min-h-12 w-auto min-w-40')}
                >
                  <option value="">
                    {usualStep ? `Teacher’s usual length (${usualStep} minutes)` : 'Teacher’s usual length'}
                  </option>
                  {LENGTHS.map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="secondary">
                Show free times
              </Button>
            </div>
            <p className="m-0 text-sm leading-5 text-on-surface-variant">
              Lessons are 10 to 40 minutes. You can request one at least 24 hours and up to 4 weeks ahead.
            </p>
          </form>

          {chosen ? (
            <section aria-labelledby="free-times" className={cx(SHELL, 'flex flex-col gap-5 p-5 sm:p-7')}>
              <h2 id="free-times" className="m-0 text-[22px] font-bold leading-7">
                3. Choose a day and time
              </h2>
              {free && !free.ok ? (
                <FormMessage tone="info">
                  {free.reason === 'no_rate'
                    ? 'This teacher hasn’t set an hourly rate yet, so lessons can’t be requested.'
                    : 'This teacher isn’t linked to this child for this subject any more.'}
                </FormMessage>
              ) : days.length === 0 || !day ? (
                <FormMessage tone="info">
                  No free {minutes}-minute times in the next 4 weeks. Try a shorter lesson, or ask the teacher to add
                  usual times.
                </FormMessage>
              ) : (
                <>
                  <DayGrid
                    first={localDate(new Date(now.getTime() + NOTICE_HOURS * 3_600_000), tz)}
                    last={localDate(new Date(now.getTime() + WINDOW_DAYS * 86_400_000), tz)}
                    free={new Map(days.map((d) => [d.date, d.times.length]))}
                    chosen={day.date}
                    href={(d) => base({ d })}
                  />
                  {day.alreadyRequested ? (
                    <p className="m-0 text-sm leading-5 text-on-surface-variant">
                      {day.alreadyRequested} {day.alreadyRequested === 1 ? 'time' : 'times'} on this day{' '}
                      {day.alreadyRequested === 1 ? 'is' : 'are'} hidden: already requested for {chosen.child.name} with
                      this teacher. See Family calendar.
                    </p>
                  ) : null}
                  <RequestForm
                    key={`${pick}-${minutes}-${day.date}`}
                    childId={chosen.child.id}
                    teacherId={chosen.teacher.id}
                    subject={chosen.subject}
                    minutes={minutes}
                    dayName={formatDayName(day.date)}
                    options={day.times.map((t) => ({
                      value: `${t.startsAt.toISOString()}|${t.priceMinor}|${t.currency}|${t.basis}`,
                      clock: formatClock(t.startsAt, tz),
                      price: formatMoney(t.priceMinor, t.currency),
                      rate: formatMoney(t.rateMinor, t.currency),
                      agreed: t.basis === 'agreed',
                    }))}
                    summary={`${minutes}-minute ${SUBJECTS[chosen.subject].name} lesson for ${chosen.child.name} with ${chosen.teacher.name}. Each price is for the whole ${minutes}-minute lesson: the hourly rate × ${minutes} ÷ 60. The teacher has 48 hours to answer (less when the lesson is sooner). Prices are for information: AA Pro takes no payment.`}
                  />
                </>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
