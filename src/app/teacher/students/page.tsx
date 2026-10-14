import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Students' };

export default rolePlaceholder(
  'teacher',
  'Students',
  'Student details come with real accounts (Phase 2). Your linked students are listed on your dashboard.',
);
