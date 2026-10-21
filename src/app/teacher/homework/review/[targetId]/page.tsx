import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDue, HomeworkStatus } from '@/components/homework/HomeworkStatus';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { SHELL } from '@/components/ui/styles';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { getForReview } from '@/server/assignments';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { ChangeDatesForm, MarkingForm, ReleaseButton, WithdrawButton } from './ReviewForms';

export const metadata: Metadata = { title: 'Homework' };
export const dynamic = 'force-dynamic';

/** Board HW4: one student's copy. Only the teacher's own, for a student linked to them now (W-11). */
export default async function ReviewHomeworkPage({ params }: { params: Promise<{ targetId: string }> }) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Homework"
        body="Marking works with real accounts. The sample preview stores nothing."
        homeHref="/teacher/homework"
        homeLabel="Back to my worksheets"
      />
    );
  }
  const { targetId } = await params;
  const now = new Date();
  const d = await getForReview(db(), access.viewer.id, targetId, now);
  if (!d) notFound();
  const tz = access.viewer.timeZone;
  const scheduled = d.status === 'assigned' && d.visibleFrom > now;
  const markable = ['submitted', 'under_review', 'reviewed'].includes(d.status);
  const withdrawable = !['reviewed', 'withdrawn'].includes(d.status);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6">
      <Link href="/teacher/homework/review" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ Assigned and to review
      </Link>
      <section aria-labelledby="hw-title" className={cx(SHELL, 'flex flex-col gap-2 p-5')}>
        <span className="text-sm font-bold text-on-surface-variant">
          {SUBJECTS[d.subject].name}
          {d.chapter ? ` · ${d.chapter}` : ''} · {d.studentName}
        </span>
        <h1 id="hw-title" className="m-0 break-words text-[28px] font-bold leading-9">
          {d.title}
        </h1>
        <HomeworkStatus status={d.status} overdue={d.overdue} late={d.late} scheduled={scheduled} attempt={d.attempt} />
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          {scheduled ? `Visible from ${formatDue(d.visibleFrom, tz)}. ` : ''}
          {d.dueAt ? `Due ${formatDue(d.dueAt, tz)}. ` : 'No due date. '}
          {d.submittedAt ? `Handed in ${formatDue(d.submittedAt, tz)}. ` : ''}
          {d.status === 'reviewed'
            ? `Marks: ${d.score ?? '–'} / ${d.maxScore ?? '–'}${d.released ? ', released.' : ', not released yet.'}`
            : ''}
        </p>
      </section>

      {markable && d.kind === 'exercise' ? (
        <section aria-labelledby="marking" className="flex flex-col gap-4">
          <h2 id="marking" className="m-0 text-[22px] font-bold leading-8">
            Marking · attempt {d.attempt}
          </h2>
          {d.status === 'reviewed' && !d.released ? <ReleaseButton targetId={d.targetId} /> : null}
          <MarkingForm detail={d} />
        </section>
      ) : null}
      {d.kind === 'handwritten' ? (
        <p className="m-0 rounded-[16px] bg-surface-container-low px-4 py-3 text-[15px]">
          Handwritten work: parents upload the pages in a later release (CR-17 PR 6). Until then you can withdraw it.
        </p>
      ) : null}
      {scheduled ? (
        <section aria-labelledby="dates" className={cx(SHELL, 'flex flex-col gap-3 p-5')}>
          <h2 id="dates" className="m-0 text-[20px] font-bold leading-7">
            Change the dates
          </h2>
          <p className="m-0 text-sm text-on-surface-variant">
            Possible only until the student can see it. After that, withdraw it or ask for a revision.
          </p>
          <ChangeDatesForm assignmentId={d.assignmentId} today={today} />
        </section>
      ) : null}
      {withdrawable ? <WithdrawButton assignmentId={d.assignmentId} title={d.title} /> : null}
    </div>
  );
}
