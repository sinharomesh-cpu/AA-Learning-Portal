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
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { dayAndTime, shortDay } from '@/lib/linkRequests';
import { listLinkedStudents, listLinkRequests } from '@/server/teacherLinks';
import { RequestCard } from './RequestCard';

export const metadata: Metadata = { title: 'Students' };
export const dynamic = 'force-dynamic';

/**
 * The teacher's students: only children whose request the teacher accepted (or linked before
 * requests existed), with the subjects the parent ticked (OC-36, OC-41). CR-12 TR3: waiting
 * requests from parents come first, with the minimum details only (Reading B).
 */
export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ accepted?: string; declined?: string }>;
}) {
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
  const now = new Date();
  const [requests, students] = await Promise.all([
    listLinkRequests(db(), access.viewer.id, now),
    listLinkedStudents(db(), access.viewer.id),
  ]);
  const { accepted, declined } = await searchParams;
  const acceptedStudent = accepted ? students.find((s) => s.id === accepted) : undefined;
  const tz = access.viewer.timeZone;
  const DAY = 86_400_000;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Students</h1>
        <p className="text-sm leading-5 text-on-surface-variant">
          Parents ask you to work with their children. You answer for each child, and see only the children and subjects
          you accepted.
        </p>
      </div>
      {acceptedStudent ? (
        <FormMessage tone="success">
          Accepted. {acceptedStudent.name} is now in My students for{' '}
          {acceptedStudent.subjects.map((x) => SUBJECTS[x as SubjectId]?.name ?? x).join(', ')}. The parent has been
          told in AA Pro.
        </FormMessage>
      ) : null}
      {declined ? (
        <FormMessage tone="success">
          Declined. The parent can see your reason. You never had access to this child.
        </FormMessage>
      ) : null}
      <section aria-labelledby="requests" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="requests" className="text-[24px] font-bold leading-8">
            Requests from parents
          </h2>
          {requests.length ? <StatusChip kind="human">{`${requests.length} waiting`}</StatusChip> : null}
        </div>
        {requests.length ? (
          <>
            <FormMessage tone="info">
              Until you accept, you see only what is below. After you accept, you see the child&apos;s first name and
              the books their parent shared for these subjects, and you can share resources with them.
            </FormMessage>
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
              {requests.map((r, i) => (
                <li key={r.id}>
                  <RequestCard
                    r={{
                      id: r.id,
                      label: `Child ${i + 1}`,
                      grade: r.grade,
                      curriculum: r.curriculum,
                      subjects: r.subjects,
                      parentFirstName: r.parentFirstName,
                      message: r.message,
                      received: shortDay(r.requestedAt, tz),
                      expires: dayAndTime(r.expiresAt, tz),
                      daysLeft: Math.max(1, Math.ceil((r.expiresAt.getTime() - now.getTime()) / DAY)),
                    }}
                  />
                </li>
              ))}
            </ul>
            <p className="text-sm leading-5 text-on-surface-variant">
              Two children from the same family appear as separate requests, so you can accept one and decline the
              other.
            </p>
          </>
        ) : (
          <p className="text-sm leading-5 text-on-surface-variant">
            No requests right now. When a parent asks you to work with their child, it appears here.
          </p>
        )}
      </section>
      <h2 className="text-[24px] font-bold leading-8">My students</h2>
      {students.length === 0 ? (
        <EmptyState title="No students yet">
          When you accept a parent&apos;s request, the child appears here.
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {students.map((s) => (
            <li key={s.id}>
              <Card as="article" aria-labelledby={`s-${s.id}`} className="flex h-full flex-col gap-3 p-4 sm:p-6">
                <h3 id={`s-${s.id}`} className="font-headline text-[22px] font-bold leading-7">
                  {s.name}
                </h3>
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
