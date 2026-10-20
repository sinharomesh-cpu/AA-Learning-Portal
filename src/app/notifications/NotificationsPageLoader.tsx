import { redirect } from 'next/navigation';
import { NotificationsPage } from '@/components/notifications/NotificationsPage';
import { db } from '@/server/db/client';
import { listNotifications } from '@/server/notifications/queries';
import { notificationSession, type NotificationRowData, toRow } from '@/server/notifications/view';

/**
 * Server part of the parent and teacher Notifications page (CR-16 §6, D-7): the first 20, newest
 * first, for the signed-in account only. Each row is access-checked now; rows the user may no
 * longer see are listed redacted (§8.1).
 */
export async function NotificationsPageLoader() {
  const s = await notificationSession();
  if (!s) redirect('/sign-in');
  let items: NotificationRowData[] = [];
  let cursor: string | null = null;
  let failed = false;
  try {
    const list = await listNotifications(db(), s.accountId, { view: 'page', filter: 'all' });
    items = list.items.map((i) => toRow(i, s.timeZone));
    cursor = list.nextCursor;
  } catch (error) {
    console.error('CR-16 notifications page could not load.', (error as Error).message);
    failed = true;
  }
  return (
    <NotificationsPage initialItems={items} initialCursor={cursor} initialError={failed} serverNow={serverNow()} />
  );
}

function serverNow(): number {
  return Date.now();
}
