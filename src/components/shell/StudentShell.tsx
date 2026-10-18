import type { ReactNode } from 'react';
import { Wordmark } from '@/components/Wordmark';
import { Icon } from '@/components/icons/Icon';
import { ThemeToggle } from '@/components/public/ThemeToggle';
import { OfflineBanner } from '@/components/states/OfflineBanner';
import { AccountMenu } from './AccountMenu';
import { NavLink } from './NavLink';

const ITEMS = [
  { href: '/student', label: 'Home', icon: 'home', exact: true },
  { href: '/student/schedule', label: 'My schedule', icon: 'event_available', short: 'Schedule' },
  { href: '/student/book', label: 'Book AI class', icon: 'smart_toy', short: 'AI', fab: true },
  // Board HW5 (approved, OC-95): homework and "From my teachers".
  { href: '/student/homework', label: 'Homework', icon: 'description' },
  { href: '/student/library', label: 'Library', icon: 'library_books' },
  { href: '/student/history', label: 'History', icon: 'history_edu' },
] as const;

/**
 * CMP-ShellStudent (S1 desktop top nav, S9 phone bottom nav with AI button).
 * Student-only menu: no booking of human teachers, no uploads, no sibling switcher (R-02).
 */
export function StudentShell({
  displayName,
  initial,
  children,
}: {
  displayName: string;
  initial: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-24 lg:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-full focus:bg-surface-container-lowest focus:px-4 focus:py-2"
      >
        Skip to main content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-card-border bg-surface-container-lowest px-4 py-3 sm:px-8 lg:py-4">
        <Wordmark href="/student" size={28} />
        <nav aria-label="Student menu" className="hidden flex-wrap gap-1.5 lg:flex">
          {ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              exact={'exact' in item}
              className="flex min-h-12 items-center gap-2 rounded-full px-[18px] text-[15px] font-bold no-underline"
              activeClassName="bg-primary text-on-primary hover:text-on-primary"
              inactiveClassName="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AccountMenu displayName={displayName} initial={initial} roleLabel="Student" child />
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 sm:px-6">
        <OfflineBanner />
      </div>
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-6 pt-4 sm:px-6 lg:pt-7">
        {children}
      </main>
      <nav
        aria-label="Student menu"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-6 items-center border-t border-card-border bg-surface-container-lowest px-1 pb-2.5 pt-1.5 lg:hidden"
      >
        {ITEMS.map((item) =>
          'fab' in item ? (
            <NavLink
              key={item.href}
              href={item.href}
              ariaLabel={item.label}
              className="flex h-14 w-14 items-center justify-center justify-self-center rounded-full font-extrabold text-[14px] no-underline"
              activeClassName="bg-primary-hover text-on-primary hover:text-on-primary"
              inactiveClassName="bg-primary text-on-primary hover:text-on-primary"
            >
              <Icon name={item.icon} size={28} />
            </NavLink>
          ) : (
            <NavLink
              key={item.href}
              href={item.href}
              exact={'exact' in item}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-bold no-underline"
              activeClassName="text-primary"
              inactiveClassName="text-on-surface-variant"
            >
              <Icon name={item.icon} size={24} />
              {'short' in item ? item.short : item.label}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}
