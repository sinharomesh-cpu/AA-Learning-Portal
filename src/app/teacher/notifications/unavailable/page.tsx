import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccessDenied } from '@/components/states/AccessDenied';
import { AccessEnded } from '@/app/notifications/AccessEnded';
import { teacherApprovalStatus } from '@/server/teacherProfile';
import { getViewer } from '@/server/session';

export const metadata: Metadata = { title: 'Not available' };

/**
 * CR-16 §8 (D-8): shown when a notification's record is no longer available to this teacher.
 * A teacher awaiting approval may see it too (their bell is on the status and profile pages,
 * D-5); it shows nothing about any record. A not-approved teacher keeps today's status-only
 * access (OC-72, Q-2).
 */
export default async function TeacherNotificationUnavailablePage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.role !== 'teacher') return <AccessDenied viewerRole={viewer.role} />;
  if (viewer.status === 'pending_approval') {
    if ((await teacherApprovalStatus(viewer.id)) === 'rejected') redirect('/teacher/status');
    return <AccessEnded homeHref="/teacher/status" homeLabel="Go to my account status" />;
  }
  return <AccessEnded homeHref="/teacher" homeLabel="Go to my dashboard" />;
}
