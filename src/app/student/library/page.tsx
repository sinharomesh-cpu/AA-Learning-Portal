import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'My library' };

export default async function StudentLibraryPage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <NotReadyYet
      title="My library"
      body="Your books and worksheets will appear here soon."
      homeHref="/student"
      homeLabel="Go to my home"
      child
    />
  );
}
