import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Profile' };

export default rolePlaceholder('teacher', 'Profile', 'Your teacher profile comes with real accounts (Phase 2).');
