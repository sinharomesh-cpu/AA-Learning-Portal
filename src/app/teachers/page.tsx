import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import type { PublicListingCard } from '@/components/listing/cards';
import { teachersHref } from '@/components/listing/searchHref';
import { type CurriculumOption, TeacherSearch } from '@/components/listing/TeacherSearch';
import { ListingCard } from '@/components/landing/TeachersSection';
import { PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { cx } from '@/lib/cx';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { toCardsWithOffers } from '@/server/listingCards';
import { cleanPublicFilters, curriculumOptions, searchPublicListings } from '@/server/publicListings';
import { realAuthEnabled } from '@/server/realAuth';

// Decided (C2): listing pages ask search engines not to list them at launch.
export const metadata: Metadata = { title: 'Meet Our Subject Specialists', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Public teacher list (PR-D3; boards D8/D10; owner request OC-84). Signed out or in, anyone can
 * browse published listings of approved teachers. Search and filters work on real listing data.
 */
export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = cleanPublicFilters(await searchParams);
  const filtered =
    !!filters.name || !!filters.subject || !!filters.grade || !!filters.curriculum || !!filters.minExperience;
  let listings: PublicListingCard[] = [];
  let more = false;
  let total = 0;
  let curricula: CurriculumOption[] = [];
  let loadError = false;
  if (!isDemoMode() && realAuthEnabled()) {
    try {
      const r = await searchPublicListings(db(), filters);
      listings = await toCardsWithOffers(db(), r.listings);
      more = r.more;
      total = r.total;
      curricula = await curriculumOptions(db(), filters);
    } catch {
      loadError = true;
    }
  }
  return (
    <PublicShell>
      <main className={cx(PUBLIC_WRAP, 'flex flex-col gap-8 py-10 md:py-14')}>
        <nav aria-label="Breadcrumb" className="text-sm text-on-surface-variant">
          <Link href="/" className="font-bold">
            Home
          </Link>{' '}
          › Teachers
        </nav>
        <div className="flex flex-col gap-3">
          <h1 className="font-headline text-[34px] font-extrabold leading-[42px] tracking-[-0.02em] md:text-[46px] md:leading-[54px]">
            Meet Our Subject Specialists
          </h1>
          <p className="max-w-[62ch] text-[18px] leading-7 text-on-surface-variant">
            Discover teachers across school subjects, grades and curricula. Explore their profiles, teaching experience,
            specialisations and available teaching arrangements.
          </p>
        </div>
        <TeacherSearch values={filters} total={loadError ? null : total} curricula={curricula} />
        <section aria-labelledby="results" className="flex scroll-mt-24 flex-col gap-5" id="results">
          <h2 id="results" className="sr-only">
            Results
          </h2>
          {loadError ? (
            <div role="alert" className="pub-card flex flex-col items-start gap-3 rounded-lg p-6">
              <p className="text-[15px]">Please try again in a moment. The rest of AA Pro works as usual.</p>
              <LinkButton href={teachersHref(filters)} variant="secondary">
                Try again
              </LinkButton>
            </div>
          ) : listings.length === 0 ? (
            <div className="pub-card flex flex-col items-start gap-3 rounded-lg p-6">
              {!filtered ? <p className="text-[17px] font-bold">No teachers are listed right now</p> : null}
              <p className="text-[15px]">
                {filtered
                  ? 'No published teacher profiles match all your choices. Try fewer filters or another subject.'
                  : 'Teacher profiles will appear here once approved teachers choose to publish them.'}
              </p>
              {filtered ? (
                <LinkButton href="/teachers" variant="secondary">
                  Clear all
                </LinkButton>
              ) : (
                <LinkButton href="/create-account">Create an account</LinkButton>
              )}
            </div>
          ) : (
            <>
              <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3" aria-label="Teachers">
                {listings.map((l) => (
                  <li key={l.id} className="flex">
                    <ListingCard listing={l} />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                {filters.page > 1 ? (
                  <LinkButton
                    href={`${teachersHref(filters)}${teachersHref(filters).includes('?') ? '&' : '?'}page=${filters.page - 1}`}
                    variant="secondary"
                  >
                    Previous teachers
                  </LinkButton>
                ) : null}
                {more ? (
                  <LinkButton
                    href={`${teachersHref(filters)}${teachersHref(filters).includes('?') ? '&' : '?'}page=${filters.page + 1}`}
                    variant="secondary"
                  >
                    More teachers
                  </LinkButton>
                ) : null}
              </div>
            </>
          )}
        </section>
        <p className="max-w-[70ch] text-sm text-on-surface-variant">
          Every teacher here has been approved by the AA Pro team and chose to publish these details. Experience is as
          stated by the teacher. Prices are set by teachers and paid to them directly; AA Pro doesn&apos;t take, hold or
          refund payments. Listings never show email addresses, phone numbers or anything about children.
        </p>
      </main>
    </PublicShell>
  );
}
