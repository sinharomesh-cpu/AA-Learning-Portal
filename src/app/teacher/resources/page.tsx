import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Learning resources' };

export default rolePlaceholder('teacher', 'Learning resources', 'Sharing learning resources comes in Phase 4.');
