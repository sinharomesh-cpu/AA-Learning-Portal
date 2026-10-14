import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { parentOwnsChild } from '@/fixtures/family';
import { findPersona } from '@/fixtures/personas';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Child profile' };

/** M-08 arrives with real accounts (Phase 2). The ownership check runs now (FR-002.2). */
export default async function ChildProfilePage({ params }: { params: Promise<{ childId: string }> }) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { childId } = await params;
  // A child not linked to this parent looks exactly like a page that does not exist.
  if (!parentOwnsChild(access.viewer.id, childId)) return <AccessDenied viewerRole="parent" />;
  const name = findPersona(childId)?.displayName ?? '';
  return (
    <NotReadyYet
      title={`${name}'s profile`}
      body="Editing the profile and sign-in details comes with real accounts (Phase 2). The sign-in and recovery rules are still under review (D-23a)."
      homeHref="/parent/children"
      homeLabel="Back to children"
    />
  );
}
