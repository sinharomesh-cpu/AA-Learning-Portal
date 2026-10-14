import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Content repository' };

export default rolePlaceholder(
  'parent',
  'Content repository',
  'Uploading and organising learning content comes in Phase 4.',
);
