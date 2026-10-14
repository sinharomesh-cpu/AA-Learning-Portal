import { brand } from '@/config/brand';
import { cx } from '@/lib/cx';
import { StatusChip } from './StatusChip';
import { TimeDisplay } from './TimeDisplay';

export type SessionKind = 'ai' | 'human';

interface SessionRowProps {
  kind: SessionKind;
  subject: string;
  startIso: string;
  durationMinutes: number;
  timeZone: string;
  last?: boolean;
}

/** One line in a "Today" list. AI and human sessions are always labelled in words. */
export function SessionRow({ kind, subject, startIso, durationMinutes, timeZone, last }: SessionRowProps) {
  return (
    <li
      className={cx(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5',
        !last && 'border-b border-surface-container',
      )}
    >
      <span className="flex flex-col items-start gap-1">
        <StatusChip kind={kind === 'ai' ? 'ai' : 'human'}>
          {kind === 'ai' ? brand.tutorNameShort : 'Teacher'}
        </StatusChip>
        <strong>
          <TimeDisplay iso={startIso} timeZone={timeZone} /> · {subject}
        </strong>
      </span>
      <span className="text-[15px] text-on-surface-variant">{durationMinutes} min</span>
    </li>
  );
}
