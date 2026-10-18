/**
 * Teacher acceptance of parent requests (CR-12 Point 1; FR-038; OC-97, OC-101).
 * Shared by the server rules and the parent and teacher screens (boards TR1–TR5).
 */

/** A request waits this many calendar days for the teacher, then expires (OC-97 decision 2). */
export const REQUEST_DAYS = 14;
/** After a decline, the same parent waits this long before asking the same teacher for the same child (decision 3). */
export const DECLINE_WAIT_DAYS = 7;
/** Ended requests stay on the parent's My teachers for this long. */
export const ENDED_SHOWN_DAYS = 30;
/** Answers and endings are shown as "New for you" for this long. */
export const NOTICE_DAYS = 7;

export const MESSAGE_MAX = 500;
export const DECLINE_NOTE_MAX = 300;

const DAY = 86_400_000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

export const DECLINE_REASONS = ['no_time', 'not_a_fit', 'personal', 'other'] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const DECLINE_REASON_TEXT: Record<DeclineReason, string> = {
  no_time: 'No time at the moment',
  not_a_fit: 'Subject or grade is not a good fit',
  personal: 'Personal reasons',
  other: 'Other',
};

export const isDeclineReason = (v: string): v is DeclineReason => (DECLINE_REASONS as readonly string[]).includes(v);

/**
 * pending: waiting for AA Pro to approve the teacher; requested: waiting for the teacher;
 * active: accepted (or linked before requests existed); the rest have ended and give no access.
 */
export type RequestState = 'pending' | 'requested' | 'active' | 'declined' | 'expired' | 'withdrawn';

/** Free text the parent or teacher types: one line breaks kept, extra spaces removed, empty → null. */
export function cleanText(v: string, max: number): string | null | 'too_long' {
  const t = v
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!t) return null;
  return [...t].length > max ? 'too_long' : t;
}

/** "22 Oct" in the viewer's time zone. */
export const shortDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(d);

/** "22 Oct, 6:00 pm" in the viewer's time zone, for limits that end at an exact moment. */
export const dayAndTime = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
