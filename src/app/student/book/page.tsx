import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Book an AI class' };

export default async function StudentBookPage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <NotReadyYet
      title="Book an AI class"
      body="Booking AI lessons is coming soon."
      homeHref="/student"
      homeLabel="Go to my home"
      child
    />
  );
}
