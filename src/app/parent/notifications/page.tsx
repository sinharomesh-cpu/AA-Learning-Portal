import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Notifications' };

export default rolePlaceholder(
  'parent',
  'Notifications',
  'Notification settings come with email and WhatsApp reminders (Phase 7).',
);
