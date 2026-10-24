import { describe, expect, it } from 'vitest';
import {
  answerProposal,
  holdsTime,
  joinState,
  LESSON_RULES_TEXT,
  lessonChange,
  MAX_STUDENTS_PER_LESSON,
  mayCreateMeeting,
  REAL_LESSON_RULES_TEXT,
} from './lessonRules';

const START = '2026-10-20T10:00:00.000Z';
const END = '2026-10-20T10:40:00.000Z';
const at = (minutesFromStart: number) => new Date(Date.parse(START) + minutesFromStart * 60_000);

describe('OC-44 (D-35): Join window', () => {
  it('opens exactly 10 minutes before the start and stays open until the end', () => {
    expect(joinState(START, END, at(-10.01))).toBe('not_yet');
    expect(joinState(START, END, at(-10))).toBe('open');
    expect(joinState(START, END, at(39.99))).toBe('open');
    expect(joinState(START, END, at(40))).toBe('ended');
  });
});

describe('OC-45 (D-08): teacher-proposed lessons', () => {
  it('only the parent’s acceptance books the lesson; rejection declines it', () => {
    expect(answerProposal('proposed', 'accept')).toBe('confirmed');
    expect(answerProposal('proposed', 'reject')).toBe('declined');
    expect(answerProposal('confirmed', 'reject')).toBeNull();
  });

  it('a proposal holds no time and gets no Zoom meeting', () => {
    expect(holdsTime('proposed')).toBe(false);
    expect(mayCreateMeeting('human', 'proposed')).toBe(false);
    expect(holdsTime('confirmed')).toBe(true);
    expect(mayCreateMeeting('human', 'confirmed')).toBe(true);
    expect(mayCreateMeeting('ai', 'booked')).toBe(false);
  });
});

describe('OC-46 (D-07): cancel and reschedule', () => {
  it('teacher lessons: parent or teacher up to 30 minutes before; not inside 30 minutes', () => {
    for (const actor of ['parent', 'teacher'] as const) {
      for (const action of ['cancel', 'reschedule'] as const) {
        expect(lessonChange('human', actor, action, START, at(-30)).allowed).toBe(true);
        expect(lessonChange('human', actor, action, START, at(-29.99))).toEqual({ allowed: false, reason: 'too_late' });
        expect(lessonChange('human', actor, action, START, at(0))).toEqual({ allowed: false, reason: 'started' });
      }
    }
  });

  it('a teacher’s reschedule needs the parent’s approval; a teacher’s cancellation notifies the parent', () => {
    expect(lessonChange('human', 'teacher', 'reschedule', START, at(-60))).toEqual({
      allowed: true,
      needsParentApproval: true,
      notifyParent: false,
    });
    expect(lessonChange('human', 'teacher', 'cancel', START, at(-60))).toEqual({
      allowed: true,
      needsParentApproval: false,
      notifyParent: true,
    });
    expect(lessonChange('human', 'parent', 'reschedule', START, at(-60))).toMatchObject({ needsParentApproval: false });
  });

  it('students never cancel or move teacher lessons', () => {
    expect(lessonChange('human', 'student', 'cancel', START, at(-120))).toEqual({
      allowed: false,
      reason: 'not_permitted',
    });
  });

  it('AI lessons: parent or student any time before the start; never a teacher', () => {
    expect(lessonChange('ai', 'student', 'cancel', START, at(-1)).allowed).toBe(true);
    expect(lessonChange('ai', 'parent', 'reschedule', START, at(-0.01)).allowed).toBe(true);
    expect(lessonChange('ai', 'student', 'cancel', START, at(0))).toEqual({ allowed: false, reason: 'started' });
    expect(lessonChange('ai', 'teacher', 'cancel', START, at(-60))).toEqual({
      allowed: false,
      reason: 'not_permitted',
    });
  });
});

describe('OC-47 (D-15): 1:1 only', () => {
  it('one student per lesson', () => {
    expect(MAX_STUDENTS_PER_LESSON).toBe(1);
  });
});

describe('Lesson-rules wording (CR-17 PR 2: B1, B2)', () => {
  it('real accounts: teacher-lesson lines never offer moving, proposals or reminders', () => {
    const teacherLines = [
      REAL_LESSON_RULES_TEXT.parentTeacherChanges,
      REAL_LESSON_RULES_TEXT.teacherChanges,
      REAL_LESSON_RULES_TEXT.teacherJoin,
      REAL_LESSON_RULES_TEXT.join,
      REAL_LESSON_RULES_TEXT.oneToOne,
    ];
    for (const t of teacherLines) {
      expect(t).not.toMatch(/\bmov(e|ed|ing)\b|propos|email|remind/i);
    }
    expect(REAL_LESSON_RULES_TEXT.parentTeacherChanges).toContain('up to 30 minutes before the start');
    expect(REAL_LESSON_RULES_TEXT.parentTeacherChanges).toContain('cancel and request a new one');
    // AI lessons keep their own approved rule (OC-46 (3)), named as AI Tutor lessons.
    expect(REAL_LESSON_RULES_TEXT.parentAiChanges).toMatch(/^AI Tutor lessons: .*any time before the start\.$/);
    // B2: says plainly that no reminder is sent.
    expect(REAL_LESSON_RULES_TEXT.noReminders).toBe(
      'Lesson reminders aren’t sent yet. Please note lesson times yourself.',
    );
  });

  it('the demo wording is unchanged', () => {
    expect(LESSON_RULES_TEXT).toEqual({
      join: 'Join opens 10 minutes before the start and stays open until the lesson ends.',
      teacherProposal:
        'A lesson a teacher proposes is only booked when the parent accepts it. No Zoom meeting until then.',
      teacherChanges:
        'Teacher lessons can be cancelled or moved up to 30 minutes before the start. A teacher’s move needs the parent’s OK, and the parent is told if a teacher cancels.',
      aiChanges: 'AI lessons can be cancelled or moved any time before the start.',
      oneToOne: 'All lessons are 1:1.',
    });
  });
});
