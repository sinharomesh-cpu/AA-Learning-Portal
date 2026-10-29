import type { Metadata } from 'next';
import Link from 'next/link';
import { FormMessage } from '@/components/forms/FormMessage';
import { LessonCard } from '@/components/lessons/LessonCard';
import { MaterialRequestList } from '@/components/lessons/MaterialRequestList';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { parentOwnsLesson } from '@/fixtures/family';
import { SUBJECTS } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { formatLessonTime } from '@/lib/lessonDisplay';
import { REAL_LESSON_RULES_TEXT } from '@/lib/lessonRules';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { lessonForParent } from '@/server/lessons';
import { materialRequestsFor, type ShareOption, shareOptions } from '@/server/materialRequests';
import { MaterialAnswerForm } from '../../calendar/MaterialForms';
import { AnswerProposal } from './AnswerProposal';

export const metadata: Metadata = { title: 'Booking details' };
export const dynamic = 'force-dynamic';

const DONE: Record<string, { tone: 'success' | 'info' | 'warning'; text: string }> = {
  accepted: { tone: 'success', text: 'Accepted. The lesson is booked and the teacher has been told.' },
  declined: { tone: 'success', text: 'Declined. The teacher has been told.' },
  time_taken: {
    tone: 'warning',
    text: 'That time is no longer free: another lesson was confirmed first, so this proposal has been closed.',
  },
  expired: { tone: 'info', text: 'This proposal had already expired, so it can’t be answered.' },
  not_linked: { tone: 'info', text: 'This teacher is no longer linked to your child for this subject.' },
  closed: { tone: 'info', text: 'This proposal is no longer open: it was already answered, withdrawn or closed.' },
  not_found: { tone: 'info', text: 'This proposal is no longer open.' },
};

/**
 * Booking details (M-10; TL3-5). Real accounts: one lesson of this parent's own child (D3A-25),
 * with what the parent needs to decide on a teacher's proposal: teacher, subject, child, time in the
 * parent's time zone, length, price (information only), the teacher's planned chapters and any
 * material request, the status, and Accept / Decline. Anything else is "not found" (FR-002.2).
 * Demo mode keeps its existing page.
 */
export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { bookingId } = await params;
  if (isDemoMode()) {
    if (!parentOwnsLesson(access.viewer.id, bookingId)) return <AccessDenied viewerRole="parent" />;
    return (
      <NotReadyYet
        title="Booking details"
        body="Booking details, accepting a teacher's proposal, cancelling and rescheduling come with scheduling (Phase 3). The rules are set: you accept or reject a lesson a teacher proposes; teacher lessons can be cancelled or moved up to 30 minutes before the start; AI lessons any time before the start."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  const raw = await searchParams;
  const done = DONE[typeof raw.done === 'string' ? raw.done : ''];
  const tz = access.viewer.timeZone;
  const now = clockNow();
  const lesson = await lessonForParent(db(), access.viewer.id, bookingId);
  if (!lesson) return <AccessDenied viewerRole="parent" />;
  const materials =
    (await materialRequestsFor(db(), { id: access.viewer.id, role: 'parent' }, [lesson.id], now)).get(lesson.id) ?? [];
  const choices = new Map<string, ShareOption[]>();
  for (const r of materials) if (r.canAnswer) choices.set(r.id, await shareOptions(db(), access.viewer.id, r.id));
  const subject = SUBJECTS[lesson.subject].name;
  const summary = `${lesson.childName}’s ${subject} lesson with ${lesson.teacherName}, ${formatLessonTime(lesson.startsAt, tz)}, ${lesson.minutes} min`;
  const proposal = lesson.origin === 'teacher_proposal';

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      <Link href="/parent/calendar" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ Family calendar
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">
          {proposal && lesson.status === 'proposed' ? 'A teacher proposed a lesson' : 'Booking details'}
        </h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Times are in your time zone ({formatZoneName(now.toISOString(), { timeZone: tz })}, {tz}).
        </p>
      </div>
      {done ? <FormMessage tone={done.tone}>{done.text}</FormMessage> : null}
      <LessonCard
        lesson={lesson}
        viewer="parent"
        timeZone={tz}
        actions={lesson.canAnswer ? <AnswerProposal lessonId={lesson.id} summary={summary} /> : null}
      >
        <MaterialRequestList
          lessonId={lesson.id}
          requests={materials}
          viewer="parent"
          actions={(r) =>
            r.canAnswer ? (
              <MaterialAnswerForm
                requestId={r.id}
                label={`${r.what}, ${summary}`}
                choices={choices.get(r.id) ?? []}
                noneText={`None of your published ${subject} books is shared with ${lesson.childName} yet.`}
              />
            ) : null
          }
        />
      </LessonCard>
      {proposal ? (
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          {REAL_LESSON_RULES_TEXT.parentProposal} If another lesson is confirmed at an overlapping time first, this one
          closes. Prices are for information: AA Pro takes no payment.
        </p>
      ) : null}
    </div>
  );
}
