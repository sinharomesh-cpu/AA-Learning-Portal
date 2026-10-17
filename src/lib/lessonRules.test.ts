import { describe, expect, it } from 'vitest';
import {
  answerProposal,
  holdsTime,
  joinState,
  lessonChange,
  MAX_STUDENTS_PER_LESSON,
  mayCreateMeeting,
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
