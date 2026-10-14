import type { Metadata } from 'next';
import { rolePlaceholder } from '@/server/placeholder';

export const metadata: Metadata = { title: 'Book a human teacher' };

export default rolePlaceholder(
  'parent',
  'Book a human teacher',
  'Booking a teacher needs real accounts and the Zoom connection, which come in later phases.',
);
