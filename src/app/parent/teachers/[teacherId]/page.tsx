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
import { meetingPermissionsForParent } from '@/server/meetingLinks';
import { isLive, listMyTeachers } from '@/server/teacherLinks';
import { FormMessage } from '@/components/forms/FormMessage';
import { formatLessonTime } from '@/lib/lessonDisplay';
import { ChangeLinksForm, MeetingPermissionForm, RemoveTeacherButton } from '../TeacherForms';

export const metadata: Metadata = { title: 'Change children and subjects' };
export const dynamic = 'force-dynamic';

/** Board 57 "Change children and subjects": only teachers linked to this parent's own children. */
export default async function ChangeTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  // CR-17 PR 3 (D3A-1): meeting links, per child the teacher is actively linked to.
  const linked = teacher.state === 'active' ? live.filter((c) => c.status === 'active') : [];
  const permissions = await meetingPermissionsForParent(db(), access.viewer.id);
  const allowedAt = (childId: string) =>
    permissions.find((p) => p.teacherId === teacher.id && p.childId === childId)?.allowedAt ?? null;
  const meeting = (await searchParams).meeting;
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
      {linked.length ? (
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <section aria-labelledby="meetings" className="flex flex-col gap-4">
            <h2 id="meetings" className="m-0 text-[22px] font-bold leading-7">
              Zoom meetings for lessons
            </h2>
            <p className="m-0 text-sm leading-5 text-on-surface-variant">
              Lessons happen in the teacher’s own Zoom meetings, not AA Pro’s, and AA Pro doesn’t record them. While you
              allow it, the teacher can add a meeting link to each lesson and Join Class opens it, from 10 minutes
              before the start. Either parent can allow or stop this at any time; the other parent is told.
            </p>
            {meeting === 'allowed' ? (
              <FormMessage tone="success">Allowed. The other parent has been told.</FormMessage>
            ) : null}
            {meeting === 'stopped' ? (
              <FormMessage tone="success">Stopped. Join Class won’t open this teacher’s meetings for now.</FormMessage>
            ) : null}
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {linked.map((c) => {
                const at = allowedAt(c.childId);
                return (
                  <li
                    key={c.childId}
                    className="flex flex-col gap-2 border-t border-outline-variant pt-4 first:border-t-0 first:pt-0"
                  >
                    <p className="m-0 font-bold">{c.name}</p>
                    <p className="m-0 text-sm leading-5" data-testid={`meeting-permission-${c.childId}`}>
                      {at
                        ? `Allowed since ${formatLessonTime(at, access.viewer.timeZone)}.`
                        : 'Not allowed: Join Class can’t open this teacher’s meetings for this child.'}
                    </p>
                    <MeetingPermissionForm
                      teacherId={teacher.id}
                      teacherName={teacher.name}
                      childId={c.childId}
                      childName={c.name}
                      allowed={Boolean(at)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        </Card>
      ) : null}
      <RemoveTeacherButton
        teacherId={teacher.id}
        label={live.some((c) => c.status === 'active') ? 'Remove teacher' : 'Cancel requests'}
        title={`Remove ${teacher.name}?`}
        confirmLabel="Remove"
        body="They will stop seeing your children and their books straight away, and waiting requests are withdrawn. Booked lessons with them are cancelled, except lessons starting within the next 30 minutes, which stay booked."
      />
    </div>
  );
}
