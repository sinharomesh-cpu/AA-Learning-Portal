import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'My dashboard' };

export default async function TeacherHomePage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <NotReadyYet
      title="My dashboard"
      body="The Teacher portal is being designed. Its dashboard is built once the owner approves the Teacher dashboard design (OC-26)."
    />
  );
}
