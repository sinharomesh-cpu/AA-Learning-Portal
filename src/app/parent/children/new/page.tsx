import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Add a child' };

export default rolePlaceholder(
  'parent',
  'Add a child',
  'Adding a child needs real accounts and your consent to the privacy notice (Phase 2).',
);
