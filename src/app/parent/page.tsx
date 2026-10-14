import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Family home' };

export default async function ParentHomePage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <NotReadyYet
      title="Family home"
      body="The Parent portal is being designed. Its dashboard is built once the owner approves the Parent dashboard design (OC-26)."
    />
  );
}
