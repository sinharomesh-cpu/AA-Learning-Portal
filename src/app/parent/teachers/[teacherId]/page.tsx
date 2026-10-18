import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/Card';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { AccessDenied } from '@/components/states/AccessDenied';
import { requireRole } from '@/server/authz';
import { listChildren } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { isLive, listMyTeachers } from '@/server/teacherLinks';
import { ChangeLinksForm, RemoveTeacherButton } from '../TeacherForms';

export const metadata: Metadata = { title: 'Change children and subjects' };
export const dynamic = 'force-dynamic';

/** Board 57 "Change children and subjects": only teachers linked to this parent's own children. */
export default async function ChangeTeacherPage({ params }: { params: Promise<{ teacherId: string }> }) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) notFound();
  const { teacherId } = await params;
  const teacher = (await listMyTeachers(db(), access.viewer.id)).find((t) => t.id === teacherId);
  // Another family's teacher, an unknown id or a removed link: the same "not found".
  const live = teacher?.children.filter((c) => isLive(c.status)) ?? [];
  if (!teacher || teacher.state === 'not_approved' || live.length === 0) notFound();
  const kids = (await listChildren(db(), access.viewer.id)).filter((k) => k.status === 'active');
  const initial = Object.fromEntries(live.map((c) => [c.childId, c.subjects]));
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <Link href="/parent/teachers" className="inline-flex min-h-11 items-center font-bold">
        ‹ My teachers
      </Link>
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">{teacher.name}</h1>
      {teacher.state === 'active' ? (
        <p className="text-sm leading-5 text-on-surface-variant">
          Teaches on AA Pro: {teacher.teaches.map((x) => SUBJECTS[x as SubjectId]?.name ?? x).join(', ')}. You can
          choose only these subjects. Changing the subjects of a child the teacher already accepted needs no new answer;
          a child you add becomes a new request.
        </p>
      ) : (
        <p className="text-sm leading-5 text-on-surface-variant">
          Waiting for AA Pro approval. Your choices are saved. After approval they go to the teacher as requests, only
          for the subjects the teacher is approved for.
        </p>
      )}
      <Card className="flex flex-col gap-5 p-4 sm:p-6">
        <ChangeLinksForm
          teacherId={teacher.id}
          // OC-75: for an approved teacher, only subjects both the teacher and the child have.
          kids={kids.map((k) => ({
            id: k.id,
            name: k.name,
            grade: k.grade,
            subjects: teacher.state === 'active' ? k.subjects.filter((x) => teacher.teaches.includes(x)) : k.subjects,
          }))}
          initial={initial}
        />
      </Card>
      <RemoveTeacherButton
        teacherId={teacher.id}
        label={live.some((c) => c.status === 'active') ? 'Remove teacher' : 'Cancel requests'}
        title={`Remove ${teacher.name}?`}
        confirmLabel="Remove"
        body="They will stop seeing your children and their books straight away, and waiting requests are withdrawn."
      />
    </div>
  );
}
