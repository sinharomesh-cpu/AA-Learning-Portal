import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDue, HomeworkStatus } from '@/components/homework/HomeworkStatus';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { SHELL } from '@/components/ui/styles';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { getHomeworkForStudent } from '@/server/assignments';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { Player } from './Player';

export const metadata: Metadata = { title: 'My homework' };
export const dynamic = 'force-dynamic';

/** Boards HW6 (answer) and HW7 (results after release). The student's own homework only. */
export default async function StudentHomeworkItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ targetId: string }>;
  searchParams: Promise<{ handed?: string }>;
}) {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="My homework"
        body="Homework works with real accounts."
        homeHref="/student/homework"
        homeLabel="Back to my homework"
        child
      />
    );
  }
  const { targetId } = await params;
  const { handed } = await searchParams;
  const hw = await getHomeworkForStudent(db(), access.viewer.id, targetId);
  if (!hw) notFound();
  const tz = access.viewer.timeZone;
  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5">
      <Link href="/student/homework" className="inline-flex min-h-12 items-center self-start text-[17px] font-bold">
        ‹ My homework
      </Link>
      <section aria-labelledby="hw-title" className={cx(SHELL, 'flex flex-col gap-2 p-5')}>
        <span className="text-[15px] font-bold text-on-surface-variant">
          {SUBJECTS[hw.subject].name}
          {hw.chapter ? ` · ${hw.chapter}` : ''} · from {hw.teacherName}
        </span>
        <h1 id="hw-title" className="m-0 break-words text-[28px] font-bold leading-9">
          {hw.title}
        </h1>
        <HomeworkStatus status={hw.status} overdue={hw.overdue} late={hw.late} attempt={hw.attempt} child />
        {hw.dueAt ? <p className="m-0 text-[16px]">Due {formatDue(hw.dueAt, tz)}</p> : null}
        {hw.instructions ? <p className="m-0 whitespace-pre-line text-[17px] leading-7">{hw.instructions}</p> : null}
      </section>
      {handed ? (
        <p
          role="status"
          className="m-0 rounded-[16px] border border-success-border bg-success-container px-4 py-3 text-[17px] text-on-success-container"
        >
          Handed in. Well done! Your teacher will look at it.
        </p>
      ) : null}
      {hw.revisionNote ? (
        <p className="m-0 rounded-[16px] border border-warning-border bg-warning-container px-4 py-3 text-[17px] text-on-warning-container">
          <strong>Your teacher asked you to have another go:</strong> {hw.revisionNote}
        </p>
      ) : null}

      {hw.canAnswer ? (
        <Player targetId={hw.targetId} questions={hw.questions} />
      ) : hw.released ? (
        <section aria-labelledby="results" className="flex flex-col gap-4">
          <h2 id="results" className="m-0 text-[24px] font-bold">
            Your marks: {hw.score} out of {hw.maxScore}
          </h2>
          {hw.feedback ? (
            <p className="m-0 whitespace-pre-line rounded-[16px] bg-surface-container-low px-4 py-3 text-[17px] leading-7">
              <strong>From your teacher:</strong> {hw.feedback}
            </p>
          ) : null}
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {hw.questions.map((q) => (
              <li
                key={q.index}
                className="flex flex-col gap-1 rounded-[20px] border border-card-border bg-surface-container-lowest p-4"
              >
                <span className="text-[15px] font-bold text-on-surface-variant">
                  Question {q.index + 1} · {q.marks ?? '–'} of {q.points}
                </span>
                <p className="m-0 text-[18px] leading-7">{q.prompt}</p>
                {hw.showAnswers && q.correct ? <p className="m-0 text-[16px]">Correct answer: {q.correct}</p> : null}
                {q.comment ? <p className="m-0 text-[16px]">Teacher’s comment: {q.comment}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : hw.status === 'withdrawn' ? (
        <p className="m-0 text-[17px]">Your teacher withdrew this homework. You don’t need to do it.</p>
      ) : hw.kind === 'handwritten' ? (
        <p className="m-0 text-[17px]">This is done on paper. Your parent hands it in for you.</p>
      ) : (
        <p className="m-0 text-[17px]">Handed in. Your marks show here when your teacher shares them.</p>
      )}
    </div>
  );
}
