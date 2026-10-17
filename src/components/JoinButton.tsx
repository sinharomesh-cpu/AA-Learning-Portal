import { JOIN_OPENS_MINUTES_BEFORE, joinState } from '@/lib/lessonRules';
import { Button } from './Button';

interface JoinButtonProps {
  className?: string;
  /** Who sees it: teachers "Start", children and parents "Join". */
  who?: 'student' | 'teacher';
  size?: 'md' | 'child';
  /** The lesson times. With them, the button says where in the join window (OC-44) it is. */
  lesson?: { startIso: string; endIso: string; nowIso: string };
}

/**
 * CMP-JoinButton. The join window is OC-44 (D-35): opens 10 minutes before the start, stays
 * until the end. Zoom is not connected (Phase 7; blocked until the owner approves a budget,
 * OC-91), so there is never a meeting link and the button stays unavailable, saying why. It
 * never shows a meeting ID, passcode or link.
 */
export function JoinButton({ className, who = 'student', size = 'child', lesson }: JoinButtonProps) {
  const verb = who === 'teacher' ? 'Start' : 'Join';
  const state = lesson ? joinState(lesson.startIso, lesson.endIso, new Date(lesson.nowIso)) : 'not_yet';
  const label =
    state === 'ended'
      ? 'Lesson ended'
      : state === 'open'
        ? `${verb} — Zoom not connected yet`
        : `${verb} opens ${JOIN_OPENS_MINUTES_BEFORE} min before the start`;
  return (
    <Button size={size} inactive className={className}>
      {label}
    </Button>
  );
}
