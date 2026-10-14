import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Settings' };

export default rolePlaceholder('parent', 'Settings', 'Account settings come with real sign-in (Phase 2).');
