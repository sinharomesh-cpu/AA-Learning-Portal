import { localDayAt } from '@/lib/localTime';
import { clockNow } from '@/lib/clock';
import { formatClockTime, formatDayLabel } from '@/lib/time';
import { findPersona } from './personas';
import { lessonsForStudent } from './schedule';
import type { SubjectId } from './subjects';
import { SUBJECTS } from './subjects';

/**
 * DEMO ONLY (Phase 1, WP-8). Computes which AI-lesson start times the booking wizard
 * offers, from synthetic data. Nothing is stored and nothing is booked.
 *
 * Rules applied, all owner-approved:
 * - AI is available at any time except blocked periods and the child's existing lessons (OC-05).
 * - Lessons are 15 or 30 minutes and start on 15-minute boundaries; one AI lesson at a
 *   time per child, so a time that overlaps another lesson is not offered (OC-22).
 *
 * Rules NOT applied because they are undecided: daily limits and minimum lead time (D-05).
 * The real slot engine, with server-side conflict checks, is Phase 3.
 */

export const AI_LESSON_LENGTHS = [15, 30] as const;
export type AiLessonLength = (typeof AI_LESSON_LENGTHS)[number];
export const SLOT_STEP_MINUTES = 15;
/** Days offered in the wizard: today and the next four (board 7 shows five days). */
export const BOOKING_DAYS = 5;

/** Wall-clock window the wizard lists. Times outside it fall inside the family quiet time. */
const FIRST_SLOT = { hour: 7, minute: 0 };
const LAST_SLOT = { hour: 20, minute: 45 };

export type SlotStatus = 'open' | 'lesson' | 'quiet';
export type DayPart = 'morning' | 'afternoon' | 'evening';

export interface Slot {
  startIso: string;
  label: string;
  part: DayPart;
  /** Status for each lesson length: a 30-minute lesson may clash where a 15-minute one fits. */
  status: Record<AiLessonLength, SlotStatus>;
}

export interface BookingDay {
  key: string;
  label: string;
  slots: Slot[];
}

interface Period {
  startIso: string;
  endIso: string;
  kind: 'lesson' | 'quiet';
}

/** Chapters come only from books a parent or teacher shared (FRD §7). Sample titles only. */
const CHAPTERS: Record<string, Partial<Record<SubjectId, string[]>>> = {
  'demo-student-kiran': {
    maths: ['Chapter 6 — Maths practice book (sample)', 'Chapter 7 — Maths practice book (sample)'],
    science: ['Chapter 2 — Science notes (sample)'],
  },
  'demo-student-meera': {
    english: ['Chapter 2 — English reader (sample)'],
  },
};

export function chaptersFor(studentId: string, subject: SubjectId): string[] {
  return CHAPTERS[studentId]?.[subject] ?? [];
}

export function isAiLessonLength(value: number): value is AiLessonLength {
  return (AI_LESSON_LENGTHS as readonly number[]).includes(value);
}

/** Synthetic blocked period set by the parent: 20:00–07:00 every night ("family quiet time"). */
function quietPeriods(timeZone: string, now: Date): Period[] {
  const periods: Period[] = [];
  for (let day = -1; day <= BOOKING_DAYS; day += 1) {
    periods.push({
      startIso: localDayAt(day, 20, 0, timeZone, now),
      endIso: localDayAt(day + 1, 7, 0, timeZone, now),
      kind: 'quiet',
    });
  }
  return periods;
}

function lessonPeriods(studentId: string, now: Date): Period[] {
  // Every lesson of this child on any day, including a teacher-proposed one (D-08 pending).
  return lessonsForStudent(studentId, now).map((l) => ({
    startIso: l.startIso,
    endIso: l.endIso,
    kind: 'lesson' as const,
  }));
}

function overlaps(aStart: number, aEnd: number, b: Period): boolean {
  return aStart < Date.parse(b.endIso) && Date.parse(b.startIso) < aEnd;
}

function statusFor(startIso: string, length: AiLessonLength, periods: Period[]): SlotStatus {
  const start = Date.parse(startIso);
  const end = start + length * 60_000;
  const clashes = periods.filter((p) => overlaps(start, end, p));
  if (clashes.some((p) => p.kind === 'lesson')) return 'lesson';
  if (clashes.some((p) => p.kind === 'quiet')) return 'quiet';
  return 'open';
}

