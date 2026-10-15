import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

const TONES = {
  error: 'border-error-border bg-error-container text-on-error-container',
  info: 'border-primary-fixed-dim bg-primary-fixed/50 text-on-primary-fixed',
  success: 'border-success-border bg-success-container text-on-success-container',
  warning: 'border-warning-border bg-warning-container text-on-warning-container',
} as const;

/** Alert box used by the account forms. Errors are announced to screen readers (role=alert). */
export function FormMessage({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-[16px] border px-4 py-3 text-[15px] leading-[22px]', TONES[tone])}
    >
      {children}
    </p>
  );
}
