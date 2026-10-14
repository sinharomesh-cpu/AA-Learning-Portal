import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Availability' };

export default rolePlaceholder('teacher', 'Availability', 'Editing your availability comes with scheduling (Phase 3).');
