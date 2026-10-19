import { Icon } from '@/components/icons/Icon';
import { cx } from '@/lib/cx';
import { VERIFIED_EXPLANATION, VERIFIED_LABEL } from '@/lib/verification';

/**
 * The "AA Pro Verified" tick (CR-15 §5.1, OC-106 (2)). Shown only while a teacher is verified
 * and not expired; the caller decides that live on the server. The explanation is always
 * reachable without hovering: written out in full on a profile, and behind a native disclosure
 * (keyboard and screen-reader friendly) on the smaller cards.
 */
export function VerifiedTick({ variant = 'card', className }: { variant?: 'card' | 'full'; className?: string }) {
  const tick = (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-extrabold text-on-success-container">
      <Icon name="verified_fill" size={18} className="text-on-success-container" />
      {VERIFIED_LABEL}
    </span>
  );
  if (variant === 'full') {
    return (
      <div
        data-testid="verified-tick"
        className={cx(
          'flex flex-col gap-1.5 rounded-[16px] border border-success-border bg-success-container px-3.5 py-3',
          className,
        )}
      >
        {tick}
        <p className="m-0 text-[14px] leading-5 text-on-success-container">{VERIFIED_EXPLANATION}</p>
      </div>
    );
  }
  return (
    <details
      data-testid="verified-tick"
      className={cx(
        'group self-start rounded-[14px] border border-success-border bg-success-container px-2.5 py-1 open:self-stretch',
        className,
      )}
    >
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        {tick}
        <span className="text-[12px] font-bold text-on-success-container underline">
          <span className="group-open:hidden">What this means</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <p className="m-0 pb-1.5 pt-1 text-[13px] leading-[19px] text-on-success-container">{VERIFIED_EXPLANATION}</p>
    </details>
  );
}
