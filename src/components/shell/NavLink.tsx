'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useNotificationCounts } from '@/components/notifications/NotificationCounts';
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
  /** CR-16: the item's visible label, so a menu badge is read as "Enquiries, 3 waiting for you". */
  badgeLabel?: string;
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
  badgeLabel,
}: NavLinkProps) {
  const pathname = usePathname();
  const waiting = useNotificationCounts()?.badges[href] ?? 0;
  const label = badgeLabel && waiting > 0 ? `${badgeLabel}, ${waiting} waiting for you` : ariaLabel;
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={cx(className, active ? activeClassName : inactiveClassName)}
    >
      {children}
    </Link>
  );
}
