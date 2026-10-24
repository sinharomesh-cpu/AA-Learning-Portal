import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FormMessage } from '@/components/forms/FormMessage';
import { joinRefusalText } from '@/components/lessons/joinMessages';
import { LessonCard } from '@/components/lessons/LessonCard';
import { LessonJoinStatus } from '@/components/lessons/LessonJoinStatus';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { SUBJECTS } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { formatLessonTime } from '@/lib/lessonDisplay';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { type LessonItem, lessonsForTeacher } from '@/server/lessons';
import { rolePlaceholder } from '@/server/placeholder';
import { AnswerButtons, MeetingLinkForm, OutcomeButtons, TeacherCancelButton } from './ScheduleForms';

export const metadata: Metadata = { title: 'My schedule' };
export const dynamic = 'force-dynamic';

const DONE: Record<string, { tone: 'success' | 'info' | 'warning'; text: string }> = {
  accepted: { tone: 'success', text: 'Accepted. The family has been told.' },
  declined: { tone: 'success', text: 'Declined. The family has been told.' },
  cancelled: { tone: 'success', text: 'Lesson cancelled. The family has been told.' },
  recorded: { tone: 'success', text: 'Saved.' },
  time_taken: {
    tone: 'warning',
    text: 'This time is no longer free, so the request has been closed and the family told.',
  },
  expired: { tone: 'info', text: 'That request is no longer open: it expired before it was answered.' },
  not_linked: { tone: 'info', text: 'You are no longer linked to this child for this subject.' },
  closed: { tone: 'info', text: 'That request or lesson is no longer open.' },
  link_saved: {
    tone: 'success',
    text: 'Meeting link saved. The family has been told; the link itself is not shown to anyone.',
  },
  link_same: { tone: 'info', text: 'That is the link already saved for this lesson.' },
  link_not_allowed: {
    tone: 'warning',
    text: 'The parent hasn’t allowed your meeting links for this child, so the link wasn’t saved.',
  },
};

const DemoPlaceholder = rolePlaceholder(
  'teacher',
  'My schedule',
  'Your full schedule comes with scheduling (Phase 3). Upcoming lessons are on your dashboard.',
);

/**
 * The teacher's lessons (CR-17 PR 2): requests to accept or decline, upcoming lessons, lessons
 * whose outcome is still to be recorded, and the last 30 days. Only students linked to this
 * teacher now, in that subject. Times are in the teacher's time zone. Demo keeps its placeholder.
 */
export default async function TeacherSchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isDemoMode()) return DemoPlaceholder();
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const raw = await searchParams;
  const done = DONE[typeof raw.done === 'string' ? raw.done : ''];
  const refused = joinRefusalText(raw.join);
  const tz = access.viewer.timeZone;
  const now = clockNow();
  const all = await lessonsForTeacher(db(), access.viewer.id, now);
  const requests = all.filter((l) => l.canAnswer);
  const outcome = all.filter((l) => l.needsOutcome);
  const upcoming = all.filter((l) => l.status === 'confirmed' && l.endsAt > now);
  const past = all.filter((l) => !requests.includes(l) && !outcome.includes(l) && !upcoming.includes(l)).reverse();
  const describe = (l: LessonItem) =>
    `${SUBJECTS[l.subject].name} with ${l.childName}, ${formatLessonTime(l.startsAt, tz)}`;

  const list = (items: LessonItem[], actions: (l: LessonItem) => ReactNode) => (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {items.map((l) => (
        <li key={l.id}>
          <LessonCard lesson={l} viewer="teacher" timeZone={tz} actions={actions(l)} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">My schedule</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Lesson requests and lessons with the children linked to you. Times are in your time zone (
          {formatZoneName(now.toISOString(), { timeZone: tz })}, {tz}).
        </p>
      </div>

      {done ? <FormMessage tone={done.tone}>{done.text}</FormMessage> : null}
      {refused ? <FormMessage tone="info">{refused}</FormMessage> : null}
      <section aria-labelledby="requests" className="flex flex-col gap-3">
        <h2 id="requests" className="m-0 text-[22px] font-bold leading-7">
          Requests to answer
        </h2>
        {requests.length ? (
          list(requests, (l) => <AnswerButtons lessonId={l.id} label={describe(l)} />)
        ) : (
          <p className="m-0 text-body-md text-on-surface-variant">No requests are waiting for you.</p>
        )}
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          A request expires if it isn’t answered within 48 hours, or 2 hours before the lesson if that is sooner.
          Accepting one closes any other request at an overlapping time.
        </p>
      </section>

      {outcome.length ? (
        <section aria-labelledby="outcome" className="flex flex-col gap-3">
          <h2 id="outcome" className="m-0 text-[22px] font-bold leading-7">
            Record how it went
          </h2>
          {list(outcome, (l) => (
            <OutcomeButtons lessonId={l.id} label={describe(l)} />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="upcoming" className="flex flex-col gap-3">
        <h2 id="upcoming" className="m-0 text-[22px] font-bold leading-7">
          Upcoming lessons
        </h2>
        {upcoming.length ? (
          list(upcoming, (l) => (
            <>
              <LessonJoinStatus
                startIso={l.startsAt.toISOString()}
                endIso={l.endsAt.toISOString()}
                nowIso={now.toISOString()}
                timeZone={tz}
                lessonId={l.id}
                ready={l.meeting.allowed && l.meeting.added}
                waiting={
                  l.meeting.allowed
                    ? 'Add your meeting link to open Join'
                    : 'Waiting for the parent to allow your links'
                }
                size="md"
                label={describe(l)}
              />
              {l.meeting.allowed ? (
                <MeetingLinkForm lessonId={l.id} label={describe(l)} added={l.meeting.added} />
              ) : null}
              {l.canCancel ? <TeacherCancelButton lessonId={l.id} label={describe(l)} /> : null}
            </>
          ))
        ) : (
          <EmptyState title="No lessons coming up">When you accept a request, the lesson appears here.</EmptyState>
        )}
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          Lessons can be cancelled up to 30 minutes before the start; the family is told. Lessons use your own Zoom
          meetings once a parent allows them; AA Pro doesn’t record them.
        </p>
      </section>

      {past.length ? (
        <section aria-labelledby="past" className="flex flex-col gap-3">
          <h2 id="past" className="m-0 text-[22px] font-bold leading-7">
            Past and closed
          </h2>
          {list(past, () => null)}
        </section>
      ) : null}
    </div>
  );
}
