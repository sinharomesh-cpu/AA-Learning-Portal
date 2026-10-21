import type { Metadata } from 'next';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { findPersona } from '@/fixtures/personas';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { teacherLinkedTo } from '@/fixtures/teacher';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getLinkedStudent } from '@/server/teacherLinks';
import { formatDue, HomeworkStatus } from '@/components/homework/HomeworkStatus';
import { type ReviewItem, studentResults } from '@/server/assignments';

export const metadata: Metadata = { title: 'Student' };
export const dynamic = 'force-dynamic';

/** M-25 assigned student detail. Only a linked student opens; anyone else gets "You can't open this". */
export default async function TeacherStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { studentId } = await params;
  if (isDemoMode()) {
    if (!teacherLinkedTo(access.viewer.id, studentId)) return <AccessDenied viewerRole="teacher" />;
    return (
      <NotReadyYet
        title={findPersona(studentId)?.displayName ?? ''}
        body="Student details work with real accounts."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  const student = await getLinkedStudent(db(), access.viewer.id, studentId);
  if (!student) return <AccessDenied viewerRole="teacher" />;
  // Board W4 (W-11): this teacher's own homework for this student, in subjects linked now.
  const results = (await studentResults(db(), access.viewer.id, studentId)) ?? [];
  const chapters = new Map<string, ReviewItem[]>();
  for (const r of results) {
    const key = `${SUBJECTS[r.subject].name} · ${r.chapter ?? 'No chapter'}`;
    chapters.set(key, [...(chapters.get(key) ?? []), r]);
  }
  const reviewed = results.filter((r) => r.status === 'reviewed').length;
  const waiting = results.filter((r) => r.status === 'submitted' || r.status === 'under_review').length;
  const notIn = results.filter((r) => ['assigned', 'in_progress', 'revision_required'].includes(r.status)).length;
  const tz = access.viewer.timeZone;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/teacher/students" className="inline-flex min-h-11 items-center font-bold">
        ← All my students
      </Link>
      <Card className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed font-headline text-[28px] font-extrabold text-on-primary-fixed-variant"
        >
          {[...student.name][0]?.toUpperCase()}
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-md">{student.name}</h1>
          <span className="text-sm text-on-surface-variant">
            Grade {student.grade} · Subjects with you:{' '}
            {student.subjects.map((x) => SUBJECTS[x as SubjectId]?.name ?? x).join(', ')}
          </span>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="p-sessions-with-you" className={SHELL}>
          <PanelHead id="p-sessions-with-you" title="Sessions with you" />
          <div className="flex flex-col gap-2 px-5 py-5 sm:px-6">
            <p className="text-sm leading-5 text-on-surface-variant">Lessons appear here once booking opens.</p>
          </div>
        </section>
        <section aria-labelledby="p-books-and-files" className={SHELL}>
          <PanelHead id="p-books-and-files" title="Books and files" />
          <div className="flex flex-col gap-2 px-5 py-5 sm:px-6">
            <p className="text-sm leading-5 text-on-surface-variant">
              The parent&apos;s books for your subjects appear here once uploads open. You can read them, not download
              them.
            </p>
          </div>
        </section>
      </div>
      <section aria-labelledby="p-results" className={SHELL}>
        <PanelHead
          id="p-results"
          title="Results"
          intro="Only your worksheets, in the subjects linked to you. Marks are numbers only: no averages, grades or rankings."
        />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <p className="m-0 text-[15px]">
            Reviewed: <strong>{reviewed}</strong> · Waiting for you: <strong>{waiting}</strong> · Not handed in yet:{' '}
            <strong>{notIn}</strong>
          </p>
          {results.length === 0 ? (
            <p className="m-0 text-sm leading-5 text-on-surface-variant">
              Nothing yet. Results appear here once you assign and mark homework.
            </p>
          ) : (
            [...chapters.entries()].map(([chapter, rows]) => (
              <div key={chapter} className="flex flex-col gap-2">
                <h3 className="m-0 text-[17px] font-bold">{chapter}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-[15px]">
                    <thead>
                      <tr className="text-left text-[13px] text-on-surface-variant">
                        <th scope="col" className="border-b-2 border-card-border p-2">
                          Worksheet
                        </th>
                        <th scope="col" className="border-b-2 border-card-border p-2">
                          Handed in
                        </th>
                        <th scope="col" className="border-b-2 border-card-border p-2">
                          Status
                        </th>
                        <th scope="col" className="border-b-2 border-card-border p-2">
                          Marks
                        </th>
                        <th scope="col" className="border-b-2 border-card-border p-2">
                          Released
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.targetId}>
                          <td className="border-b border-card-border p-2">
                            <Link href={`/teacher/homework/review/${r.targetId}`}>{r.title}</Link>
                          </td>
                          <td className="border-b border-card-border p-2">{formatDue(r.submittedAt, tz) ?? '—'}</td>
                          <td className="border-b border-card-border p-2">
                            <HomeworkStatus status={r.status} overdue={r.overdue} late={r.late} attempt={r.attempt} />
                          </td>
                          <td className="border-b border-card-border p-2">
                            {r.status === 'reviewed' ? `${r.score} / ${r.maxScore}` : '—'}
                          </td>
                          <td className="border-b border-card-border p-2">
                            {r.status === 'reviewed' ? (r.released ? 'Yes' : 'Not yet') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
      <p className="text-sm leading-5 text-on-surface-variant">
        No parent contact details, surname, school or home information are shown.
      </p>
    </div>
  );
}
