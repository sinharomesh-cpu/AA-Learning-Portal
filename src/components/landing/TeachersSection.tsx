import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import type { MarketplaceSwitches } from '@/config/landing';
import { cx } from '@/lib/cx';
import { describeGrades } from '@/lib/grades';

/**
 * Home page "Teachers looking for students" (boards H1/H2, approved 16 Oct 2026; OC-79 C2).
 *
 * Only the public listing fields allowed by C2 can be passed in: name, approved subjects and
 * grades, curriculum, experience "as stated by the teacher", online, asking prices. There is no
 * field for email, phone, photos, ratings or anything about children.
 *
 * Until teachers can publish listings (board D5), the section shows the approved empty state.
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
  const facts = [
    listing.experienceYears !== null
      ? `${listing.experienceYears} ${listing.experienceYears === 1 ? 'year' : 'years'} (as stated by the teacher)`
      : null,
    'Online',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card as="article" aria-labelledby={headingId} className="pub-card flex flex-col gap-3 rounded-lg">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-[52px] flex-none items-center justify-center rounded-full bg-primary-fixed font-headline text-[22px] font-extrabold text-on-primary-fixed"
        >
          {[...listing.name.replace(/^Teacher\s+/i, '')][0]?.toUpperCase() ?? '?'}
        </span>
        <div className="flex flex-col gap-1">
          <h3 id={headingId} className="text-[20px] font-bold leading-7">
            {listing.name}
          </h3>
          <span className="self-start rounded-full border border-success-border bg-success-container px-2.5 py-0.5 text-xs font-bold text-on-tertiary-fixed-variant">
            Looking for students
          </span>
        </div>
      </div>
      <p className="flex flex-wrap gap-1.5" aria-label="Subjects">
        {listing.subjects.map((s) => (
          <span key={s} className="rounded-full bg-primary-fixed/60 px-2.5 py-0.5 text-[13px] font-bold">
            {s}
          </span>
        ))}
      </p>
      <p className="text-body-sm text-on-surface-variant">
        {describeGrades(listing.grades)}
        {listing.curricula.length ? ` · ${listing.curricula.join(', ')}` : ''}
        <br />
        {facts}
      </p>
      {listing.prices.length ? (
        <div className="flex flex-col gap-0.5 rounded-[14px] bg-surface-container-low px-3 py-2.5 text-[15px]">
          {listing.prices.slice(0, 3).map((p, i) => (
            <span key={p} className={i === 0 ? 'font-bold' : undefined}>
              {p}
            </span>
          ))}
          <span className="text-xs text-on-surface-variant">
            Asking price · agreed and paid directly with the teacher
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
      <div className="flex flex-col gap-3">
        <span className="inline-flex self-start rounded-full border border-primary/40 bg-primary-fixed/50 px-3 py-1 text-label-sm uppercase tracking-[.08em] text-on-primary-fixed-variant">
          Find a teacher
        </span>
        <h2
          id="teachers-title"
          className="font-headline text-[30px] font-extrabold leading-[38px] tracking-[-0.02em] md:text-[40px] md:leading-[48px]"
        >
          Teachers looking for students
        </h2>
        {shown.length ? (
          <p className="max-w-[62ch] text-[18px] leading-7 text-on-surface-variant">
            Every teacher here has been approved by the AA Pro team. Browse freely. You only need a parent account when
            you want to contact a teacher.
          </p>
        ) : null}
      </div>
      {shown.length ? (
        <>
          <ul className="m-0 grid list-none gap-6 p-0 lg:grid-cols-3" aria-label="Teachers">
            {shown.map((l) => (
              <li key={l.id} className="flex">
                <ListingCard listing={l} />
              </li>
            ))}
          </ul>
          <p className="max-w-[60ch] text-body-sm text-on-surface-variant">
            Listings show only what the teacher chose to publish. Never shown: email addresses, phone numbers, or
            anything about children or families. AA Pro doesn&apos;t take or handle payments: prices are set by teachers
            and agreed with them directly.
          </p>
        </>
      ) : (
        <div className="pub-card flex flex-col items-start gap-3 rounded-lg border-dashed p-6 md:p-8">
          <p className="text-[17px] leading-[26px]">
            No teachers are listed right now. Create a parent account to add your child&apos;s own teacher, or check
            back soon.
          </p>
          <p className="text-body-sm text-on-surface-variant">
            Parents with an account can already search approved teachers after signing in.
          </p>
          <LinkButton href="/create-account">Create an account</LinkButton>
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
