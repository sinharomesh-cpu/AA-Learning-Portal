import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { NotificationsPageLoader } from '@/app/notifications/NotificationsPageLoader';
import { requireRole } from '@/server/authz';
import { isDemoMode } from '@/server/demo';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

/**
 * CR-16 (D-7): the teacher's Notifications page, reached only from "See all" in the panel (no
 * new menu item). A teacher awaiting approval can still open only their status and profile
 * pages (OC-38), so they are sent to their status page as on every other teacher page.
 */
export default async function TeacherNotificationsPage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Notifications"
        body="Notifications work with real accounts. The sample preview has no notifications."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  return <NotificationsPageLoader />;
}
