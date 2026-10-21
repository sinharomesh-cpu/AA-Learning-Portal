import type { Metadata } from 'next';
import { LinkButton } from '@/components/Button';
import { formatDue, HomeworkStatus } from '@/components/homework/HomeworkStatus';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { SHELL } from '@/components/ui/styles';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { listTeacherHomework, type ReviewItem } from '@/server/assignments';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { HomeworkTabs } from '../HomeworkTabs';

export const metadata: Metadata = { title: 'Assigned and to review' };
export const dynamic = 'force-dynamic';

function Rows({ items, timeZone, now }: { items: ReviewItem[]; timeZone: string; now: Date }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[15px] leading-[22px]">
        <thead>
          <tr className="text-left text-[13px] text-on-surface-variant">
            <th scope="col" className="border-b-2 border-card-border px-4 py-2">
              Homework
            </th>
            <th scope="col" className="border-b-2 border-card-border px-3 py-2">
              Student
            </th>
            <th scope="col" className="border-b-2 border-card-border px-3 py-2">
              Due
            </th>
            <th scope="col" className="border-b-2 border-card-border px-3 py-2">
              Status
            </th>
            <th scope="col" className="border-b-2 border-card-border px-3 py-2">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const scheduled = r.status === 'assigned' && r.visibleFrom > now;
            const toMark = r.status === 'submitted' || r.status === 'under_review';
            return (
              <tr key={r.targetId}>
                <td className="border-b border-card-border px-4 py-3 align-top">
                  <strong>{r.title}</strong>
                  <br />
                  <span className="text-sm text-on-surface-variant">
                    {SUBJECTS[r.subject].name}
                    {r.chapter ? ` · ${r.chapter}` : ''} · {r.kind === 'exercise' ? 'exercise' : 'handwritten'}
                  </span>
                </td>
                <td className="border-b border-card-border px-3 py-3 align-top">{r.studentName}</td>
                <td className="border-b border-card-border px-3 py-3 align-top">
                  {scheduled
                    ? `From ${formatDue(r.visibleFrom, timeZone)}`
                    : (formatDue(r.dueAt, timeZone) ?? 'No due date')}
                </td>
                <td className="border-b border-card-border px-3 py-3 align-top">
                  <HomeworkStatus
                    status={r.status}
                    overdue={r.overdue}
                    late={r.late}
                    scheduled={scheduled}
                    attempt={r.attempt}
                  />
                  {r.status === 'reviewed' ? (
                    <span className="mt-1 block text-sm text-on-surface-variant">
                      {r.score ?? '–'} / {r.maxScore ?? '–'} · {r.released ? 'released' : 'not released yet'}
                    </span>
                  ) : null}
                </td>
                <td className="border-b border-card-border px-3 py-3 align-top">
                  <LinkButton
                    href={`/teacher/homework/review/${r.targetId}`}
                    variant={toMark ? 'primary' : 'secondary'}
                    className="min-h-11"
                    aria-label={`${toMark ? 'Mark' : 'Open'} ${r.title} for ${r.studentName}`}
                  >
                    {toMark ? 'Mark' : 'Open'}
                  </LinkButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Board HW4 (list): the teacher's assigned homework, waiting work first (W-11: linked students only). */
export default async function TeacherReviewPage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Assigned and to review"
        body="Assigned homework works with real accounts. The sample preview stores nothing."
        homeHref="/teacher/homework"
        homeLabel="Back to my worksheets"
      />
    );
  }
  const now = new Date();
  const items = await listTeacherHomework(db(), access.viewer.id, now);
  const waiting = items.filter((r) => r.status === 'submitted' || r.status === 'under_review');
  const out = items.filter((r) => ['assigned', 'in_progress', 'revision_required'].includes(r.status));
  const reviewed = items.filter((r) => r.status === 'reviewed');
  const tz = access.viewer.timeZone;
  const groups = [
    ['waiting', 'Waiting for you to mark', waiting, 'Nothing to mark right now.'],
    ['out', 'With students', out, 'No homework is out with students.'],
    ['reviewed', 'Reviewed', reviewed, 'Nothing reviewed yet.'],
  ] as const;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Homework</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Only work for students linked to you now, in the subjects their parent ticked.
        </p>
      </div>
      <HomeworkTabs current="review" />
      {groups.map(([id, title, list, empty]) => (
        <section key={id} aria-labelledby={`g-${id}`} className={cx(SHELL, 'flex flex-col gap-3 py-4')}>
          <h2 id={`g-${id}`} className="m-0 px-4 text-[20px] font-bold leading-7">
            {title} <span className="text-on-surface-variant">({list.length})</span>
          </h2>
          {list.length ? (
            <Rows items={list} timeZone={tz} now={now} />
          ) : (
            <p className="m-0 px-4 text-[15px] text-on-surface-variant">{empty}</p>
          )}
        </section>
      ))}
    </div>
  );
}
