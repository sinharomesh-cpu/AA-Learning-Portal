import type { ReactNode } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { StatusChip } from '@/components/StatusChip';
import { brand } from '@/config/brand';
import { cx } from '@/lib/cx';

/**
 * CMP-ResultState for AI booking outcomes (board 28, M-17; phone board 49).
 * The four states a student sees after pressing "Book" in the S13 wizard.
 */

type Tone = 'success' | 'warning' | 'error' | 'neutral';

const TONES: Record<Tone, { ring: string; icon: string; stroke: string }> = {
  success: { ring: 'border-success-border', icon: 'bg-success-container', stroke: 'stroke-on-tertiary-fixed-variant' },
  warning: { ring: 'border-card-border', icon: 'bg-warning-container', stroke: 'stroke-on-secondary-fixed-variant' },
  error: { ring: 'border-card-border', icon: 'bg-error-container', stroke: 'stroke-on-error-container' },
  neutral: { ring: 'border-card-border', icon: 'bg-surface-container', stroke: 'stroke-on-surface-variant' },
};

const ICONS: Record<Tone, ReactNode> = {
  success: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warning: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  error: (
    <>
      <path d="M12 7v6" />
      <path d="M12 17v.01" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  neutral: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
};

interface ShellProps {
  tone: Tone;
  title: string;
  /** Booked is a status; the problems are alerts so screen readers announce them at once. */
  live: 'status' | 'alert';
  headingLevel?: 1 | 2;
  children: ReactNode;
}

function OutcomeCard({ tone, title, live, headingLevel = 1, children }: ShellProps) {
  const t = TONES[tone];
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section
      role={live}
      className={cx(
        'flex flex-col gap-3.5 rounded-md border bg-surface-container-lowest p-5 shadow-[0_4px_12px_-2px_rgba(19,27,46,0.05),0_2px_6px_-1px_rgba(19,27,46,0.03)] sm:p-6',
        t.ring,
      )}
    >
      <span aria-hidden="true" className={cx('flex h-16 w-16 items-center justify-center rounded-full', t.icon)}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={t.stroke}
        >
          {ICONS[tone]}
        </svg>
      </span>
      <Heading className="font-headline text-[28px] font-bold leading-9">{title}</Heading>
      {children}
    </section>
  );
}

interface BookedProps {
  subjectName: string;
  chapter: string | null;
  dayLabel: string;
  timeLabel: string;
  length: number;
  headingLevel?: 1 | 2;
}

export function BookedOutcome({ subjectName, chapter, dayLabel, timeLabel, length, headingLevel }: BookedProps) {
  return (
    <OutcomeCard tone="success" title="You're booked!" live="status" headingLevel={headingLevel}>
      <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
        <strong>Demo:</strong> this is a preview with sample data. Nothing was really booked.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip kind="ai">{brand.tutorNameShort}</StatusChip>
        <span className="text-[17px] font-bold">
          {subjectName} · {dayLabel} {timeLabel} · {length} min
        </span>
      </div>
      {chapter ? <p className="text-[15px] text-on-surface-variant">{chapter}</p> : null}
      <p className="text-[15px] leading-[22px] text-on-surface-variant">
        It&apos;s on your schedule. We&apos;ll show a reminder on your home page before it starts.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <LinkButton href="/student/schedule" size="child">
          See my schedule
        </LinkButton>
        <LinkButton href="/student/book" variant="secondary" size="child">
          Book another
        </LinkButton>
      </div>
    </OutcomeCard>
  );
}

interface TakenProps {
  timeLabel: string;
  alternatives: Array<{ label: string; href: string }>;
  headingLevel?: 1 | 2;
}

export function TimeTakenOutcome({ timeLabel, alternatives, headingLevel }: TakenProps) {
  return (
    <OutcomeCard tone="warning" title="That time was just taken" live="alert" headingLevel={headingLevel}>
      <p className="text-[17px] leading-[26px]">
        Something else was booked at {timeLabel}. Here are other times you can pick.
      </p>
      {alternatives.length ? (
        <div className="flex flex-wrap gap-2.5">
          {alternatives.map((a) => (
            <LinkButton key={a.href} href={a.href} variant="secondary" size="child">
              {a.label}
            </LinkButton>
          ))}
        </div>
      ) : (
        <LinkButton href="/student/book" variant="secondary" size="child" className="self-start">
          Show open times
        </LinkButton>
      )}
    </OutcomeCard>
  );
}

export function BookingErrorOutcome({ headingLevel, onRetry }: { headingLevel?: 1 | 2; onRetry?: () => void }) {
  return (
    <OutcomeCard tone="error" title="Oops, that didn't work" live="alert" headingLevel={headingLevel}>
      <p className="text-[17px] leading-[26px]">Your lesson wasn&apos;t booked yet. Please try again.</p>
      <Button size="child" className="self-start" onClick={onRetry}>
        Try again
      </Button>
      <p className="text-[15px] text-on-surface-variant">Trying again is safe — it won&apos;t make two bookings.</p>
    </OutcomeCard>
  );
}

export function NotOpenOutcome({ headingLevel }: { headingLevel?: 1 | 2 }) {
  return (
    <OutcomeCard tone="neutral" title="That time isn't open" live="alert" headingLevel={headingLevel}>
      <p className="text-[17px] leading-[26px]">
        This time isn&apos;t available for lessons. Pick one of the open times instead.
      </p>
      <LinkButton href="/student/book" variant="secondary" size="child" className="self-start">
        Show open times
      </LinkButton>
    </OutcomeCard>
  );
}
