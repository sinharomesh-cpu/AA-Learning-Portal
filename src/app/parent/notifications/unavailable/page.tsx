import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { AccessEnded } from '@/app/notifications/AccessEnded';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Not available' };

/** CR-16 §8 (D-8): shown when a notification's record is no longer available to this parent. */
export default async function ParentNotificationUnavailablePage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return <AccessEnded homeHref="/parent" homeLabel="Go to family home" />;
}
