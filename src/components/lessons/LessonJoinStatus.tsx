'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { formatClock } from '@/lib/lessonDisplay';
import { JOIN_OPENS_MINUTES_BEFORE, joinState } from '@/lib/lessonRules';

const MINUTE = 60_000;
/** How often the state is re-checked while the page is open. */
export const JOIN_STATUS_REFRESH_MS = 30_000;

/** The words on the child's Join control for one moment (OC-44). Never a link: Zoom comes with PR 3. */
export function joinStatusText(startIso: string, endIso: string, now: Date, timeZone: string): string {
  const state = joinState(startIso, endIso, now);
  if (state === 'ended') return 'Lesson ended';
  if (state === 'open') return 'Your teacher’s class link isn’t ready yet';
  const opens = new Date(Date.parse(startIso) - JOIN_OPENS_MINUTES_BEFORE * MINUTE);
  const left = Math.ceil((opens.getTime() - now.getTime()) / MINUTE);
  return left <= 60
    ? `Join opens at ${formatClock(opens, timeZone)} · in ${left} min`
    : `Join opens at ${formatClock(opens, timeZone)}`;
}

/**
 * The child's Join status for a real teacher lesson (CR-17 PR 2, U1): the time Join opens, then
 * "isn't ready yet" during the join window until PR 3 adds the teacher's Zoom link and its access
 * checks, then "Lesson ended". Always unavailable here, never a link. Re-checked every 30 seconds
 * while the page is open, with a quiet announcement for screen readers when the state changes.
 * The demo keeps the shared JoinButton.
 */
export function LessonJoinStatus({
  startIso,
  endIso,
  nowIso,
  timeZone,
}: {
  startIso: string;
  endIso: string;
  /** The server's time when the page was made, so the first render matches. */
  nowIso: string;
  timeZone: string;
}) {
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), JOIN_STATUS_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const state = joinState(startIso, endIso, now);
  return (
    <>
      <Button size="child" inactive>
        {joinStatusText(startIso, endIso, now, timeZone)}
      </Button>
      <p className="sr-only" aria-live="polite">
        {state === 'open' ? 'Your lesson’s join time has started.' : state === 'ended' ? 'Your lesson has ended.' : ''}
      </p>
    </>
  );
}
