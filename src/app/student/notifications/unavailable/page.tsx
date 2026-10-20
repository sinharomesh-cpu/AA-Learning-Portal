import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { AccessEnded } from '@/app/notifications/AccessEnded';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Not available' };

/**
 * CR-16 §8 (D-8): shown when an update's record is no longer available to this student. This is
 * not a notifications page: students have only the "Your updates" sheet in CR-16 (D-7).
 */
export default async function StudentNotificationUnavailablePage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return <AccessEnded homeHref="/student" homeLabel="Go home" child />;
}
