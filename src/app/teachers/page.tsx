import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { toListingCard } from '@/components/listing/cards';
import { TeacherSearchPanel, teachersHref } from '@/components/listing/TeacherSearchPanel';
import { ListingCard } from '@/components/landing/TeachersSection';
import { PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { cleanPublicFilters, type PublicListing, searchPublicListings } from '@/server/publicListings';
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
  let listings: PublicListing[] = [];
  let more = false;
  let loadError = false;
  if (!isDemoMode() && realAuthEnabled()) {
    try {
      const r = await searchPublicListings(db(), filters);
      listings = r.listings;
      more = r.more;
    } catch {
      loadError = true;
    }
  }
  const summary = [
    filters.subject ? SUBJECTS[filters.subject as SubjectId]?.name : null,
    filters.grade ? `Grade ${filters.grade}` : null,
    filters.curriculum,
    filters.minExperience ? `${filters.minExperience}+ years` : null,
    filters.name ? `“${filters.name}”` : null,
  ]
    .filter(Boolean)
    .join(' · ');
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
        <TeacherSearchPanel values={filters} />
        <section aria-labelledby="results" className="flex scroll-mt-24 flex-col gap-5" id="results">
          <h2 id="results" className="text-[22px] font-bold leading-7">
            {loadError
              ? 'Teachers can’t be shown right now'
              : listings.length
                ? `Teachers${summary ? `: ${summary}` : ''}`
                : filtered
                  ? 'No teachers match'
                  : 'No teachers are listed right now'}
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
              <p className="text-[15px]">
                {filtered
                  ? 'No published teacher profiles match all your choices. Try fewer filters or another subject.'
                  : 'Teacher profiles will appear here once approved teachers choose to publish them.'}
              </p>
              {filtered ? (
                <LinkButton href="/teachers" variant="secondary">
                  Clear filters
                </LinkButton>
              ) : (
                <LinkButton href="/create-account">Create an account</LinkButton>
              )}
            </div>
          ) : (
            <>
              <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3" aria-label="Teachers">
                {listings.map((l) => (
                  <li key={l.publicId} className="flex">
                    <ListingCard listing={toListingCard(l)} />
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
