import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Family calendar' };

export default rolePlaceholder(
  'parent',
  'Family calendar',
  'The full family calendar comes with scheduling (Phase 3). This week’s lessons are on Family home.',
);
