import { formatClockTime } from '@/lib/time';

interface TimeDisplayProps {
  /** UTC ISO instant. */
  iso: string;
  /** Viewer's IANA time zone (FR-019). */
  timeZone: string;
  className?: string;
}

/** Renders a clock time in the viewer's zone with a machine-readable <time> element. */
export function TimeDisplay({ iso, timeZone, className }: TimeDisplayProps) {
  return (
    <time dateTime={iso} className={className}>
      {formatClockTime(iso, { timeZone })}
    </time>
  );
}
