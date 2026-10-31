import type { Metadata } from 'next';
import { LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { joinRefusalText } from '@/components/lessons/joinMessages';
import { LessonCard } from '@/components/lessons/LessonCard';
import { LessonJoinStatus } from '@/components/lessons/LessonJoinStatus';
import { MaterialRequestList } from '@/components/lessons/MaterialRequestList';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { SUBJECTS } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { formatLessonTime } from '@/lib/lessonDisplay';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { type LessonItem, lessonsForParent } from '@/server/lessons';
import { materialRequestsFor, type ShareOption, shareOptions } from '@/server/materialRequests';
import { rolePlaceholder } from '@/server/placeholder';
import { ParentLessonButton } from './LessonForms';
import { MaterialAnswerForm } from './MaterialForms';

export const metadata: Metadata = { title: 'Family calendar' };
export const dynamic = 'force-dynamic';

const DONE: Record<string, { tone: 'success' | 'info'; text: string }> = {
  withdrawn: { tone: 'success', text: 'Request withdrawn. The teacher has been told.' },
  cancelled: { tone: 'success', text: 'Lesson cancelled. The teacher has been told.' },
  expired: { tone: 'info', text: 'That request had already expired.' },
  closed: { tone: 'info', text: 'That lesson or request is no longer open.' },
  // TL-2: material requests. Notices are in AA Pro only: no email or WhatsApp is sent.
  material_shared: { tone: 'success', text: 'Shared. The teacher sees it in AA Pro, view only.' },
  material_unavailable: {
    tone: 'success',
    text: 'Saved. The teacher sees that it isn’t available. The lesson doesn’t change.',
  },
  material_closed: { tone: 'info', text: 'That material request is no longer open.' },
};

const DemoPlaceholder = rolePlaceholder(
  'parent',
  'Family calendar',
  'The full family calendar comes with scheduling (Phase 3). This week’s lessons are on Family home.',
);

/**
 * The family's Human Teacher lessons (CR-17 PR 2): requests waiting for the teacher, upcoming
 * lessons, and the last 30 days. Either parent of a child sees and manages the same lessons
 * (D3A-25). Times are in this parent's time zone. Demo mode keeps its placeholder.
 */
export default async function FamilyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isDemoMode()) return DemoPlaceholder();
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const raw = await searchParams;
  const done = typeof raw.done === 'string' ? raw.done : '';
  const refused = joinRefusalText(raw.join);
  const tz = access.viewer.timeZone;
  const now = clockNow();
  const all = await lessonsForParent(db(), access.viewer.id, now);
  // TL-2: the teachers' material requests on these lessons, and what this parent may share for each
  // open one (only books the lesson's teacher can already view; checked again on sharing).
  const materials = await materialRequestsFor(
    db(),
    { id: access.viewer.id, role: 'parent' },
    all.map((l) => l.id),
    now,
  );
  const choices = new Map<string, ShareOption[]>();
  for (const list of materials.values())
    for (const r of list) if (r.canAnswer) choices.set(r.id, await shareOptions(db(), access.viewer.id, r.id));
  // TL-3 (OC-45): teachers' proposals waiting for a parent of the child to accept or decline.
  const forYou = all.filter((l) => l.status === 'proposed');
  const waiting = all.filter((l) => l.status === 'requested');
  const upcoming = all.filter((l) => l.status === 'confirmed' && l.endsAt > now);
  const past = all.filter((l) => !forYou.includes(l) && !waiting.includes(l) && !upcoming.includes(l)).reverse();
  const describe = (l: LessonItem) =>
    `${l.childName}’s lesson with ${l.teacherName}, ${formatLessonTime(l.startsAt, tz)}`;
  const latest =
    done === 'requested'
      ? [...waiting].sort((a, b) => b.replyDeadline.getTime() - a.replyDeadline.getTime())[0]
      : undefined;

  const list = (items: LessonItem[]) => (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {items.map((l) => (
        <li key={l.id}>
          <LessonCard
            lesson={l}
            viewer="parent"
            timeZone={tz}
            actions={
              l.canAnswer ? (
                <LinkButton href={`/parent/bookings/${l.id}`} aria-label={`Review and answer: ${describe(l)}`}>
                  Review and answer
                </LinkButton>
              ) : l.canWithdraw ? (
                <ParentLessonButton lessonId={l.id} kind="withdraw" label={describe(l)} />
              ) : l.status === 'confirmed' && !l.ended ? (
                <>
                  <LessonJoinStatus
                    startIso={l.startsAt.toISOString()}
                    endIso={l.endsAt.toISOString()}
                    nowIso={now.toISOString()}
                    timeZone={tz}
                    lessonId={l.id}
                    ready={l.meeting.allowed && l.meeting.added}
                    waiting={
                      l.meeting.allowed ? 'The teacher hasn’t added the link yet' : 'Allow the teacher’s links to join'
                    }
                    size="md"
                    label={describe(l)}
                  />
                  {!l.meeting.allowed ? (
                    <LinkButton
                      href={`/parent/teachers/${l.teacherId}`}
                      variant="secondary"
                      aria-label={`Allow meeting links: ${describe(l)}`}
                    >
                      Allow meeting links
                    </LinkButton>
                  ) : null}
                  {l.canCancel ? <ParentLessonButton lessonId={l.id} kind="cancel" label={describe(l)} /> : null}
                </>
              ) : null
            }
          >
            <MaterialRequestList
              lessonId={l.id}
              requests={materials.get(l.id) ?? []}
              viewer="parent"
              actions={(r) =>
                r.canAnswer ? (
                  <MaterialAnswerForm
                    requestId={r.id}
                    label={`${r.what}, ${describe(l)}`}
                    choices={choices.get(r.id) ?? []}
                    noneText={`None of your published ${SUBJECTS[l.subject].name} books is shared with ${l.childName} yet.`}
                  />
                ) : null
              }
            />
          </LessonCard>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">Family calendar</h1>
          <p className="m-0 text-body-md text-on-surface-variant">
            Your children’s lessons with human teachers. Times are in your time zone (
            {formatZoneName(now.toISOString(), { timeZone: tz })}, {tz}).
          </p>
        </div>
        <LinkButton href="/parent/book-teacher">Book a teacher</LinkButton>
      </div>
      {done === 'requested' ? (
        <FormMessage tone="success">
          Request sent.{' '}
          {latest
            ? `${latest.teacherName} has until ${formatLessonTime(latest.replyDeadline, tz)} to answer. You’ll see the answer here and in your notifications.`
            : 'You’ll see the answer here and in your notifications.'}
        </FormMessage>
      ) : DONE[done] ? (
        <FormMessage tone={DONE[done]!.tone}>{DONE[done]!.text}</FormMessage>
      ) : null}
      {refused ? <FormMessage tone="info">{refused}</FormMessage> : null}

      {forYou.length ? (
        <section aria-labelledby="for-you" className="flex flex-col gap-3">
          <h2 id="for-you" className="m-0 text-[22px] font-bold leading-7">
            Waiting for you
          </h2>
          {list(forYou)}
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            A teacher proposed these lessons. Either parent can accept or decline; nothing is booked until one of you
            accepts.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="waiting" className="flex flex-col gap-3">
        <h2 id="waiting" className="m-0 text-[22px] font-bold leading-7">
          Waiting for the teacher
        </h2>
        {waiting.length ? (
          list(waiting)
        ) : (
          <p className="m-0 text-body-md text-on-surface-variant">No requests are waiting for an answer.</p>
        )}
      </section>

      <section aria-labelledby="upcoming" className="flex flex-col gap-3">
        <h2 id="upcoming" className="m-0 text-[22px] font-bold leading-7">
          Upcoming lessons
        </h2>
        {upcoming.length ? (
          list(upcoming)
        ) : (
          <EmptyState
            title="No lessons booked"
            action={<LinkButton href="/parent/book-teacher">Book a teacher</LinkButton>}
          >
            When a teacher accepts a request, the lesson appears here.
          </EmptyState>
        )}
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          Lessons can be cancelled up to 30 minutes before the start. To move one, cancel it and request a new time.
          Prices are for information: AA Pro takes no payment.
        </p>
      </section>

      {past.length ? (
        <section aria-labelledby="past" className="flex flex-col gap-3">
          <h2 id="past" className="m-0 text-[22px] font-bold leading-7">
            Past and closed
          </h2>
          {list(past)}
        </section>
      ) : null}
    </div>
  );
}
