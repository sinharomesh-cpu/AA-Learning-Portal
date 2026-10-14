import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Propose a meeting' };

export default rolePlaceholder(
  'teacher',
  'Propose a meeting',
  'Proposing meetings needs scheduling and the Zoom connection (later phases). Whether a parent must confirm first is still being decided.',
);
