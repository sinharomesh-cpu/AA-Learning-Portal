import Link from 'next/link';
import type { ReactNode } from 'react';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { brand } from '@/config/brand';
import { ABOUT_PLACEHOLDERS, FAQ, HOW_IT_WORKS, landing, SAFETY } from '@/config/landing';
import { cx } from '@/lib/cx';

/**
 * Public landing page (board 63, approved 14 Oct 2026; OC-39). Shown to signed-out visitors
 * at `/`. Static content only; nothing here reads account or child data.
 */

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#safety', label: 'Safety and privacy' },
  { href: '#about', label: 'About us' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact us' },
] as const;

// Same colours as the app's lesson chips (StatusChip): orange = AI, blue = teacher.
const TAG_TONE = {
  parent: 'bg-primary-fixed text-on-primary-fixed-variant',
  student: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  teacher: 'bg-success-container text-on-tertiary-fixed-variant',
} as const;

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[8px] border border-dashed border-secondary bg-white px-2 py-0.5 font-bold text-on-warning-container">
      [{children}]
    </span>
  );
}

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-label-md font-bold uppercase tracking-[.08em] text-primary">{eyebrow}</span>
      <h2 id={id} className="text-headline-lg-mobile md:text-headline-lg">
        {title}
      </h2>
    </div>
  );
}

const ICONS: Record<(typeof SAFETY)[number]['id'], ReactNode> = {
  checked: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  parents: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M17 11l2 2 3-3" />
    </>
  ),
  'no-contact': (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
      <path d="M4 20L20 4" />
    </>
  ),
  'no-recording': (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M4 4l16 16" />
    </>
  ),
};

