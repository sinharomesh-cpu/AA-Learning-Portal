import type { Metadata } from 'next';
import Link from 'next/link';
import { FormMessage } from '@/components/forms/FormMessage';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { EmptyState } from '@/components/states/States';
import { LinkButton } from '@/components/Button';
import { requireRole } from '@/server/authz';
import { listChildren } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { AddTeacherForm } from '../TeacherForms';

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
          <FormMessage tone="info">
            AA Pro checks every new teacher before they can see your children. We email the teacher now, and again when
            they&apos;re approved.
          </FormMessage>
          <AddTeacherForm kids={kids.map((k) => ({ id: k.id, name: k.name, grade: k.grade, subjects: k.subjects }))} />
        </>
      )}
    </div>
  );
}
