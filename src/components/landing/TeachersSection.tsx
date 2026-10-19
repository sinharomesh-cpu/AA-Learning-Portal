import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import type { PublicListingCard } from '@/components/listing/cards';
import { HourlyOfferBox, PackageOfferBox } from '@/components/listing/Offers';
import { VerifiedTick } from '@/components/listing/VerifiedTick';
import type { SearchValues } from '@/components/listing/searchHref';
import { type CurriculumOption, TeacherSearch } from '@/components/listing/TeacherSearch';
import type { MarketplaceSwitches } from '@/config/landing';
import { Icon } from '@/components/public/icons';
import { cx } from '@/lib/cx';
import { describeGrades } from '@/lib/grades';

/**
 * Home page "Meet Our Subject Specialists" (owner, 17 Oct 2026, OC-84; was "Teachers looking for
 * students", boards H1/H2, OC-79 C2). Styled after the owner's ZIP 5 cosmic reference, without
 * its claims (ratings, "certified", "background-checked", safety badges) or direct booking.
 *
 * Only the public listing fields allowed by C2 can be passed in: name, approved subjects and
 * grades, curriculum, experience "as stated by the teacher", online, asking prices. There is no
 * field for email, phone, ratings or anything about children. Optional teacher photos (OC-84)
 * come with the listing feature; until then cards show the teacher's initial.
 *
 * Shows the newest published listings (PR-D3) with search and filters that open /teachers. With
 * no listings it shows an honest empty state and no search or filter controls (nothing to
 * search); if listings cannot be loaded, an error message while the rest of the page works.
 */

export type { PublicListingCard } from '@/components/listing/cards';

/**
 * `showVerified`: the "AA Pro Verified" tick (CR-15 §5.1) shows on /teachers; the homepage keeps its
 * approved design (OC-110) and passes false until the owner approves a homepage change.
 */
