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
      <p className="text-sm leading-5 text-on-surface-variant">
        No parent contact details, surname, school or home information are shown.
      </p>
    </div>
  );
}
