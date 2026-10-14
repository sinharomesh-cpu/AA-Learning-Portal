import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Session history' };

export default rolePlaceholder(
  'parent',
  'Session history',
  'Session history and summaries for your children come in a later phase.',
);
