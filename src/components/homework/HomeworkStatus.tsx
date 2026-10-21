import { cx } from '@/lib/cx';

/** CR-07 §6 status chips: always with text (AX-07); colour is never the only signal. */
export type HomeworkStatusName =
  'assigned' | 'in_progress' | 'submitted' | 'under_review' | 'revision_required' | 'reviewed' | 'withdrawn';

const LABEL: Record<HomeworkStatusName, string> = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  revision_required: 'Revision required',
  reviewed: 'Reviewed',
  withdrawn: 'Withdrawn',
};

const NEUTRAL = 'border-outline-variant bg-surface-container text-on-surface-variant';
const BLUE = 'border-primary-fixed-dim bg-primary-fixed/60 text-on-primary-fixed';
const AMBER = 'border-warning-border bg-warning-container text-on-warning-container';
const GREEN = 'border-success-border bg-success-container text-on-success-container';
const RED = 'border-error-border bg-error-container text-on-error-container';

const TONE: Record<HomeworkStatusName, string> = {
  assigned: NEUTRAL,
  in_progress: BLUE,
  submitted: BLUE,
  under_review: AMBER,
  revision_required: AMBER,
  reviewed: GREEN,
  withdrawn: NEUTRAL,
};

const CHIP = 'inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold leading-4 whitespace-nowrap';

export function HomeworkStatus({
  status,
  overdue,
  late,
  scheduled,
  attempt,
  child,
}: {
  status: HomeworkStatusName;
  overdue?: boolean;
  late?: boolean;
  scheduled?: boolean;
  attempt?: number;
  child?: boolean;
}) {
  const size = child ? 'text-sm px-3.5 py-1.5' : '';
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {scheduled ? (
        <span className={cx(CHIP, BLUE, size)}>Scheduled</span>
      ) : (
        <span className={cx(CHIP, TONE[status], size)}>
          {LABEL[status]}
          {status === 'revision_required' && attempt && attempt > 1 ? ` · attempt ${attempt}` : ''}
        </span>
      )}
      {overdue ? <span className={cx(CHIP, RED, size)}>Overdue</span> : null}
      {late ? <span className={cx(CHIP, RED, size)}>Late</span> : null}
    </span>
  );
}

export function formatDue(d: Date | null, timeZone: string): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}
