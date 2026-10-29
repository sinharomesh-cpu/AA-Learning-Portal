/**
 * Confirmed lesson rules (owner decisions OC-44 to OC-47, 14 Oct 2026). Shared by the screens
 * and, from Phase 3, by the booking server, so both apply the same rules. Safe in the browser.
 *
 * - OC-44 (D-35): Join for a teacher lesson opens 10 minutes before the start and stays
 *   available until the scheduled end.
 * - OC-45 (D-08): a teacher-proposed lesson needs the parent to accept or reject it; nothing is
 *   scheduled and no Zoom meeting is created until the parent accepts.
 * - OC-46 (D-07): teacher lessons can be cancelled or rescheduled by the parent or the teacher up
 *   to 30 minutes before the start, not inside 30 minutes; a teacher's reschedule needs the
 *   parent's approval; a teacher's cancellation is notified to the parent. AI lessons can be
 *   cancelled or moved by the parent or the student any time before the start.
 * - OC-47 (D-15): one student per lesson (1:1) in version 1.
 */
const MINUTE = 60_000;

export const JOIN_OPENS_MINUTES_BEFORE = 10;
export const CHANGE_CUTOFF_MINUTES = 30;
export const MAX_STUDENTS_PER_LESSON = 1;

export type JoinState = 'not_yet' | 'open' | 'ended';

/** OC-44: when the Join (or teacher's Start) button is available. */
export function joinState(startIso: string, endIso: string, now: Date): JoinState {
  const t = now.getTime();
  if (t < Date.parse(startIso) - JOIN_OPENS_MINUTES_BEFORE * MINUTE) return 'not_yet';
  if (t < Date.parse(endIso)) return 'open';
  return 'ended';
}

export type LessonKind = 'ai' | 'human';
export type ChangeActor = 'parent' | 'teacher' | 'student';
export type ChangeAction = 'cancel' | 'reschedule';

export type ChangeDecision =
  | {
      allowed: true;
      /** OC-46(2): a teacher's reschedule waits for the parent's approval. */
      needsParentApproval: boolean;
      /** OC-46(2): the parent is told when the teacher cancels. */
      notifyParent: boolean;
    }
  | { allowed: false; reason: 'not_permitted' | 'too_late' | 'started' };

/** OC-46: may this person cancel or reschedule this lesson now? Checked again on the server. */
export function lessonChange(
  kind: LessonKind,
  actor: ChangeActor,
  action: ChangeAction,
  startIso: string,
  now: Date,
): ChangeDecision {
  const start = Date.parse(startIso);
  const t = now.getTime();
  if (kind === 'ai') {
    // Parent or student, any time before the start. Teachers never manage AI lessons.
    if (actor === 'teacher') return { allowed: false, reason: 'not_permitted' };
    if (t >= start) return { allowed: false, reason: 'started' };
    return { allowed: true, needsParentApproval: false, notifyParent: false };
  }
  // Teacher lessons: parent or teacher only (students never manage teacher lessons).
  if (actor === 'student') return { allowed: false, reason: 'not_permitted' };
  if (t >= start) return { allowed: false, reason: 'started' };
  if (t > start - CHANGE_CUTOFF_MINUTES * MINUTE) return { allowed: false, reason: 'too_late' };
  return {
    allowed: true,
    needsParentApproval: actor === 'teacher' && action === 'reschedule',
    notifyParent: actor === 'teacher' && action === 'cancel',
  };
}

/** `requested`: a parent's request waiting for the teacher (CR-17 PR 2); it holds no time (D3A-4). */
export type LessonStatusName = 'proposed' | 'confirmed' | 'booked' | 'declined' | 'cancelled' | 'requested';

/**
 * OC-45: only a lesson the parent has accepted (or an AI lesson that is booked) holds the
 * child's time. A teacher's proposal is not scheduled, so it blocks nothing and has no Zoom
 * meeting.
 */
export function holdsTime(status: LessonStatusName): boolean {
  return status === 'confirmed' || status === 'booked';
}

/** OC-45: a Zoom meeting may be created only for an accepted teacher lesson. */
export function mayCreateMeeting(kind: LessonKind, status: LessonStatusName): boolean {
  return kind === 'human' && status === 'confirmed';
}

/** OC-45: the parent's answer to a teacher's proposal. */
export function answerProposal(status: LessonStatusName, answer: 'accept' | 'reject'): LessonStatusName | null {
  if (status !== 'proposed') return null;
  return answer === 'accept' ? 'confirmed' : 'declined';
}

/** Plain-language rules shown on screens (no "not decided yet" notes for these, OC-44–47). */
export const LESSON_RULES_TEXT = {
  join: 'Join opens 10 minutes before the start and stays open until the lesson ends.',
  teacherProposal: 'A lesson a teacher proposes is only booked when the parent accepts it. No Zoom meeting until then.',
  teacherChanges:
    'Teacher lessons can be cancelled or moved up to 30 minutes before the start. A teacher’s move needs the parent’s OK, and the parent is told if a teacher cancels.',
  aiChanges: 'AI lessons can be cancelled or moved any time before the start.',
  oneToOne: 'All lessons are 1:1.',
} as const;

/**
 * The same rules as worded for real accounts in Phase 3A (CR-17 PR 2; owner decisions B1 and B2,
 * 24 Oct 2026). Only what is available now: rescheduling a teacher lesson is cancel and request
 * again (D3A-6); teacher proposals (OC-45) are available from TL-3 (29 Oct 2026); lesson reminders are described as PR 7 really works (in-app, best-effort; no email). The demo keeps LESSON_RULES_TEXT unchanged.
 */
export const REAL_LESSON_RULES_TEXT = {
  parentTeacherChanges:
    'Teacher lessons: you or the teacher can cancel up to 30 minutes before the start. To change the time, cancel and request a new one.',
  parentAiChanges: 'AI Tutor lessons: you or your child can cancel or move them any time before the start.',
  join: LESSON_RULES_TEXT.join,
  // CR-17 PR 7 (D3A-10 Option A): best-effort, in-app only; the agreed tester guidance.
  reminders:
    'Lesson reminders appear in AA Pro 15 minutes before the start, only while AA Pro is open or when you come back before the lesson starts. Please note lesson times yourself.',
  teacherChanges:
    'You or the parent can cancel up to 30 minutes before the start; the family is told. To change the time, the parent cancels and requests a new one.',
  teacherJoin: LESSON_RULES_TEXT.join.replace('Join', 'Start'),
  // TL-3 (OC-45): real teacher proposals; no Zoom wording (links are the teacher's own, CR-17 PR 3).
  teacherProposal:
    'A lesson you schedule is only booked when a parent accepts it. A meeting link can be added once it is booked.',
  parentProposal:
    'When a teacher schedules a lesson for your child, either parent can accept or decline it. Nothing is booked until one of you accepts.',
  oneToOne: LESSON_RULES_TEXT.oneToOne,
} as const;
