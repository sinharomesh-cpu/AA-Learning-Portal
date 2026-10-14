import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'My schedule' };

export default async function StudentSchedulePage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <NotReadyYet
      title="My schedule"
      body="Your schedule will appear here soon."
      homeHref="/student"
      homeLabel="Go to my home"
      child
    />
  );
}
