import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'My schedule' };

export default rolePlaceholder(
  'teacher',
  'My schedule',
  'Your full schedule comes with scheduling (Phase 3). Upcoming lessons are on your dashboard.',
);
