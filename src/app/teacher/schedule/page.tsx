import type { Metadata } from 'next';
import type { ReactNode } from 'react';
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
import { type LessonItem, lessonsForTeacher, MAX_LESSON_CHAPTERS } from '@/server/lessons';
import { materialRequestsFor } from '@/server/materialRequests';
import { plannableChapters } from '@/server/proposals';
import { rolePlaceholder } from '@/server/placeholder';
import {
  AnswerButtons,
  AskForMaterialForm,
  MeetingLinkForm,
  OutcomeButtons,
  TeacherCancelButton,
  WithdrawMaterialButton,
  WithdrawProposalButton,
} from './ScheduleForms';

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
  // TL-3: proposals (OC-45: nothing is booked until a parent accepts).
  proposed: {
    tone: 'success',
    text: 'Proposal sent. The child’s parents see it in AA Pro; nothing is booked until one of them accepts.',
  },
  proposal_withdrawn: { tone: 'success', text: 'Proposal withdrawn. The family has been told.' },
  link_saved: {
    tone: 'success',
    text: 'Meeting link saved. The family has been told; the link itself is not shown to anyone.',
  },
  link_same: { tone: 'info', text: 'That is the link already saved for this lesson.' },
  // TL-2: material requests (in-app notices only).
  material_requested: {
    tone: 'success',
    text: 'Material request sent to the parent. They see it in AA Pro; no email or WhatsApp is sent.',
  },
  material_duplicate: {
    tone: 'info',
    text: 'That material is already requested for this lesson and waiting for the parent, so nothing new was sent.',
  },
  material_withdrawn: { tone: 'success', text: 'Material request withdrawn.' },
  material_closed: { tone: 'info', text: 'That lesson or material request is no longer open.' },
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
  // TL-2: material requests on these lessons that this teacher may see (checked again on the server).
  const materials = await materialRequestsFor(
    db(),
    { id: access.viewer.id, role: 'teacher' },
    all.map((l) => l.id),
    now,
  );
  const requests = all.filter((l) => l.canAnswer);
  const proposals = all.filter((l) => l.status === 'proposed');
  const outcome = all.filter((l) => l.needsOutcome);
  const upcoming = all.filter((l) => l.status === 'confirmed' && l.endsAt > now);
  const past = all
    .filter((l) => !requests.includes(l) && !proposals.includes(l) && !outcome.includes(l) && !upcoming.includes(l))
    .reverse();
  // TL-3 (D-E2E-3 (b)): chapters this teacher may plan when accepting, per child and subject.
  const plannable = new Map<string, Awaited<ReturnType<typeof plannableChapters>>>();
  for (const l of requests) {
    const key = `${l.childId}.${l.subject}`;
    if (!plannable.has(key)) plannable.set(key, await plannableChapters(db(), access.viewer.id, l.childId, l.subject));
  }
  const planFor = (l: LessonItem) =>
    // W-3 / D-TLS-6: never on a request whose parent gave a topic.
    l.chapters.some((c) => c.topic)
      ? undefined
      : {
          chapters: (plannable.get(`${l.childId}.${l.subject}`) ?? []).filter(
            (c) => !l.chapters.some((x) => x.label === c.label),
          ),
          max: MAX_LESSON_CHAPTERS - l.chapters.length,
          childName: l.childName,
          subjectName: SUBJECTS[l.subject].name,
        };
  const describe = (l: LessonItem) =>
    `${SUBJECTS[l.subject].name} with ${l.childName}, ${formatLessonTime(l.startsAt, tz)}`;

  const list = (items: LessonItem[], actions: (l: LessonItem) => ReactNode) => (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {items.map((l) => (
        <li key={l.id}>
          <LessonCard lesson={l} viewer="teacher" timeZone={tz} actions={actions(l)}>
            <MaterialRequestList
              lessonId={l.id}
              requests={materials.get(l.id) ?? []}
              viewer="teacher"
              actions={(r) =>
                r.canWithdraw ? <WithdrawMaterialButton requestId={r.id} label={`${r.what}, ${describe(l)}`} /> : null
              }
            />
            {/* TL2-2, TL3-1: requested, proposed or confirmed lessons that haven't ended; not lessons kept under OC-53. */}
            {(l.status === 'requested' || l.status === 'proposed' || l.status === 'confirmed') &&
            !l.ended &&
            !l.kept ? (
              <AskForMaterialForm
                // A new request changes the key, so the form starts again closed and empty.
                key={`${l.id}:${(materials.get(l.id) ?? []).map((r) => r.id).join(',')}`}
                lessonId={l.id}
                label={describe(l)}
                chapters={l.chapters}
              />
            ) : null}
          </LessonCard>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">My schedule</h1>
          <p className="m-0 text-body-md text-on-surface-variant">
            Lesson requests and lessons with the children linked to you. Times are in your time zone (
            {formatZoneName(now.toISOString(), { timeZone: tz })}, {tz}).
          </p>
        </div>
        <LinkButton href="/teacher/propose">Schedule a class</LinkButton>
      </div>

      {done ? <FormMessage tone={done.tone}>{done.text}</FormMessage> : null}
      {refused ? <FormMessage tone="info">{refused}</FormMessage> : null}
      <section aria-labelledby="requests" className="flex flex-col gap-3">
        <h2 id="requests" className="m-0 text-[22px] font-bold leading-7">
          Requests to answer
        </h2>
        {requests.length ? (
          list(requests, (l) => <AnswerButtons lessonId={l.id} label={describe(l)} plan={planFor(l)} />)
        ) : (
          <p className="m-0 text-body-md text-on-surface-variant">No requests are waiting for you.</p>
        )}
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          A request expires if it isn’t answered within 48 hours, or 2 hours before the lesson if that is sooner.
          Accepting one closes any other request at an overlapping time.
        </p>
      </section>

      {proposals.length ? (
        <section aria-labelledby="proposals" className="flex flex-col gap-3">
          <h2 id="proposals" className="m-0 text-[22px] font-bold leading-7">
            Proposals waiting for a parent
          </h2>
          {list(proposals, (l) => (
            <WithdrawProposalButton lessonId={l.id} label={describe(l)} />
          ))}
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            A proposal holds no time: if another lesson is confirmed at an overlapping time first, it closes. It expires
            if no parent answers within 48 hours, or 2 hours before the lesson if that is sooner.
          </p>
        </section>
      ) : null}

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
