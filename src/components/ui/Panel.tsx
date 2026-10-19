import type { ReactNode } from 'react';
import { Icon } from '@/components/icons/Icon';
import { cx } from '@/lib/cx';
import { BODY, CHIP, CHOICE_CARD, HEAD, OVERLAY_INPUT, SHELL } from './styles';

/**
 * Shared parts of the signed-in page design (OC-110): a card panel with a tinted header, chip
 * toggles with a tick and a tick-box card. No hooks, so they work in server and client pages.
 */

export function PanelHead({
  id,
  title,
  intro,
  badge,
  level = 2,
}: {
  id: string;
  title: ReactNode;
  intro?: ReactNode;
  badge?: ReactNode;
  level?: 2 | 3;
}) {
  const H = `h${level}` as 'h2' | 'h3';
  return (
    <div className={HEAD}>
      <div className="flex min-w-0 max-w-[64ch] flex-col gap-1">
        <H id={id} className="font-headline text-[24px] font-bold leading-8 sm:text-[26px]">
          {title}
        </H>
        {intro ? <div className="text-[15px] leading-[22px] text-on-surface-variant">{intro}</div> : null}
      </div>
      {badge}
    </div>
  );
}

/** A section card: tinted header, then the body with even spacing. */
export function Panel({
  id,
  title,
  intro,
  badge,
  children,
  className,
  bodyClassName,
  level,
}: {
  id: string;
  title: ReactNode;
  intro?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  level?: 2 | 3;
}) {
  return (
    <section aria-labelledby={id} className={cx(SHELL, className)}>
      <PanelHead id={id} title={title} intro={intro} badge={badge} level={level} />
      {children ? <div className={cx(BODY, bodyClassName)}>{children}</div> : null}
    </section>
  );
}

/** A chip toggle: the native checkbox or radio covers the chip (keyboard and tests use it as normal). */
export function Chip({
  children,
  className,
  ...input
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> & { children: ReactNode; className?: string }) {
  return (
    <label className={cx(CHIP, className)}>
      <input type="checkbox" {...input} className={OVERLAY_INPUT} />
      <Icon name="check" size={16} className="hidden group-has-[:checked]:block" />
      {children}
    </label>
  );
}

/** A tick-box card for agreements and on/off choices. */
export function TickCard({
  children,
  className,
  ...input
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> & {
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx(CHOICE_CARD, className)}>
      {/* Over the tick square only, so links in the text stay clickable; the label ticks it too. */}
      <input
        type="checkbox"
        {...input}
        className="absolute left-4 top-[18px] m-0 size-6 cursor-pointer appearance-none opacity-0"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-[8px] border-2 border-outline bg-surface-container-lowest text-on-primary group-has-[:checked]:border-primary group-has-[:checked]:bg-primary"
      >
        <Icon name="check" size={16} className="hidden group-has-[:checked]:block" />
      </span>
      <span className="text-[15px] leading-[22px] [&_a]:relative [&_a]:z-10">{children}</span>
    </label>
  );
}

/** Small uppercase heading used inside tiles and fieldsets. */
export function TileKey({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('text-[11px] font-extrabold uppercase tracking-[.07em] text-on-surface-variant', className)}>
      {children}
    </span>
  );
}
