import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { ListingDetails } from '@/components/listing/ListingDetails';
import { LocalUsualTimes } from '@/components/listing/LocalUsualTimes';
import { PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { cx } from '@/lib/cx';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getPublicListing, type PublicListing } from '@/server/publicListings';
import { realAuthEnabled } from '@/server/realAuth';

export const metadata: Metadata = { title: 'Teacher', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Board D9/D10: one public listing, addressed by its random public id. Shows only the details the
 * teacher agreed to publish. Paused, ended or withdrawn listings, and teachers who are no longer
 * approved, show "no longer available" and nothing else (D9).
 */
export default async function PublicListingPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  let listing: PublicListing | null = null;
  if (!isDemoMode() && realAuthEnabled()) listing = await getPublicListing(db(), publicId);
  return (
    <PublicShell>
      <main className={cx(PUBLIC_WRAP, 'flex flex-col gap-6 py-10 md:py-14')}>
        <nav aria-label="Breadcrumb" className="text-sm text-on-surface-variant">
          <Link href="/" className="font-bold">
            Home
          </Link>{' '}
          ›{' '}
          <Link href="/teachers" className="font-bold">
            Teachers
          </Link>
          {listing ? ` › ${listing.name}` : ''}
        </nav>
        {listing ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="pub-card rounded-lg p-5 md:p-8">
              <ListingDetails
                listing={listing}
                headingLevel={1}
                photoSrc={listing.photoId ? `/teacher-photo/${listing.photoId}` : null}
                timesNote=""
                timesSlot={<LocalUsualTimes times={listing.usualTimes} teacherZone={listing.timeZone} />}
              />
            </div>
            <aside aria-labelledby="connect" className="pub-card flex flex-col gap-3 rounded-lg p-5 md:p-6">
              <h2 id="connect" className="text-[20px] font-bold leading-7">
                Connect with {listing.name}
              </h2>
              <p className="text-[15px] leading-[22px]">
                Sending an enquiry through AA Pro opens soon. You&apos;ll need a free parent account; browsing
                doesn&apos;t.
              </p>
              <p className="text-[15px] leading-[22px] text-on-surface-variant">
                Parents with an account can already add a teacher they know by email from their Teachers page.
              </p>
              <LinkButton href="/create-account" variant="secondary">
                Create a parent account
              </LinkButton>
              <p className="text-sm text-on-surface-variant">
                Never shown publicly: the teacher&apos;s email, phone, account details or students; any child&apos;s
                name, profile, schedule or learning records.
              </p>
            </aside>
          </div>
        ) : (
          <div className="pub-card flex flex-col items-start gap-3 rounded-lg p-6 md:p-8">
            <h1 className="font-headline text-[30px] font-extrabold leading-[38px]">Listing no longer available</h1>
            <p className="text-[15px]">This teacher isn&apos;t taking enquiries right now.</p>
            <LinkButton href="/teachers">See other teachers</LinkButton>
          </div>
        )}
      </main>
    </PublicShell>
  );
}
