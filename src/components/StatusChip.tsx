import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type ChipKind = 'ai' | 'human' | 'success' | 'warning' | 'error' | 'neutral';

const KINDS: Record<ChipKind, string> = {
  ai: 'bg-secondary-fixed text-on-secondary-fixed-variant border-secondary-fixed-dim',
  human: 'bg-primary-fixed text-on-primary-fixed-variant border-human-border',
  success: 'bg-success-container text-on-tertiary-fixed-variant border-success-border',
  warning: 'bg-warning-container text-on-secondary-fixed-variant border-warning-border',
  error: 'bg-error-container text-on-error-container border-error-border',
  neutral: 'bg-surface-container text-on-surface-variant border-outline-variant',
};

interface StatusChipProps {
  kind: ChipKind;
  /** The status in words. Required: status is never shown by colour alone (AX-07). */
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function StatusChip({ kind, children, icon, className }: StatusChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-bold leading-[18px]',
        KINDS[kind],
        className,
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}
