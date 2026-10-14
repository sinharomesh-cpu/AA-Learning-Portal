'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface NavLinkProps {
  href: string;
  children: ReactNode;
  /** `exact` marks the item current only on its own path (used for each shell's Home). */
  exact?: boolean;
  className?: string;
  activeClassName: string;
  inactiveClassName: string;
  ariaLabel?: string;
}

/** Navigation link that sets aria-current="page" for the current section. */
export function NavLink({
  href,
  children,
  exact,
  className,
  activeClassName,
  inactiveClassName,
  ariaLabel,
}: NavLinkProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel}
      className={cx(className, active ? activeClassName : inactiveClassName)}
    >
      {children}
    </Link>
  );
}
