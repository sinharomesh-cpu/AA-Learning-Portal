import type { ReactNode } from 'react';
import { LinkButton } from '@/components/Button';
import { brand } from '@/config/brand';
import {
  ABOUT_PLACEHOLDERS,
  FAQ,
  HERO_POINTS,
  HOME_FACTS,
  HOW_IT_WORKS,
  landing,
  MARKETPLACE,
  type MarketplaceSwitches,
  SAFETY,
  SUBJECT_CARDS,
} from '@/config/landing';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from '@/components/public/icons';
import { PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { OrbitIllustration } from './OrbitIllustration';
import type { PublicListingCard } from '@/components/listing/cards';
import { TeacherBand, TeachersSection } from './TeachersSection';
import { TextbookPreview } from './TextbookPreview';

/**
 * Public home page. Layout and look follow the owner's ZIP 5 references ("Your Universe of
 * Learning" cosmic home page and the AA Pro light home page), in light and dark modes, with the
 * approved AA Pro content (boards 63, H1/H2). Unverified claims from the references (ratings,
 * certifications, compliance badges, lesson counts, "zero leak" guarantees) are left out until
 * evidence and owner approval exist (owner, 17 Oct 2026). Parts that describe listings or
 * enquiries appear only when those features are live (`MARKETPLACE`). Nothing here reads
 * account or child data.
 */

const TONE = {
  cyan: 'bg-primary-fixed text-on-primary-fixed-variant',
  amber: 'bg-[var(--pub-amber-bg)] text-[var(--pub-amber)]',
  violet: 'bg-[var(--pub-violet-bg)] text-[var(--pub-violet)]',
} as const;

const PATH_TONE = {
  parent: TONE.cyan,
  student: TONE.amber,
  teacher: TONE.violet,
} as const;

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[8px] border border-dashed border-secondary bg-surface-container-lowest px-2 py-0.5 font-bold text-on-warning-container">
      [{children}]
    </span>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex self-start rounded-full border border-primary/40 bg-primary-fixed/50 px-3 py-1 text-label-sm uppercase tracking-[.08em] text-on-primary-fixed-variant">
      {children}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  id,
  lead,
  center,
}: {
  eyebrow: string;
  title: string;
  id: string;
  lead?: string;
  center?: boolean;
}) {
  return (
    <div className={cx('flex flex-col gap-3', center && 'items-center text-center')}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className="font-headline text-[30px] font-extrabold leading-[38px] tracking-[-0.02em] md:text-[40px] md:leading-[48px]"
      >
        {title}
      </h2>
      {lead ? <p className="max-w-[62ch] text-body-lg text-on-surface-variant">{lead}</p> : null}
    </div>
  );
}

const SAFETY_ICON: Record<(typeof SAFETY)[number]['id'], IconName> = {
  checked: 'shield',
  parents: 'family',
  'no-contact': 'noMail',
  books: 'pages',
};

