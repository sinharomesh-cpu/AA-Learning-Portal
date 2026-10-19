import 'server-only';
import { type PublicListingCard, toListingCard } from '@/components/listing/cards';
import type { Db } from './db/client';
import { liveOfferFlags } from './pricingModel';
import type { PublicListing } from './publicListings';

/**
 * Cards for public lists (homepage, /teachers). Copies made under the CR-15 pricing model carry
 * hourly lessons and the package; their Fixed / Negotiable labels are read live (P-8, R-8).
 */
export async function toCardsWithOffers(sql: Db, listings: PublicListing[]): Promise<PublicListingCard[]> {
  return Promise.all(
    listings.map(async (l) => {
      const card = toListingCard(l);
      if (l.hourly === undefined && l.package === undefined) return card;
      const flags = await liveOfferFlags(sql, l.publicId, l.usualTimes);
      return {
        ...card,
        offers: {
          hourly: l.hourly ?? null,
          package: l.package ?? null,
          slots: flags.slots,
          packageNegotiable: flags.packageNegotiable,
          teacherZone: l.timeZone,
        },
      };
    }),
  );
}
