import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { EmptyState } from '@/components/states/States';
import { LinkButton } from '@/components/Button';
import { requireRole } from '@/server/authz';
import { listChildren } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { Card } from '@/components/Card';
import { AddTeacherForm, RequestSteps } from '../TeacherForms';

export const metadata: Metadata = { title: 'Add a teacher' };
export const dynamic = 'force-dynamic';

/** Board 58 (OC-36, OC-41): add a teacher by email for some children and subjects. */
export default async function AddTeacherPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Add a teacher"
        body="Adding teachers works with real accounts. The sample preview has no teachers to add."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  const kids = (await listChildren(db(), access.viewer.id)).filter((k) => k.status === 'active');
  return (
    <div className="flex flex-col gap-6">
      <Link href="/parent/teachers" className="inline-flex min-h-11 items-center font-bold">
        ‹ My teachers
      </Link>
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Add a teacher</h1>
      {kids.length === 0 ? (
        <EmptyState title="Add a child first" action={<LinkButton href="/parent/children/new">Add a child</LinkButton>}>
          A teacher is always linked to one of your children.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm leading-5 text-on-surface-variant">
            The teacher answers for each child. Nothing is shared with them until they accept.
          </p>
          <Card as="section" aria-labelledby="next" className="flex max-w-[760px] flex-col gap-2 p-4 sm:p-6">
            <h2 id="next" className="text-sm font-bold leading-5">
              What happens next
            </h2>
            <RequestSteps />
            <p className="text-sm leading-5 text-on-surface-variant">
              Teacher new to AA Pro? AA Pro checks every new teacher first. The request waits for that approval, and the
              teacher then has 14 days to answer.
            </p>
          </Card>
          <AddTeacherForm kids={kids.map((k) => ({ id: k.id, name: k.name, grade: k.grade, subjects: k.subjects }))} />
        </>
      )}
    </div>
  );
}