export function LandingPage({
  marketplace = MARKETPLACE,
  teachers = { listings: [], loadError: false, more: false },
}: {
  marketplace?: MarketplaceSwitches;
  /** Newest public listings for the teachers section (PR-D3). */
  teachers?: { listings: PublicListingCard[]; loadError: boolean; more: boolean };
} = {}) {
  return (
    <PublicShell onHome>
      <main>
        <section className="pub-hero relative overflow-hidden" aria-labelledby="hero-title">
          <div className={cx(PUBLIC_WRAP, 'grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr]')}>
            <div className="relative z-10 flex flex-col gap-6">
              <span className="text-label-md uppercase tracking-[.3em] text-primary">Explore · Learn · Grow</span>
              <h1
                id="hero-title"
                className="font-headline text-[40px] font-extrabold leading-[46px] tracking-[-0.03em] md:text-[60px] md:leading-[66px]"
              >
                Your Universe of <span className="pub-accent">Learning</span> Starts Here
              </h1>
              <p className="max-w-[56ch] text-body-lg text-on-surface-variant">
                {brand.productName} brings your child&apos;s AI lessons, teacher sessions and learning materials
                together in one place. Parents stay in charge of everything.
              </p>
              <div className="pub-card flex flex-col gap-4 rounded-lg p-4 sm:p-5">
                <div className="flex flex-wrap gap-3">
                  <LinkButton href="/create-account" className="w-full sm:w-auto">
                    Create an account
                    <Icon name="arrowRight" size={18} />
                  </LinkButton>
                  <a
                    href="#teachers"
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-outline bg-surface-container-lowest px-[22px] text-[15px] font-bold leading-5 text-on-surface no-underline hover:bg-surface-container-low hover:text-on-surface sm:w-auto"
                  >
                    Find a teacher
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm text-on-surface-variant">Subjects:</span>
                  {SUBJECT_CARDS.map((s) => (
                    <a
                      key={s.id}
                      href="#subjects"
                      className="inline-flex min-h-9 items-center rounded-full border border-card-border bg-surface-container-low px-3 text-body-sm font-semibold text-on-surface no-underline hover:border-primary hover:text-primary"
                    >
                      {s.name}
                    </a>
                  ))}
                </div>
              </div>
              <ul className="grid gap-4 sm:grid-cols-3">
                {HERO_POINTS.map((p) => (
                  <li key={p.title} className="flex items-start gap-3">
                    <span className="flex size-10 flex-none items-center justify-center rounded-full border border-card-border bg-surface-container-low text-primary">
                      <Icon name={p.icon} size={20} />
                    </span>
                    <span className="flex flex-col">
                      <strong className="font-headline text-[15px] leading-5">{p.title}</strong>
                      <span className="text-body-sm text-on-surface-variant">{p.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <OrbitIllustration />
          </div>
        </section>

        <section aria-label="AA Pro at a glance" className="pub-band border-y border-card-border">
          <ul className={cx(PUBLIC_WRAP, 'm-0 grid list-none grid-cols-2 gap-6 py-8 md:grid-cols-4')}>
            {HOME_FACTS.map((f) => (
              <li key={f.value} className="flex flex-col items-center gap-1 text-center">
                <strong className="font-headline text-[26px] font-extrabold leading-8 text-primary md:text-[32px] md:leading-10">
                  {f.value}
                </strong>
                <span className="text-body-sm text-on-surface-variant">{f.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="subjects"
          aria-labelledby="subjects-title"
          className={cx(PUBLIC_WRAP, 'flex flex-col gap-10 py-16 md:py-24')}
        >
          <SectionHeading
            eyebrow="Grades 1–12"
            title="Explore your school subjects"
            id="subjects-title"
            lead="Parents choose which subjects each child sees. Lessons and books are organised by subject."
          />
          <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
            {SUBJECT_CARDS.map((s) => (
              <li
                key={s.id}
                className="pub-card flex flex-col gap-4 rounded-lg p-6 transition-transform hover:-translate-y-1"
              >
                <span className={cx('flex size-12 items-center justify-center rounded-full', TONE[s.tone])}>
                  <Icon name={s.icon} size={24} />
                </span>
                <h3 className="font-headline text-[22px] font-bold leading-7">{s.name}</h3>
                <p className="text-body-md text-on-surface-variant">{s.body}</p>
                <p className="mt-auto border-t border-card-border pt-3 text-body-sm font-semibold text-primary">
                  Grades 1–12
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="books-title" className="pub-band border-y border-card-border">
          <div className={cx(PUBLIC_WRAP, 'grid items-center gap-12 py-16 md:py-24 lg:grid-cols-2')}>
            <div className="flex flex-col gap-6">
              <SectionHeading
                eyebrow="Being built"
                title="Learn from your child's own textbooks"
                id="books-title"
                lead="Parents will upload the school books their children use. Children read their chapters in AA Pro, and the AI Tutor will explain from those same pages."
              />
              <ul className="flex flex-col gap-3">
                {[
                  ['Private to your family', 'Your books are never shown to other families.'],
                  ['You choose who reads what', 'Pick the chapters for each of your children.'],
                  ['Teachers read, never download', 'Teachers you link see only the subjects you tick.'],
                ].map(([title, body]) => (
                  <li key={title} className="flex items-start gap-3 text-body-md">
                    <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed-variant">
                      <Icon name="check" size={14} />
                    </span>
                    <span>
                      <strong>{title}:</strong> <span className="text-on-surface-variant">{body}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-body-sm text-on-surface-variant">
                Not available yet. It opens for families once it has been built and tested.
              </p>
            </div>
            <TextbookPreview />
          </div>
        </section>

        <TeachersSection
          marketplace={marketplace}
          wrap={PUBLIC_WRAP}
          listings={teachers.listings}
          loadError={teachers.loadError}
          more={teachers.more}
        />

        <section aria-labelledby="how" className="pub-band border-y border-card-border">
          <div className={cx(PUBLIC_WRAP, 'flex flex-col gap-10 py-16 md:py-24')}>
            <SectionHeading eyebrow="How it works" title="Three simple paths" id="how" />
            <div className="grid gap-6 lg:grid-cols-3">
              {HOW_IT_WORKS.map((path) => (
                <article key={path.id} className="pub-card flex flex-col gap-5 rounded-lg p-7" aria-label={path.label}>
                  <span className={cx('self-start rounded-full px-3.5 py-1 text-label-md', PATH_TONE[path.tone])}>
                    {path.label}
                  </span>
                  <ol className="flex flex-col gap-4">
                    {('stepsWithListings' in path && marketplace.listings ? path.stepsWithListings : path.steps).map(
                      (step, i) => (
                        <li key={step} className="flex items-start gap-3.5 text-body-md">
                          <span
                            aria-hidden="true"
                            className={cx(
                              'flex size-9 flex-none items-center justify-center rounded-full font-headline text-[15px] font-extrabold',
                              PATH_TONE[path.tone],
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="pt-1.5">{step}</span>
                        </li>
                      ),
                    )}
                  </ol>
                </article>
              ))}
            </div>
          </div>
        </section>

        <TeacherBand marketplace={marketplace} wrap={PUBLIC_WRAP} />

        <section aria-labelledby="safety" className="pub-band border-y border-card-border">
          <div className={cx(PUBLIC_WRAP, 'flex flex-col gap-10 py-16 md:py-24')}>
            <SectionHeading eyebrow="Safety and privacy" title="Built for children, run by parents" id="safety" />
            <div className="grid gap-6 md:grid-cols-2">
              {SAFETY.map((item) => (
                <div key={item.id} className="pub-card flex items-start gap-4 rounded-lg p-6">
                  <span className="flex size-12 flex-none items-center justify-center rounded-[16px] bg-primary-fixed text-on-primary-fixed-variant">
                    <Icon name={SAFETY_ICON[item.id]} size={22} />
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="font-headline text-[20px] font-bold leading-7">{item.title}</h3>
                    <p className="text-body-md text-on-surface-variant">
                      {item.body}
                      {'withListings' in item && marketplace.listings ? ` ${item.withListings}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="about" className={cx(PUBLIC_WRAP, 'flex flex-col gap-8 py-16 md:py-24')}>
          <SectionHeading eyebrow="About us" title={`About ${brand.productName}`} id="about" />
          <div
            className={cx(
              'flex flex-col gap-3 rounded-lg p-6 text-[17px] leading-[27px] md:p-8',
              landing.about.draft ? 'border-2 border-dashed border-secondary bg-warning-container' : 'pub-card',
            )}
          >
            {landing.about.draft ? (
              <strong className="text-on-warning-container">Draft — owner to edit. Nothing below is final.</strong>
            ) : null}
            <p>{landing.about.intro}</p>
            {landing.about.ownerParagraphs.map((text, i) => (
              <p key={ABOUT_PLACEHOLDERS[i] ?? i}>{text ?? <Placeholder>{ABOUT_PLACEHOLDERS[i]}</Placeholder>}</p>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq" className="pub-band border-y border-card-border">
          <div className={cx(PUBLIC_WRAP, 'flex flex-col items-center gap-10 py-16 md:py-24')}>
            <SectionHeading eyebrow="FAQ" title="Questions parents and teachers ask" id="faq" center />
            <div className="flex w-full max-w-[860px] flex-col gap-3">
              {FAQ.filter((item) => !item.needs || marketplace[item.needs]).map((item, i) => (
                <details
                  key={item.q}
                  open={i === 0}
                  className="group pub-card rounded-[24px] px-5 open:border-primary/60 md:px-6"
                >
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 font-headline text-[17px] font-semibold">
                    {item.q}
                    <Icon
                      name="chevronDown"
                      size={20}
                      className="flex-none text-on-surface-variant transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="pb-5 text-body-md text-on-surface-variant">{item.a}</p>
                </details>
              ))}
              <details className="group pub-card rounded-[24px] px-5 open:border-primary/60 md:px-6">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 font-headline text-[17px] font-semibold">
                  What does it cost?
                  <Icon
                    name="chevronDown"
                    size={20}
                    className="flex-none text-on-surface-variant transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="pb-5 text-body-md text-on-surface-variant">
                  {landing.pricing ?? <Placeholder>Pricing — owner to add</Placeholder>}
                </p>
              </details>
            </div>
          </div>
        </section>

        <section aria-labelledby="contact" className={cx(PUBLIC_WRAP, 'flex flex-col gap-8 py-16 md:py-24')}>
          <SectionHeading eyebrow="Contact us" title="We’re happy to help" id="contact" />
          <div className="pub-card flex flex-wrap items-center justify-between gap-x-8 gap-y-5 rounded-lg p-6 md:p-8">
            <div className="flex items-start gap-4">
              <span className="flex size-12 flex-none items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed-variant">
                <Icon name="mail" size={22} />
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="text-[17px]">
                  Email us at{' '}
                  {landing.contactEmail ? (
                    <a href={`mailto:${landing.contactEmail}`}>{landing.contactEmail}</a>
                  ) : (
                    <Placeholder>contact email — owner to provide</Placeholder>
                  )}
                </p>
                <p className="text-body-sm text-on-surface-variant">
                  A contact form comes later, once sending email is approved.
                </p>
              </div>
            </div>
            <LinkButton href="/create-account">Create an account</LinkButton>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
