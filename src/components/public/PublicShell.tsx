import Link from 'next/link';
import type { ReactNode } from 'react';
import { LinkButton } from '@/components/Button';
import { brand } from '@/config/brand';
import { cx } from '@/lib/cx';
import { Icon } from './icons';
import { ThemeToggle } from './ThemeToggle';

/**
 * Shared frame for the public pages (home, sign-in, child sign-in, create account), following
 * the owner's ZIP 5 references: glass header with the AA Pro mark, light/dark switch, footer.
 * Everything inside `.aa-public` follows the visitor's light/dark choice (public-theme.css).
 */

export const PUBLIC_WRAP = 'mx-auto w-full max-w-[1280px] px-5 sm:px-8';

const NAV = [
  { id: 'teachers', label: 'Find a teacher' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'how', label: 'How it works' },
  { id: 'safety', label: 'Safety and privacy' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact us' },
] as const;

/** The AA Pro mark from the reference: an open book in a ring, then "AA Pro". */
export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cx(
          'pub-glow flex flex-none items-center justify-center rounded-full border border-primary/40 bg-primary-fixed/70 text-primary',
          lg ? 'size-12' : 'size-10',
        )}
      >
        <Icon name="book" size={lg ? 24 : 20} />
      </span>
      <span
        className={cx(
          'font-headline font-extrabold tracking-[-0.02em]',
          lg ? 'text-[30px] leading-9' : 'text-[26px] leading-8',
        )}
      >
        <span className="pub-brand-aa">AA</span> <span className="text-primary">Pro</span>
      </span>
    </span>
  );
}

function PublicHeader({ onHome }: { onHome: boolean }) {
  const href = (id: string) => (onHome ? `#${id}` : `/#${id}`);
  const link =
    'flex min-h-11 items-center whitespace-nowrap rounded-full px-2 text-[15px] font-semibold text-on-surface-variant no-underline hover:bg-surface-container-low hover:text-on-surface';
  return (
    <header
      className="sticky top-0 z-40 border-b border-card-border backdrop-blur-xl"
      style={{ backgroundColor: 'var(--pub-header-bg)' }}
    >
      <div className={cx(PUBLIC_WRAP, 'flex min-h-[76px] flex-wrap items-center gap-x-3 gap-y-2 py-3')}>
        <Link href="/" aria-label={`${brand.productName} home`} className="no-underline">
          <BrandMark />
        </Link>
        <nav aria-label="Main" className="relative order-3 w-full md:order-none md:ml-2 md:w-auto min-[1240px]:flex-1">
          <details className="group min-[1240px]:hidden">
            <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-card-border bg-surface-container-low px-4 font-bold text-on-surface">
              <Icon name="menu" size={20} />
              Menu
            </summary>
            <ul className="mt-2 grid gap-1 pb-2 sm:grid-cols-2 md:absolute md:left-0 md:top-full md:z-50 md:w-[440px] md:rounded-[18px] md:border md:border-card-border md:bg-surface-container-lowest md:p-2 md:shadow-lg">
              {NAV.map((n) => (
                <li key={n.id}>
                  <a href={href(n.id)} className={link}>
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>
          <ul className="hidden items-center gap-0.5 min-[1240px]:flex">
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={href(n.id)} className={link}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 min-[1240px]:ml-0">
          <ThemeToggle />
          <LinkButton href="/sign-in" variant="secondary" className="max-[380px]:px-4">
            Sign in
          </LinkButton>
          <LinkButton href="/create-account" className="max-md:hidden">
            Create an account
          </LinkButton>
        </div>
      </div>
    </header>
  );
}

function PublicFooter({ onHome }: { onHome: boolean }) {
  const href = (id: string) => (onHome ? `#${id}` : `/#${id}`);
  const col = 'flex flex-col gap-1';
  const link = 'flex min-h-11 items-center text-[15px] text-on-surface-variant no-underline hover:text-primary';
  return (
    <footer className="pub-band border-t border-card-border">
      <div className={cx(PUBLIC_WRAP, 'grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]')}>
        <div className="flex max-w-sm flex-col gap-4">
          <BrandMark />
          <p className="text-body-md text-on-surface-variant">
            One place for your child&apos;s learning: an AI Tutor, real teachers and your family&apos;s own books, with
            parents in charge.
          </p>
        </div>
        <nav aria-label="Platform" className={col}>
          <h2 className="pb-2 font-headline text-[17px] font-bold">Platform</h2>
          <a href={href('how')} className={link}>
            How it works
          </a>
          <a href={href('subjects')} className={link}>
            Subjects
          </a>
          <a href={href('teachers')} className={link}>
            Find a teacher
          </a>
        </nav>
        <nav aria-label="Accounts" className={col}>
          <h2 className="pb-2 font-headline text-[17px] font-bold">Accounts</h2>
          <Link href="/sign-in" className={link}>
            Sign in
          </Link>
          <Link href="/create-account" className={link}>
            Create an account
          </Link>
          <Link href="/sign-in/child" className={link}>
            Child sign in
          </Link>
        </nav>
        <nav aria-label="Help" className={col}>
          <h2 className="pb-2 font-headline text-[17px] font-bold">Safety and help</h2>
          <a href={href('safety')} className={link}>
            Safety and privacy
          </a>
          <a href={href('faq')} className={link}>
            FAQ
          </a>
          <a href={href('contact')} className={link}>
            Contact us
          </a>
        </nav>
      </div>
      <div className={cx(PUBLIC_WRAP, 'border-t border-card-border py-6')}>
        <p className="text-body-sm text-on-surface-variant">© {brand.productName}</p>
      </div>
    </footer>
  );
}

export function PublicShell({ children, onHome = false }: { children: ReactNode; onHome?: boolean }) {
  return (
    <div className="aa-public flex min-h-dvh flex-col">
      <PublicHeader onHome={onHome} />
      {children}
      <PublicFooter onHome={onHome} />
    </div>
  );
}

/** "Back to home" for the sign-in and account pages (OC-52). */
export function BackToHomeLink() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-2 self-start rounded-full px-3 text-[15px] font-bold text-primary no-underline hover:bg-surface-container-low"
    >
      <Icon name="arrowLeft" size={18} />
      Back to home
    </Link>
  );
}
