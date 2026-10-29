import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { CHOICE_CARD, OVERLAY_INPUT, SHELL } from '@/components/ui/styles';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { formatClock, formatLessonTime, localDate } from '@/lib/lessonDisplay';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import {
  LESSON_MINUTES_MAX,
  LESSON_MINUTES_MIN,
  LESSON_MINUTES_STEP,
  NOTICE_HOURS,
  WINDOW_DAYS,
} from '@/server/lessons';
import { rolePlaceholder } from '@/server/placeholder';
import { plannableChapters, proposalBusyTimes, proposalHistory, proposalOptions } from '@/server/proposals';
import { ProposeForm } from './ProposeForm';

export const metadata: Metadata = { title: 'Schedule a class' };
export const dynamic = 'force-dynamic';

const LENGTHS = Array.from(
  { length: (LESSON_MINUTES_MAX - LESSON_MINUTES_MIN) / LESSON_MINUTES_STEP + 1 },
  (_, i) => LESSON_MINUTES_MIN + i * LESSON_MINUTES_STEP,
);
// Demo mode keeps its placeholder: nothing is stored there.
const DemoPlaceholder = rolePlaceholder(
  'teacher',
  'Schedule a class',
  'Scheduling a class for a linked child is available with real accounts. A lesson you propose is only booked when the parent accepts it.',
);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * TL-3 "Schedule a class" (WF-06, WF-07, WF-10, WF-11): the teacher proposes one lesson to a child
 * linked to them now, in a ticked subject (D-TLS-2). Step 1 is a plain form (works without
 * JavaScript); step 2 sends the proposal. Beside it, the child's past lessons with this teacher in
 * this subject (D-E2E-4). OC-45: nothing is booked until a parent accepts.
 */
export default async function ProposePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isDemoMode()) return DemoPlaceholder();
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const raw = await searchParams;
  const now = clockNow();
  const sql = db();
  const options = await proposalOptions(sql, access.viewer.id);
  const tz = options.timeZone;
  const choices = options.children.flatMap((c) => c.subjects.map((s) => ({ child: c, subject: s as SubjectId })));
  const pick = one(raw.pick);
  const chosen =
    choices.find((x) => `${x.child.id}.${x.subject}` === pick) ?? (choices.length === 1 ? choices[0]! : null);
  const chapters = chosen ? await plannableChapters(sql, access.viewer.id, chosen.child.id, chosen.subject) : [];
  const history = chosen ? await proposalHistory(sql, access.viewer.id, chosen.child.id, chosen.subject, now) : [];
  const busy = chosen ? await proposalBusyTimes(sql, access.viewer.id, chosen.child.id, chosen.subject, now) : [];
  const zone = `${formatZoneName(now.toISOString(), { timeZone: tz })}, ${tz}`;

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <Link href="/teacher/schedule" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ My schedule
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Schedule a class</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Propose a 1-on-1 lesson to a child linked to you. The child’s parents accept or decline it; nothing is booked
          until one of them accepts. Times are in your time zone ({zone}).
        </p>
      </div>

      {!options.allowed ? (
        <FormMessage tone="info">
          You can schedule classes once your teacher account is approved and active.
        </FormMessage>
      ) : !options.hasRate ? (
        <EmptyState
          title="Add your hourly rate first"
          action={<LinkButton href="/teacher/listing">My listing</LinkButton>}
        >
          A proposal shows the family its price, worked out from your listed or agreed rate, so you need an hourly rate
          before you can schedule a class.
        </EmptyState>
      ) : choices.length === 0 ? (
        <EmptyState
          title="No children linked yet"
          action={<LinkButton href="/teacher/students">My students</LinkButton>}
        >
          You can schedule classes for children whose parents have linked you, in the subjects they ticked.
        </EmptyState>
      ) : (
        <>
          <form method="get" action="/teacher/propose" className={cx(SHELL, 'flex flex-col gap-5 p-5 sm:p-7')}>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-3 text-[17px] font-bold">1. Who is the lesson for?</legend>
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                {choices.map((x) => {
                  const value = `${x.child.id}.${x.subject}`;
                  return (
                    <li key={value}>
                      <label className={CHOICE_CARD}>
                        <input
                          type="radio"
                          name="pick"
                          value={value}
                          defaultChecked={chosen ? value === `${chosen.child.id}.${chosen.subject}` : false}
                          required
                          className={OVERLAY_INPUT}
                        />
                        <span className="flex flex-col gap-0.5">
                          <strong className="text-[17px]">
                            {x.child.name}: {SUBJECTS[x.subject].name}
                          </strong>
                          <span className="text-sm text-on-surface-variant">
                            {x.child.grade ? `Grade ${x.child.grade}` : 'Grade not set'}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <div>
              <Button type="submit" variant="secondary">
                Continue
              </Button>
            </div>
          </form>

          {chosen ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section aria-labelledby="when" className={cx(SHELL, 'flex flex-col gap-5 p-5 sm:p-7')}>
                <h2 id="when" className="m-0 text-[22px] font-bold leading-7">
                  2. When, how long, and what you plan
                </h2>
                <ProposeForm
                  key={`${chosen.child.id}.${chosen.subject}`}
                  childId={chosen.child.id}
                  subject={chosen.subject}
                  childName={chosen.child.name}
                  subjectName={SUBJECTS[chosen.subject].name}
                  firstDate={localDate(new Date(now.getTime() + NOTICE_HOURS * 3_600_000), tz)}
                  lastDate={localDate(new Date(now.getTime() + WINDOW_DAYS * 86_400_000), tz)}
                  lengths={LENGTHS}
                  defaultMinutes={30}
                  chapters={chapters}
                  zone={zone}
                  busy={busy.map((b) => ({
                    when: `${formatLessonTime(b.startsAt, tz)}–${formatClock(b.endsAt, tz)}`,
                    whose: b.whose,
                  }))}
                />
              </section>
              <section
                aria-labelledby="history"
                className={cx(SHELL, 'flex flex-col gap-3 p-5 sm:p-6')}
                data-testid="proposal-history"
              >
                <h2 id="history" className="m-0 text-[19px] font-bold leading-[26px]">
                  {chosen.child.name}’s recent {SUBJECTS[chosen.subject].name} lessons with you
                </h2>
                {history.length ? (
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {history.map((h) => (
                      <li key={h.id} className="flex flex-col gap-0.5 border-b border-card-border pb-3 last:border-0">
                        <strong className="text-[15px] leading-[22px]">
                          {formatLessonTime(h.startsAt, tz)} · {h.minutes} min
                        </strong>
                        <span className="text-sm leading-5">
                          {h.outcome === 'taught'
                            ? 'Took place'
                            : h.outcome === 'not_taken_place'
                              ? 'Did not take place'
                              : 'Outcome not recorded yet'}
                        </span>
                        {h.chapters.length ? (
                          <span className="break-words text-sm leading-5 text-on-surface-variant">
                            {h.chapters.map((c) => c.label).join('; ')}
                          </span>
                        ) : (
                          <span className="text-sm leading-5 text-on-surface-variant">No chapters recorded</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-sm leading-5 text-on-surface-variant">No past lessons with you yet.</p>
                )}
              </section>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
