import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Schedule an AI class' };

export default rolePlaceholder(
  'parent',
  'Schedule an AI class',
  'Booking AI lessons for your children comes in a later step. It will reuse the AI booking wizard with a child picker.',
);
