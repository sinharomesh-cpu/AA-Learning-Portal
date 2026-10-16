import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { describeGrades } from '@/lib/grades';
import { requireRole } from '@/server/authz';
import { listChildren } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getDirectoryTeacher } from '@/server/teacherDirectory';
import { DirectoryAddForm } from '../../TeacherForms';

export const metadata: Metadata = { title: 'Add as my teacher' };
export const dynamic = 'force-dynamic';

const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;

/**
 * Board 65 "Add as my teacher" (C-1 option (a), owner 16 Oct 2026): the board 58 checklist for a
 * teacher picked from the directory. The teacher's email is never shown; the server looks it up.
 * Only teachers the directory lists can be opened here; anything else is "not found".
 */
export default async function AddFromDirectoryPage({ params }: { params: Promise<{ teacherId: string }> }) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) notFound();
  const { teacherId } = await params;
  const teacher = await getDirectoryTeacher(db(), access.viewer.id, teacherId);
  if (!teacher) notFound();
  if (teacher.alreadyMine) redirect(`/parent/teachers/${teacher.id}`);
  const kids = (await listChildren(db(), access.viewer.id)).filter((k) => k.status === 'active');
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <Link href="/parent/teachers/find" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ Find a teacher
      </Link>
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Add {teacher.name}</h1>
      <Card as="section" aria-label="About this teacher" className="flex flex-col gap-2 p-4 sm:p-6">
        <p className="text-sm leading-5 text-on-surface-variant">
          {describeGrades(teacher.grades)} · {teacher.timeZone}
        </p>
        <p className="text-[15px] leading-[22px]">
          Teaches on AA Pro: <strong>{teacher.subjects.map(subjectName).join(', ')}</strong>
        </p>
        {teacher.bio ? (
          <p className="whitespace-pre-line break-words text-sm leading-5 text-on-surface-variant">{teacher.bio}</p>
        ) : null}
      </Card>
      {kids.length === 0 ? (
        <EmptyState title="Add a child first" action={<LinkButton href="/parent/children/new">Add a child</LinkButton>}>
          A teacher is always linked to one of your children.
        </EmptyState>
      ) : (
        <>
          <FormMessage tone="info">
            {teacher.name} is already approved by AA Pro, so they can see the children and subjects you tick straight
            away. We&apos;ll email them to say you added them. You can change or remove this at any time.
          </FormMessage>
          <DirectoryAddForm
            teacherId={teacher.id}
            // OC-75: only subjects the teacher is approved for and the child studies.
            kids={kids.map((k) => ({
              id: k.id,
              name: k.name,
              grade: k.grade,
              subjects: k.subjects.filter((x) => teacher.subjects.includes(x)),
            }))}
          />
        </>
      )}
    </div>
  );
}
