import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { parentOwnsChild } from '@/fixtures/family';
import { findPersona } from '@/fixtures/personas';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Restrictions' };

/** M-09 arrives with scheduling (Phase 3); its rule set is still undecided (D-05). */
export default async function RestrictionsPage({ params }: { params: Promise<{ childId: string }> }) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { childId } = await params;
  if (!parentOwnsChild(access.viewer.id, childId)) return <AccessDenied viewerRole="parent" />;
  const name = findPersona(childId)?.displayName ?? '';
  return (
    <NotReadyYet
      title={`${name}'s availability and restrictions`}
      body="Setting quiet times and limits comes with scheduling (Phase 3). Which limits exist is still being decided (D-05)."
      homeHref="/parent/children"
      homeLabel="Back to children"
    />
  );
}
