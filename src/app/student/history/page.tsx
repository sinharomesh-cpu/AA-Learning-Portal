import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: "Things I've learned" };

export default async function StudentHistoryPage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <NotReadyYet
      title="Things I've learned"
      body="Your learning history will appear here soon."
      homeHref="/student"
      homeLabel="Go to my home"
      child
    />
  );
}
