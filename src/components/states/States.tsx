import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** Loading placeholder: steady grey blocks; screen readers hear "Loading". No shimmer. */
export function LoadingState({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-14 rounded-[12px] bg-surface-container" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  children: ReactNode;
  /** One clear next step the current role is allowed to take. */
  action?: ReactNode;
}

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-outline bg-surface-container-lowest p-6">
      <h3 className="text-[20px] font-semibold leading-7">{title}</h3>
      <p className="text-[15px] leading-[22px] text-on-surface-variant">{children}</p>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  /** Reference code for adults only. Children never see codes (board 9). */
  reference?: string;
  audience: 'child' | 'adult';
  action?: ReactNode;
}

export function ErrorState({
  message = "We couldn't load this. Please try again.",
  reference,
  audience,
  action,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-error-border bg-error-container px-4 py-3.5 text-[15px] leading-[22px] text-on-error-container"
    >
      <span>
        {message}
        {audience === 'adult' && reference ? (
          <>
            {' '}
            Reference:{' '}
            <span className="rounded-[8px] bg-surface-container-lowest px-2 py-0.5 font-mono text-[13px]">
              {reference}
            </span>
          </>
        ) : null}
      </span>
      {action}
    </div>
  );
}

export function SuccessMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'rounded-[16px] border border-success-border bg-success-container px-4 py-3.5 text-[15px] leading-[22px] text-on-success-container',
        className,
      )}
    >
      {children}
    </div>
  );
}
