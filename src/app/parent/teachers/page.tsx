import type { Metadata } from 'next';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { EmptyState } from '@/components/states/States';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { listMyTeachers, type MyTeacher } from '@/server/teacherLinks';
import { RemoveTeacherButton } from './TeacherForms';

export const metadata: Metadata = { title: 'My teachers' };
export const dynamic = 'force-dynamic';

const STATE: Record<MyTeacher['state'], [string, 'success' | 'warning' | 'error' | 'neutral']> = {
  active: ['Active', 'success'],
  waiting: ['Waiting for AA Pro approval', 'warning'],
  not_approved: ['Not approved', 'error'],
  inactive: ['Not active', 'neutral'],
};

const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;

/** Board 57 (OC-36, OC-41): the teachers linked to this parent's children. */
export default async function MyTeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; who?: string }>;
}) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="My teachers"
        body="Adding teachers works with real accounts. The sample preview has no teachers to add."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  const teachers = await listMyTeachers(db(), access.viewer.id);
  const { done, who } = await searchParams;
  const name = (who ?? '').slice(0, 80);
  const message =
    done === 'linked'
      ? `${name} can now see the children and subjects you ticked. We've emailed them.`
      : done === 'requested'
        ? `Request sent. ${name} is waiting for AA Pro approval and sees nothing until then.`
        : done === 'changed'
          ? 'Saved. The teacher sees only the children and subjects you ticked.'
          : done === 'removed'
            ? 'Removed. The teacher no longer sees those children or their books.'
            : null;
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: access.viewer.timeZone, day: 'numeric', month: 'short' }).format(d);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">My teachers</h1>
          <p className="text-sm leading-5 text-on-surface-variant">
            Each teacher sees only the children and subjects you tick. They can read your books for those subjects, but
            can&apos;t download them.
          </p>
        </div>
        <LinkButton href="/parent/teachers/new">Add a teacher</LinkButton>
      </div>
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {teachers.length === 0 ? (
        <EmptyState title="No teachers yet" action={<LinkButton href="/parent/teachers/new">Add a teacher</LinkButton>}>
          You haven&apos;t added any teachers yet. Add your child&apos;s own teacher by their email address.
        </EmptyState>
      ) : null}
      {teachers.map((t) => {
        const [label, kind] = STATE[t.state];
        const kids = t.children.map((c) => c.name).join(' and ');
        return (
          <Card as="article" key={t.id} aria-labelledby={`t-${t.id}`} className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h2 id={`t-${t.id}`} className="text-[22px] font-bold leading-7">
                {t.name}
              </h2>
              <StatusChip kind={kind}>{label}</StatusChip>
            </div>
            {t.state === 'not_approved' ? (
              <p className="text-sm leading-5 text-on-surface-variant">
                The AA Pro team didn&apos;t approve this teacher, so they can&apos;t see your children.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {t.children.map((c) => (
                  <li key={c.childId} className="flex flex-wrap items-center gap-2 text-[15px]">
                    <strong className="min-w-[70px]">{c.name}</strong>
                    {c.subjects.map((s) => (
                      <span
                        key={s}
                        className="inline-flex rounded-full bg-primary-fixed/60 px-2.5 py-0.5 text-[13px] font-bold text-on-primary-fixed"
                      >
                        {subjectName(s)}
                      </span>
                    ))}
                    {c.status === 'pending' && t.state === 'waiting' ? (
                      <span className="text-sm text-on-surface-variant">· starts after approval</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {t.state === 'waiting' ? (
              <p className="text-sm leading-5 text-on-surface-variant">
                Added on {day(t.addedAt)}. We emailed the teacher a link to set up their account and send their profile.
                They can&apos;t see anything until the AA Pro team approves them, and then only for subjects they are
                approved to teach.
              </p>
            ) : null}
            {t.state === 'active' && t.teaches.length ? (
              <p className="text-sm leading-5 text-on-surface-variant">
                Teaches on AA Pro: {t.teaches.map(subjectName).join(', ')}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2.5">
              {t.state !== 'not_approved' ? (
                <LinkButton href={`/parent/teachers/${t.id}`} variant="secondary">
                  Change children and subjects
                </LinkButton>
              ) : null}
              <RemoveTeacherButton
                teacherId={t.id}
                label={
                  t.state === 'waiting'
                    ? 'Cancel request'
                    : t.state === 'not_approved'
                      ? 'Remove from list'
                      : 'Remove teacher'
                }
                title={t.state === 'waiting' ? `Cancel the request for ${t.name}?` : `Remove ${t.name}?`}
                confirmLabel={t.state === 'waiting' ? 'Cancel request' : 'Remove'}
                body={
                  t.state === 'active'
                    ? `They will stop seeing ${kids} and their books straight away.`
                    : `${t.name} will no longer be linked to ${kids}.`
                }
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