export function ListingCard({ listing, showVerified = true }: { listing: PublicListingCard; showVerified?: boolean }) {
  const headingId = `listing-${listing.id}`;
  const initial = [...listing.name.replace(/^(Teacher|Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s+/i, '')][0]?.toUpperCase() ?? '?';
  const o = listing.offers;
  return (
    <Card
      as="article"
      aria-labelledby={headingId}
      className="pub-card flex w-full flex-col gap-3.5 rounded-[24px] p-5 shadow-[0_1px_2px_rgba(19,27,46,.04),0_8px_24px_-16px_rgba(19,27,46,.16)]"
    >
      <div className="flex items-start gap-3.5">
        {listing.photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- small approved photo from our own route
          <img
            src={listing.photoSrc}
            alt=""
            width={56}
            height={56}
            className="size-14 flex-none rounded-[18px] border border-card-border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 flex-none items-center justify-center rounded-[18px] bg-primary-fixed font-headline text-[24px] font-extrabold text-on-primary-fixed"
          >
            {initial}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={headingId} className="text-[19px] font-bold leading-[26px]">
            {listing.name}
          </h3>
          <p className="text-[14px] font-bold text-primary">{listing.subjects.join(' · ')}</p>
          {listing.experienceYears !== null ? (
            <p className="flex items-center gap-1.5 text-[13px] text-on-surface-variant">
              <Icon name="school" size={15} className="flex-none" />
              {listing.experienceYears} {listing.experienceYears === 1 ? 'year' : 'years'} (as stated)
            </p>
          ) : null}
        </div>
      </div>
      {showVerified && listing.verified ? <VerifiedTick /> : null}
      <p className="flex flex-wrap gap-1.5" aria-label="Teaches">
        {[describeGrades(listing.grades), ...listing.curricula, 'Online'].map((c) => (
          <span
            key={c}
            className="inline-flex h-7 items-center rounded-full bg-surface-container px-2.5 text-[13px] font-bold text-on-surface-variant"
          >
            {c}
          </span>
        ))}
      </p>
      {o ? (
        <>
          {o.hourly ? (
            <HourlyOfferBox
              hourly={o.hourly}
              slots={o.slots}
              teacherZone={o.teacherZone}
              maxSlots={2}
              moreHref={listing.href}
              headingLevel={4}
            />
          ) : null}
          {o.package ? (
            <PackageOfferBox
              pkg={o.package}
              negotiable={o.packageNegotiable}
              teacherZone={o.teacherZone}
              headingLevel={4}
              compact
            />
          ) : null}
        </>
      ) : listing.prices.length ? (
        <div className="flex flex-col gap-2 rounded-[18px] border border-card-border bg-surface-container-low p-3">
          <span className="text-[14px] font-bold">Asking prices</span>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {listing.prices.slice(0, 3).map((p) => (
              <li key={p} className="rounded-full bg-surface-container-lowest px-3 py-1 text-[14px] font-bold">
                {p}
              </li>
            ))}
          </ul>
          <span className="text-xs text-on-surface-variant">
            Set by the teacher · agreed and paid directly with them
          </span>
        </div>
      ) : null}
      {listing.href ? (
        <LinkButton href={listing.href} className="mt-auto w-full" aria-label={`View profile: ${listing.name}`}>
          View profile
        </LinkButton>
      ) : null}
    </Card>
  );
}

export function TeachersSection({
  marketplace,
  wrap,
  listings = [],
  loadError = false,
  more = false,
  curricula = [],
}: {
  marketplace: MarketplaceSwitches;
  wrap: string;
  listings?: PublicListingCard[];
  /** The listings could not be loaded (the rest of the page still works). */
  loadError?: boolean;
  /** More listings exist than are shown here. */
  more?: boolean;
  /** Curricula that published teachers list (OC-105). */
  curricula?: CurriculumOption[];
}) {
  const shown = marketplace.listings ? listings : [];
  const anyFilters: SearchValues = {
    name: '',
    subject: null,
    grade: null,
    curriculum: null,
    minExperience: null,
    sort: 'newest',
  };
  return (
    <section
      id="teachers"
      aria-labelledby="teachers-title"
      className={cx(wrap, 'flex scroll-mt-24 flex-col gap-8 py-16 md:py-24')}
    >
      <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-primary/40 bg-primary-fixed/50 px-3 py-1 text-label-sm uppercase tracking-[.08em] text-on-primary-fixed-variant">
            <Icon name="teacher" size={14} />
            Find a teacher
          </span>
          <h2
            id="teachers-title"
            className="font-headline text-[30px] font-extrabold leading-[38px] tracking-[-0.02em] md:text-[40px] md:leading-[48px]"
          >
            Meet Our Subject Specialists
          </h2>
          {shown.length ? (
            <p className="max-w-[62ch] text-[18px] leading-7 text-on-surface-variant">
              Discover teachers across school subjects, grades and curricula. Explore their profiles, teaching
              experience, specialisations and available teaching arrangements.
            </p>
          ) : null}
        </div>
        {shown.length ? (
          <p className="pub-card flex items-start gap-3 rounded-lg p-4 text-[15px] leading-[22px]">
            <Icon name="lock" size={20} className="mt-0.5 flex-none text-primary" />
            <span>
              Listings show only what the teacher chose to publish: never email addresses, phone numbers, or anything
              about children or families.
            </span>
          </p>
        ) : null}
      </div>
      {loadError && marketplace.listings ? (
        <div role="alert" className="pub-card flex flex-col items-start gap-3 rounded-lg p-6">
          <p className="text-[17px] font-bold">Teacher profiles can&apos;t be shown right now.</p>
          <p className="text-[15px] text-on-surface-variant">
            Please try again in a moment. The rest of AA Pro works as usual.
          </p>
          <LinkButton href="/teachers" variant="secondary">
            Try again
          </LinkButton>
        </div>
      ) : shown.length ? (
        <>
          <TeacherSearch
            values={anyFilters}
            total={null}
            curricula={curricula}
            idPrefix="home-ts"
            showResults={false}
          />
          <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3" aria-label="Teachers">
            {shown.map((l) => (
              <li key={l.id} className="flex">
                <ListingCard listing={l} showVerified={false} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-4">
            <LinkButton href="/teachers">{more ? 'See all teachers' : 'Search all teachers'}</LinkButton>
            <p className="max-w-[60ch] text-body-sm text-on-surface-variant">
              Every teacher here has been approved by the AA Pro team. Browse freely.{' '}
              {marketplace.enquiries
                ? 'You only need a parent account when you want to contact a teacher.'
                : 'Connecting with a teacher through AA Pro opens soon.'}{' '}
              AA Pro doesn&apos;t take or handle payments: prices are set by teachers and agreed with them directly.
            </p>
          </div>
        </>
      ) : (
        <div className="pub-card flex flex-col gap-5 rounded-lg p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="flex size-12 flex-none items-center justify-center rounded-[16px] bg-primary-fixed text-on-primary-fixed-variant"
            >
              <Icon name="teacher" size={24} />
            </span>
            <div className="flex flex-col gap-1.5">
              <p className="text-[17px] font-bold leading-[26px]">No teachers are listed right now.</p>
              <p className="max-w-[60ch] text-[15px] leading-[23px] text-on-surface-variant">
                Teacher profiles will appear here once approved teachers choose to publish them. Meanwhile, create a
                parent account to add your child&apos;s own teacher. Parents with an account can already search approved
                teachers after signing in.
              </p>
            </div>
          </div>
          <LinkButton href="/create-account" className="w-full flex-none md:w-auto">
            Create an account
          </LinkButton>
        </div>
      )}
      {marketplace.enquiries && shown.length ? (
        <Card className="pub-card flex flex-col gap-3 rounded-lg">
          <span className="text-label-md font-bold uppercase tracking-[.08em] text-primary">How connecting works</span>
          <ol className="flex flex-col gap-3 text-[15px] leading-[22px]">
            <li>1. Choose a teacher and press Connect with teacher.</li>
            <li>2. Sign in, or create a parent account. We keep your chosen teacher while you sign up.</li>
            <li>
              3. Send a short enquiry. The teacher accepts or declines. Nothing is booked or paid until you both agree.
            </li>
          </ol>
        </Card>
      ) : null}
    </section>
  );
}

/** H1 "For teachers" band. Mentions listings only once teachers can publish them. */
export function TeacherBand({ marketplace, wrap }: { marketplace: MarketplaceSwitches; wrap: string }) {
  return (
    <section aria-labelledby="teacher-band" className={cx(wrap, 'py-16 md:py-20')}>
      <div className="pub-card flex flex-wrap items-center justify-between gap-x-10 gap-y-5 rounded-lg p-6 md:p-8">
        <div className="flex max-w-[64ch] flex-col gap-2">
          <span className="text-label-md font-bold uppercase tracking-[.08em] text-primary">For teachers</span>
          <h2 id="teacher-band" className="font-headline text-headline-md">
            {marketplace.listings ? 'Looking for students?' : 'Teach with AA Pro'}
          </h2>
          <p className="text-[16px] leading-[25px] text-on-surface-variant">
            {marketplace.listings
              ? 'Register, get approved by the AA Pro team, then publish a listing with your subjects, grades, usual times and asking prices. You choose what parents see, and you can pause it any time.'
              : 'Register and the AA Pro team checks your profile. Once approved, you teach the children whose parents add you.'}
          </p>
        </div>
        <LinkButton href="/create-account">Register as a teacher</LinkButton>
      </div>
    </section>
  );
}
