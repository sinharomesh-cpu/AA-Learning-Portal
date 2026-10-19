import 'server-only';
import type { PublicListingCard } from '@/components/listing/cards';
import { toCardsWithOffers } from './listingCards';
import { db } from './db/client';
import { isDemoMode } from './demo';
import { curriculumOptions, NO_FILTERS, searchPublicListings } from './publicListings';
import { realAuthEnabled } from './realAuth';

/**
 * The newest public listings for the homepage (PR-D3). The sample preview (demo mode) has no
 * database, so it shows the empty state. A database problem never breaks the homepage.
 */
export async function homeTeachers(): Promise<{
  listings: PublicListingCard[];
  loadError: boolean;
  more: boolean;
  curricula?: Array<{ curriculum: string; count: number | null }>;
}> {
  if (isDemoMode() || !realAuthEnabled()) return { listings: [], loadError: false, more: false };
  try {
    const r = await searchPublicListings(db(), NO_FILTERS, new Date(), 6);
    const curricula = await curriculumOptions(db(), NO_FILTERS);
    return {
      listings: await toCardsWithOffers(db(), r.listings),
      loadError: false,
      more: r.more,
      curricula: curricula.map((c) => ({ curriculum: c.curriculum, count: c.count })),
    };
  } catch {
    return { listings: [], loadError: true, more: false };
  }
}