function partOfDay(hour: number): DayPart {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Start times for the next BOOKING_DAYS days, in the student's own time zone (FR-019). */
export function bookingDays(studentId: string, now: Date = clockNow()): BookingDay[] {
  const persona = findPersona(studentId);
  if (!persona || persona.role !== 'student') return [];
  const tz = persona.timeZone;
  const periods = [...quietPeriods(tz, now), ...lessonPeriods(studentId, now)];
  const days: BookingDay[] = [];
  for (let day = 0; day < BOOKING_DAYS; day += 1) {
    const slots: Slot[] = [];
    for (let h = FIRST_SLOT.hour; h <= LAST_SLOT.hour; h += 1) {
      for (let m = 0; m < 60; m += SLOT_STEP_MINUTES) {
        if (h === LAST_SLOT.hour && m > LAST_SLOT.minute) continue;
        const startIso = localDayAt(day, h, m, tz, now);
        // Times that have already started are not offered.
        if (Date.parse(startIso) <= now.getTime()) continue;
        slots.push({
          startIso,
          label: formatClockTime(startIso, { timeZone: tz }),
          part: partOfDay(h),
          status: { 15: statusFor(startIso, 15, periods), 30: statusFor(startIso, 30, periods) },
        });
      }
    }
    const anchor = localDayAt(day, 12, 0, tz, now);
    days.push({
      key: anchor.slice(0, 10),
      label: day === 0 ? 'Today' : formatDayLabel(anchor, { timeZone: tz }),
      slots,
    });
  }
  return days;
}

export interface DemoBookingRequest {
  subject?: string;
  chapter?: string;
  start?: string;
  length?: string;
}

export interface DemoBooking {
  subject: SubjectId;
  subjectName: string;
  chapter: string | null;
  startIso: string;
  length: AiLessonLength;
  dayLabel: string;
  timeLabel: string;
}

export type DemoBookingResult =
  { ok: true; booking: DemoBooking } | { ok: false; reason: 'not-open'; subjectName?: string };

/**
 * Server-side re-check of a wizard choice (mirrors FR-006.2 for the demo). The student id
 * always comes from the session. Every field from the URL is validated; anything that is not
 * an open time for this child gets the "not an open time" outcome, with no rule details (R-08).
 */
export function checkDemoBooking(
  studentId: string,
  req: DemoBookingRequest,
  now: Date = clockNow(),
): DemoBookingResult {
  const persona = findPersona(studentId);
  if (!persona || persona.role !== 'student') return { ok: false, reason: 'not-open' };
  const subject = (persona.subjects ?? []).find((s) => s === req.subject);
  const length = Number(req.length);
  if (!subject || !isAiLessonLength(length) || !req.start) return { ok: false, reason: 'not-open' };
  const chapter = req.chapter ? req.chapter : null;
  if (chapter && !chaptersFor(studentId, subject).includes(chapter)) return { ok: false, reason: 'not-open' };

  const startMs = Date.parse(req.start);
  if (Number.isNaN(startMs)) return { ok: false, reason: 'not-open' };
  const startIso = new Date(startMs).toISOString();
  const slot = bookingDays(studentId, now)
    .flatMap((d) => d.slots.map((s) => ({ ...s, dayLabel: d.label })))
    .find((s) => s.startIso === startIso);
  if (!slot || slot.status[length] !== 'open') {
    return { ok: false, reason: 'not-open', subjectName: SUBJECTS[subject].name };
  }
  return {
    ok: true,
    booking: {
      subject,
      subjectName: SUBJECTS[subject].name,
      chapter,
      startIso,
      length,
      dayLabel: slot.dayLabel,
      timeLabel: slot.label,
    },
  };
}

/** Up to three open alternatives after a given time, for the "time just taken" outcome (M-17). */
export function nextOpenTimes(studentId: string, afterIso: string, length: AiLessonLength, now = clockNow()) {
  const after = Date.parse(afterIso);
  return bookingDays(studentId, now)
    .flatMap((d) => d.slots)
    .filter((s) => Date.parse(s.startIso) > after && s.status[length] === 'open')
    .slice(0, 3);
}
