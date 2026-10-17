import 'server-only';
import { type PublicListingCard, toListingCard } from '@/components/listing/cards';
import { db } from './db/client';
import { isDemoMode } from './demo';
import { NO_FILTERS, searchPublicListings } from './publicListings';
import { realAuthEnabled } from './realAuth';

/**
 * The newest public listings for the homepage (PR-D3). The sample preview (demo mode) has no
 * database, so it shows the empty state. A database problem never breaks the homepage.
 */
export async function homeTeachers(): Promise<{ listings: PublicListingCard[]; loadError: boolean; more: boolean }> {
  if (isDemoMode() || !realAuthEnabled()) return { listings: [], loadError: false, more: false };
  try {
    const r = await searchPublicListings(db(), NO_FILTERS, new Date(), 6);
    return { listings: r.listings.map(toListingCard), loadError: false, more: r.more };
  } catch {
    return { listings: [], loadError: true, more: false };
  }
}
