import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { describePrice, type ListingSnapshot } from '@/lib/listing';

/**
 * The public card for one listing (homepage and /teachers). Only fields the teacher agreed to
 * show (OC-77(1)); never contact details, accounts, ratings or anything about children.
 */
export interface PublicListingCard {
  /** Random public id of the listing, never an account id (P2-R3 §11.5). */
  id: string;
  name: string;
  /** Subject names, e.g. "Maths". */
  subjects: string[];
  grades: number[];
  curricula: string[];
  /** Years of teaching as entered by the teacher; shown "as stated by the teacher". */
  experienceYears: number | null;
  /** Ready-made price lines, e.g. "₹600 per hour · 40-minute sessions" (up to 3, C9). */
  prices: string[];
  /** The listing page, when public pages exist. */
  href?: string;
  /** An approved photo the teacher agreed to show, or null for the initial. */
  photoSrc?: string | null;
}

export function toListingCard(l: ListingSnapshot & { publicId: string }): PublicListingCard {
  return {
    id: l.publicId,
    name: l.name,
    subjects: l.subjects.map((s) => SUBJECTS[s as SubjectId]?.name ?? s),
    grades: l.grades,
    curricula: l.curricula,
    experienceYears: l.experienceYears,
    prices: l.prices.slice(0, 3).map(describePrice),
    href: `/teachers/${l.publicId}`,
    photoSrc: l.photoId ? `/teacher-photo/${l.photoId}` : null,
  };
}
