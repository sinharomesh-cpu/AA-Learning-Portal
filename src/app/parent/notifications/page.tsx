import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { NotificationsPageLoader } from '@/app/notifications/NotificationsPageLoader';
import { requireRole } from '@/server/authz';
import { isDemoMode } from '@/server/demo';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

/**
 * CR-16 (D-7, Q-5): the parent's Notifications page — replaces the earlier placeholder. Opened
 * from the "Notifications" menu item, the home card's "Notifications" button and "See all" in
 * the panel. No notification preferences here (a future, separately approved change).
 */
export default async function ParentNotificationsPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Notifications"
        body="Notifications work with real accounts. The sample preview has no notifications."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  return <NotificationsPageLoader />;
}
