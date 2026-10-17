import type { ReactNode } from 'react';
import { Wordmark } from '@/components/Wordmark';
import { Icon, type SymbolName } from '@/components/icons/Icon';
import { ThemeToggle } from '@/components/public/ThemeToggle';
import { OfflineBanner } from '@/components/states/OfflineBanner';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { AccountMenu } from './AccountMenu';
import { MobileMenu } from './MobileMenu';
import { NavLink } from './NavLink';

export interface MenuItem {
  href: string;
  label: string;
  exact?: boolean;
  /** Shown greyed out and not a link (M-20: pages that open after approval). */
  disabled?: boolean;
  /** The item's icon from the design's outlined set, the same for that page in every menu. */
  icon?: SymbolName;
}

interface AdultShellProps {
  role: Exclude<Role, 'student'>;
  menu: MenuItem[];
  displayName: string;
  initial: string;
  /** A short line under the menu, e.g. why some items are greyed out. */
  menuNote?: string;
  children: ReactNode;
}

/**
 * CMP-ShellAdult: one sidebar shell, a separate menu per role (G1-02 Appendix A).
 * Desktop shows the sidebar; phones get a "Menu" disclosure (board 52).
 */
export function AdultShell({ role, menu, displayName, initial, menuNote, children }: AdultShellProps) {
  const roleLabel = ROLE_LABEL[role];
  const navLabel = `${roleLabel} menu`;
  const links = (layout: 'side' | 'sheet') => [
    ...menu.map((item) =>
      item.disabled ? (
        <span
          key={item.href}
          aria-disabled="true"
          className="flex min-h-12 cursor-not-allowed items-center gap-3 rounded-full px-4 text-[15px] font-medium text-on-surface-variant"
        >
          {item.icon ? <Icon name={item.icon} /> : null}
          {item.label}
        </span>
      ) : (
        <NavLink
          key={item.href}
          href={item.href}
          exact={item.exact}
          className="flex min-h-12 items-center gap-3 rounded-full px-4 text-[15px] font-bold no-underline"
          activeClassName="bg-primary text-on-primary hover:text-on-primary"
          inactiveClassName={
            layout === 'side'
              ? 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
              : 'text-on-surface hover:bg-surface-container-low'
          }
        >
          {item.icon ? <Icon name={item.icon} /> : null}
          {item.label}
        </NavLink>
      ),
    ),
    layout === 'sheet' ? (
      <div
        key="theme"
        className="mt-2 flex min-h-12 items-center justify-between gap-3 border-t border-card-border px-4 pt-3 text-[15px] font-bold text-on-surface"
      >
        <span>Dark mode</span>
        <ThemeToggle />
      </div>
    ) : null,
    menuNote ? (
      <p key="menu-note" className="px-4 pt-2 text-sm leading-5 text-on-surface-variant">
        {menuNote}
      </p>
    ) : null,
  ];
  const home = menu.find((item) => !item.disabled)?.href;
  const roleChip = (
    <span className="rounded-full bg-on-surface px-2.5 py-0.5 text-[12px] font-bold text-surface-container-lowest">
      {roleLabel}
    </span>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-full focus:bg-surface-container-lowest focus:px-4 focus:py-2"
      >
        Skip to main content
      </a>
      <aside className="hidden w-[260px] shrink-0 flex-col gap-1 border-r border-card-border bg-surface-container-lowest px-4 py-6 lg:flex">
        <div className="mb-4 flex flex-col items-start gap-2 px-2">
          <Wordmark href={home} size={28} />
          {roleChip}
        </div>
        <nav aria-label={navLabel} className="flex flex-col gap-1">
          {links('side')}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex items-center justify-between gap-3 border-b border-card-border bg-surface-container-lowest px-4 py-2.5 sm:px-8 lg:justify-end lg:py-4">
          <div className="flex items-center gap-2 lg:hidden">
            <Wordmark href={home} size={24} />
            {roleChip}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
            <MobileMenu label={navLabel}>{links('sheet')}</MobileMenu>
            <AccountMenu displayName={displayName} initial={initial} roleLabel={roleLabel} />
          </div>
        </header>
        <div className="px-4 pt-4 sm:px-8">
          <OfflineBanner />
        </div>
        <main id="main" className="flex-1 px-4 pb-10 pt-4 sm:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
