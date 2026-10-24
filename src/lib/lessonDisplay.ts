import type { ChipKind } from '@/components/StatusChip';

/**
 * How a Human Teacher lesson is shown (CR-17 PR 2). Safe on the server and in the browser.
 * Times are formatted in the viewer's own time zone; a status is always shown in words.
 */

export type LessonStatusName = 'requested' | 'confirmed' | 'declined' | 'withdrawn' | 'expired' | 'cancelled';
export type CloseReason = 'time_no_longer_free' | 'teacher_deactivated' | 'link_ended' | null;
export type ClosedBy = 'parent' | 'teacher' | 'aa_pro' | null;

/** "Tue 4 Nov, 4:00 pm" in a time zone. */
export function formatLessonTime(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

/** "4:00 pm" in a time zone. */
export function formatClock(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

/** "Tuesday 4 November" for a YYYY-MM-DD date (a calendar date, not an instant). */
export function formatDayName(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** The local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** The status in words for each viewer (the scope's agreed wording), with a chip colour. */
export function lessonStatusText(
  l: {
    status: LessonStatusName;
    closedBy: ClosedBy;
    closeReason: CloseReason;
    /** B3: the viewer closed it; for a parent, the first name of the parent who did. */
    closedByYou?: boolean;
    closedByName?: string | null;
  },
  viewer: 'parent' | 'teacher',
): { text: string; kind: ChipKind } {
  switch (l.status) {
    case 'requested':
      return { text: viewer === 'parent' ? 'Waiting for the teacher' : 'Waiting for your answer', kind: 'warning' };
    case 'confirmed':
      return { text: 'Confirmed', kind: 'success' };
    case 'expired':
      return { text: viewer === 'parent' ? 'Expired: no answer in time' : 'Expired', kind: 'neutral' };
    case 'withdrawn':
      return { text: viewer === 'parent' ? 'Withdrawn' : 'Withdrawn by the parent', kind: 'neutral' };
    case 'declined':
      if (l.closedBy === 'teacher')
        return { text: viewer === 'parent' ? 'Declined by the teacher' : 'Declined', kind: 'neutral' };
      if (l.closeReason === 'time_no_longer_free') return { text: 'Time no longer free', kind: 'neutral' };
      return { text: 'Closed by AA Pro', kind: 'neutral' };
    case 'cancelled':
      if (l.closedBy === 'aa_pro') return { text: 'Cancelled by AA Pro', kind: 'error' };
      if (l.closedBy === 'parent') {
        if (viewer === 'teacher') return { text: 'Cancelled by the parent', kind: 'error' };
        // B3: "you" for the parent who cancelled, their first name for the other parent.
        if (l.closedByYou) return { text: 'Cancelled by you', kind: 'error' };
        return { text: l.closedByName ? `Cancelled by ${l.closedByName}` : 'Cancelled by a parent', kind: 'error' };
      }
      return { text: viewer === 'parent' ? 'Cancelled by the teacher' : 'Cancelled by you', kind: 'error' };
  }
}

/** Why AA Pro closed or cancelled it, in words, or null. */
export function closeReasonText(reason: CloseReason): string | null {
  if (reason === 'time_no_longer_free') return 'Another lesson was confirmed at an overlapping time.';
  if (reason === 'teacher_deactivated') return 'The teacher is no longer available on AA Pro.';
  if (reason === 'link_ended') return 'The teacher is no longer linked to this child for this subject.';
  return null;
}
