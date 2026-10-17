'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
/** `md` = 48 px minimum target; `child` = 56 px for primary child actions (AX-04). */
export type ButtonSize = 'md' | 'child';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full border-2 font-body font-bold no-underline ' +
  'transition-colors cursor-pointer box-border text-center';
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-12 px-[22px] text-[15px] leading-5',
  child: 'min-h-14 px-[26px] text-[17px] leading-6',
};
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary border-primary text-on-primary hover:bg-primary-hover hover:border-primary-hover hover:text-on-primary',
  // DV-02: secondary borders use `outline` (#707881, 4.48:1), not `outline-variant` (1.71:1).
  secondary:
    'bg-surface-container-lowest border-outline text-on-surface hover:bg-surface-container-low hover:text-on-surface',
  danger:
    'bg-surface-container-lowest border-error text-on-error-container hover:bg-error-container hover:text-on-error-container',
};
const INACTIVE =
  'bg-surface-container border-surface-container text-on-surface-variant cursor-not-allowed hover:bg-surface-container';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Shows the button as unavailable but keeps it focusable and announced
   * (aria-disabled), so screen-reader users learn why they cannot act yet.
   */
  inactive?: boolean;
  children: ReactNode;
  className?: string;
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  inactive = false,
  className,
}: Omit<CommonProps, 'children'>) {
  return cx(BASE, SIZES[size], inactive ? INACTIVE : VARIANTS[variant], className);
}

type ButtonProps = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

export function Button({
  variant,
  size,
  inactive,
  className,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, inactive, className })}
      aria-disabled={inactive || undefined}
      onClick={inactive ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

type LinkButtonProps = CommonProps & { href: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'className' | 'children' | 'href'
  >;

export function LinkButton({ variant, size, className, children, href, ...rest }: LinkButtonProps) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })} {...rest}>
      {children}
    </Link>
  );
}
