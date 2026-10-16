import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { EmptyState } from '@/components/states/States';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { listLinkedStudents } from '@/server/teacherLinks';

export const metadata: Metadata = { title: 'Students' };
export const dynamic = 'force-dynamic';

/** The teacher's students: only children a parent linked, with the subjects that parent ticked (OC-36, OC-41). */
export default async function TeacherStudentsPage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Students"
        body="Your linked students are listed on your dashboard in the sample preview."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  const students = await listLinkedStudents(db(), access.viewer.id);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Students</h1>
        <p className="text-sm leading-5 text-on-surface-variant">
          A parent links you to their child and chooses the subjects. You see only those children and subjects.
        </p>
      </div>
      {students.length === 0 ? (
        <EmptyState title="No students yet">
          When a parent adds you as their child&apos;s teacher, the child appears here.
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {students.map((s) => (
            <li key={s.id}>
              <Card as="article" aria-labelledby={`s-${s.id}`} className="flex h-full flex-col gap-3 p-4 sm:p-6">
                <h2 id={`s-${s.id}`} className="text-[22px] font-bold leading-7">
                  {s.name}
                </h2>
                <span className="text-sm text-on-surface-variant">
                  Grade {s.grade} · Subjects with you:{' '}
                  {s.subjects.map((x) => SUBJECTS[x as SubjectId]?.name ?? x).join(', ')}
                </span>
                <Link href={`/teacher/students/${s.id}`} className="inline-flex min-h-11 items-center font-bold">
                  Open {s.name}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
