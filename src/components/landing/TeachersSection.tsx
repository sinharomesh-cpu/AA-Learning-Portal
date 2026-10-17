import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
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
 * Until teachers can publish listings (board D5), the section shows an honest empty state and no
 * search or filter controls (they would have nothing to search).
 */

export interface PublicListingCard {
  /** Random public id of the listing, never an account id (P2-R3 §11.5). */
  id: string;
  name: string;
  subjects: string[];
  grades: number[];
  curricula: string[];
  /** Years of teaching as entered by the teacher; shown "as stated by the teacher". */
  experienceYears: number | null;
  /** Ready-made price lines, e.g. "₹600 per hour · 40-minute sessions" (up to 3, C9). */
  prices: string[];
}

function ListingCard({ listing }: { listing: PublicListingCard }) {
  const headingId = `listing-${listing.id}`;
  const initial = [...listing.name.replace(/^(Teacher|Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s+/i, '')][0]?.toUpperCase() ?? '?';
  return (
    <Card as="article" aria-labelledby={headingId} className="pub-card flex w-full flex-col gap-4 rounded-lg">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-16 flex-none items-center justify-center rounded-[18px] bg-primary-fixed font-headline text-[26px] font-extrabold text-on-primary-fixed"
        >
          {initial}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="text-[20px] font-bold leading-7">
            {listing.name}
          </h3>
          <p className="text-[15px] font-bold text-primary">{listing.subjects.join(' · ')}</p>
          <span className="self-start rounded-full border border-success-border bg-success-container px-2.5 py-0.5 text-xs font-bold text-on-success-container">
            Looking for students
          </span>
        </div>
      </div>
      {listing.experienceYears !== null ? (
        <p className="flex items-center gap-2 text-[15px]">
          <Icon name="school" size={18} className="flex-none text-primary" />
          <span>
            <strong>
              {listing.experienceYears} {listing.experienceYears === 1 ? 'year' : 'years'}
            </strong>{' '}
            teaching <span className="text-on-surface-variant">(as stated by the teacher)</span>
          </span>
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <span className="text-label-sm uppercase tracking-[.08em] text-on-surface-variant">Teaches</span>
        <p className="flex flex-wrap gap-1.5">
          {[describeGrades(listing.grades), ...listing.curricula, 'Online'].map((c) => (
            <span key={c} className="rounded-full bg-surface-container px-2.5 py-0.5 text-[13px] font-bold">
              {c}
            </span>
          ))}
        </p>
      </div>
      {listing.prices.length ? (
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
    </Card>
  );
}

export function TeachersSection({
  marketplace,
  wrap,
  listings = [],
}: {
  marketplace: MarketplaceSwitches;
  wrap: string;
  listings?: PublicListingCard[];
}) {
  const shown = marketplace.listings ? listings : [];
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
      {shown.length ? (
        <>
          <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3" aria-label="Teachers">
            {shown.map((l) => (
              <li key={l.id} className="flex">
                <ListingCard listing={l} />
              </li>
            ))}
          </ul>
          <p className="max-w-[60ch] text-body-sm text-on-surface-variant">
            Every teacher here has been approved by the AA Pro team. Browse freely; you only need a parent account when
            you want to contact a teacher. AA Pro doesn&apos;t take or handle payments: prices are set by teachers and
            agreed with them directly.
          </p>
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