export function LandingPage() {
  const wrap = 'mx-auto w-full max-w-[1160px] px-4 sm:px-6';
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-card-border bg-white">
        <div className={cx(wrap, 'flex min-h-[76px] flex-wrap items-center gap-x-6 gap-y-3 py-3')}>
          <Link
            href="/"
            className="font-headline text-[30px] font-extrabold tracking-[-0.02em] text-primary no-underline"
          >
            {brand.productName}
          </Link>
          <nav aria-label="Main" className="order-3 w-full md:order-none md:w-auto md:flex-1">
            {/* Phone: a disclosure menu (board 63 phone). Desktop: inline links. */}
            <details className="group md:hidden">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-full border-2 border-outline px-4 font-bold">
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
                Menu
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <a
                      href={n.href}
                      className="flex min-h-11 items-center rounded-full px-3 font-bold text-on-surface-variant no-underline hover:bg-surface-container-low hover:text-on-surface"
                    >
                      {n.label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
            <ul className="hidden flex-wrap gap-1 md:flex">
              {NAV.map((n) => (
                <li key={n.href}>
                  <a
                    href={n.href}
                    className="flex min-h-11 items-center rounded-full px-3 text-[15px] font-bold text-on-surface-variant no-underline hover:bg-surface-container-low hover:text-on-surface"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex flex-wrap gap-2.5 md:ml-0">
            <LinkButton href="/sign-in" variant="secondary">
              Sign in
            </LinkButton>
            <LinkButton href="/create-account" className="max-sm:hidden">
              Create an account
            </LinkButton>
          </div>
        </div>
      </header>

      <section className="bg-primary text-on-primary" aria-labelledby="hero-title">
        <div className={cx(wrap, 'grid items-center gap-10 py-12 md:py-[72px] lg:grid-cols-2')}>
          <div className="flex flex-col gap-5">
            <h1 id="hero-title" className="text-headline-xl-mobile text-on-primary md:text-headline-xl">
              Learning at home with an {brand.tutorNameShort} and real teachers
            </h1>
            <p className="text-[19px] leading-[30px] text-on-primary-panel">
              {brand.productName} brings your child&apos;s AI lessons, teacher sessions and learning materials together
              in one place. Parents stay in charge of everything.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/create-account"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 px-[22px] text-[15px] leading-5 font-bold no-underline transition-colors border-white bg-white text-primary-hover hover:bg-primary-fixed hover:text-primary-hover"
              >
                Create an account
              </Link>
              <a
                href="#how"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 px-[22px] text-[15px] leading-5 font-bold no-underline transition-colors border-primary-fixed bg-transparent text-on-primary hover:bg-primary-hover hover:text-on-primary"
              >
                See how it works
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-3.5 rounded-md bg-white p-6 text-on-surface">
            <span className="text-label-md font-bold uppercase tracking-[.08em] text-primary">In one place</span>
            <p className="flex flex-wrap items-center gap-3 text-[15px]">
              <span className={cx('rounded-full px-3 py-1 text-xs font-bold', TAG_TONE.student)}>
                {brand.tutorNameShort}
              </span>
              Voice lessons with the textbook page alongside
            </p>
            <p className="flex flex-wrap items-center gap-3 text-[15px]">
              <span className={cx('rounded-full px-3 py-1 text-xs font-bold', TAG_TONE.parent)}>Teacher</span>
              Live sessions with approved teachers on Zoom
            </p>
            <p className="flex flex-wrap items-center gap-3 text-[15px]">
              <span className={cx('rounded-full px-3 py-1 text-xs font-bold', TAG_TONE.teacher)}>Library</span>
              Books, notes and worksheets for each child
            </p>
            <p className="text-body-sm text-on-surface-variant">
              Subjects: Maths, Science, SST, English, Hindi and IT.
            </p>
          </div>
        </div>
      </section>

      <main>
        <section aria-labelledby="how" className={cx(wrap, 'flex flex-col gap-7 py-12 md:py-16')}>
          <SectionHeading eyebrow="How it works" title="Three simple paths" id="how" />
          <div className="grid gap-6 lg:grid-cols-3">
            {HOW_IT_WORKS.map((path) => (
              <Card as="article" key={path.id} className="flex flex-col gap-4" aria-label={path.label}>
                <span className={cx('self-start rounded-full px-3 py-1 text-xs font-bold', TAG_TONE[path.tone])}>
                  {path.label}
                </span>
                <ol className="flex flex-col gap-3.5">
                  {path.steps.map((step, i) => (
                    <li key={step} className="flex items-start gap-3 text-[15px] leading-[22px]">
                      <span
                        aria-hidden="true"
                        className="flex size-8 flex-none items-center justify-center rounded-full bg-primary-fixed font-headline text-[15px] font-extrabold text-on-primary-fixed"
                      >
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="safety" className="bg-surface-container-low">
          <div className={cx(wrap, 'flex flex-col gap-7 py-12 md:py-16')}>
            <SectionHeading eyebrow="Safety and privacy" title="Built for children, run by parents" id="safety" />
            <div className="grid gap-6 md:grid-cols-2">
              {SAFETY.map((item) => (
                <Card key={item.id} className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-primary-fixed text-primary"
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {ICONS[item.id]}
                    </svg>
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-headline-sm">{item.title}</h3>
                    <p className="text-[15px] leading-[23px] text-on-surface-variant">{item.body}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="about" className={cx(wrap, 'flex flex-col gap-7 py-12 md:py-16')}>
          <SectionHeading eyebrow="About us" title={`About ${brand.productName}`} id="about" />
          <div
            className={cx(
              'flex flex-col gap-3 rounded-md p-6 text-[17px] leading-[27px]',
              landing.about.draft ? 'border-2 border-dashed border-secondary bg-warning-container' : 'bg-white',
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

        <section aria-labelledby="faq" className="bg-surface-container-low">
          <div className={cx(wrap, 'flex flex-col gap-7 py-12 md:py-16')}>
            <SectionHeading eyebrow="FAQ" title="Questions parents and teachers ask" id="faq" />
            <div className="flex max-w-[860px] flex-col gap-3">
              {FAQ.map((item, i) => (
                <details key={item.q} open={i === 0} className="rounded-sm border border-card-border bg-white px-5">
                  <summary className="flex min-h-14 cursor-pointer items-center text-[16px] font-bold">
                    {item.q}
                  </summary>
                  <p className="pb-4 text-[15px] leading-[23px] text-on-surface-variant">{item.a}</p>
                </details>
              ))}
              <details className="rounded-sm border border-card-border bg-white px-5">
                <summary className="flex min-h-14 cursor-pointer items-center text-[16px] font-bold">
                  What does it cost?
                </summary>
                <p className="pb-4 text-[15px] leading-[23px] text-on-surface-variant">
                  {landing.pricing ?? <Placeholder>Pricing — owner to add</Placeholder>}
                </p>
              </details>
            </div>
          </div>
        </section>

        <section aria-labelledby="contact" className={cx(wrap, 'flex flex-col gap-7 py-12 md:py-16')}>
          <SectionHeading eyebrow="Contact us" title="We’re happy to help" id="contact" />
          <Card className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
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
            <LinkButton href="/create-account">Create an account</LinkButton>
          </Card>
        </section>
      </main>

      <footer className="bg-inverse-surface py-10 text-inverse-on-surface">
        <div className={cx(wrap, 'flex flex-wrap items-center justify-between gap-x-8 gap-y-4')}>
          <span className="font-headline text-[24px] font-extrabold text-white">{brand.productName}</span>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              <li>
                <Link href="/sign-in" className="flex min-h-11 items-center text-white">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/create-account" className="flex min-h-11 items-center text-white">
                  Create an account
                </Link>
              </li>
              <li>
                <Link href="/sign-in/child" className="flex min-h-11 items-center text-white">
                  Child sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
