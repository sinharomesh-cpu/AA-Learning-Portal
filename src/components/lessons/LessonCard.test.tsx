import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LessonItem } from '@/server/lessons';
import { LessonCard } from './LessonCard';

/** TL-4: what the card says about where a moved lesson came from (DEF-TL4-15). Invented data. */
const TZ = 'Asia/Kolkata';
const ORIGINAL = new Date('2026-11-09T16:30:00.000Z'); // Mon 9 Nov, 10:00 pm IST
const START = new Date('2026-11-12T16:30:00.000Z');

function lesson(over: Partial<LessonItem>): LessonItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    teacherId: '00000000-0000-4000-8000-000000000002',
    teacherName: 'Ms Priya Rao',
    childId: '00000000-0000-4000-8000-000000000003',
    childName: 'Zara',
    grade: 5,
    subject: 'maths',
    startsAt: START,
    endsAt: new Date(START.getTime() + 30 * 60_000),
    minutes: 30,
    origin: 'teacher_proposal',
    status: 'confirmed',
    replyDeadline: new Date(START.getTime() - 2 * 3600_000),
    closedBy: null,
    closeReason: null,
    closeNote: null,
    movedFrom: ORIGINAL,
    movedFromLesson: null,
    movedTo: null,
    changePending: false,
    canMove: false,
    closedByYou: false,
    closedByName: null,
    outcome: null,
    price: null,
    canWithdraw: false,
    canCancel: false,
    canAnswer: false,
    needsOutcome: false,
    ended: false,
    kept: false,
    chapters: [],
    meeting: { allowed: false, added: false, setAt: null, joinOpen: false },
    ...over,
  };
}

const note = () => screen.getByTestId('move-note').textContent ?? '';

describe('LessonCard: "Moved from" only for a move that happened (DEF-TL4-15)', () => {
  it('an accepted move, and an accepted move later cancelled, say "Moved from …"', () => {
    const { unmount } = render(<LessonCard lesson={lesson({ status: 'confirmed' })} viewer="parent" timeZone={TZ} />);
    expect(note()).toMatch(/^Moved from Mon 9 Nov/);
    unmount();
    render(
      <LessonCard
        lesson={lesson({ status: 'cancelled', closedBy: 'parent', closedByYou: true })}
        viewer="parent"
        timeZone={TZ}
      />,
    );
    expect(note()).toMatch(/^Moved from Mon 9 Nov/);
  });

  it('a move closed without happening (original cancelled, declined, expired) never says "Moved from"', () => {
    for (const over of [
      { status: 'declined', closedBy: 'aa_pro', closeReason: 'original_cancelled' },
      { status: 'declined', closedBy: 'parent' },
      { status: 'expired', closedBy: 'aa_pro' },
      { status: 'withdrawn', closedBy: 'teacher' },
    ] as Array<Partial<LessonItem>>) {
      const { unmount } = render(<LessonCard lesson={lesson(over)} viewer="parent" timeZone={TZ} />);
      expect(note()).toMatch(/^A new time that was offered for the lesson booked on Mon 9 Nov/);
      expect(note()).not.toMatch(/Moved from/);
      unmount();
    }
  });
});
