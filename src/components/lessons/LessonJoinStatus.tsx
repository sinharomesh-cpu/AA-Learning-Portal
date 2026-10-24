'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, buttonClasses } from '@/components/Button';
import { formatClock } from '@/lib/lessonDisplay';
import { JOIN_OPENS_MINUTES_BEFORE, joinState } from '@/lib/lessonRules';

const MINUTE = 60_000;
/** How often the state is re-checked while the page is open. */
export const JOIN_STATUS_REFRESH_MS = 30_000;
/** From this long before the start until the end, each re-check also refreshes the page's server data. */
export const REFRESH_FROM_MINUTES = 15;
/** What Join Class tells everyone before it opens Zoom (CR-17 §2.4.5). */
export const JOIN_NOTE = 'Opens Zoom — a meeting run by your teacher, not by AA Pro. Not recorded.';
const NOT_READY = 'Your teacher’s class link isn’t ready yet';

/**
 * The words on an unavailable Join control for one moment (OC-44): the time Join opens, then
 * `waiting` during the window when Join can't open yet, then "Lesson ended".
 */
export function joinStatusText(
  startIso: string,
  endIso: string,
  now: Date,
  timeZone: string,
  waiting: string = NOT_READY,
): string {
  const state = joinState(startIso, endIso, now);
  if (state === 'ended') return 'Lesson ended';
  if (state === 'open') return waiting;
  const opens = new Date(Date.parse(startIso) - JOIN_OPENS_MINUTES_BEFORE * MINUTE);
  const left = Math.ceil((opens.getTime() - now.getTime()) / MINUTE);
  return left <= 60
    ? `Join opens at ${formatClock(opens, timeZone)} · in ${left} min`
    : `Join opens at ${formatClock(opens, timeZone)}`;
}

/**
 * Join for a real Human Teacher lesson (CR-17 PR 2 U1; PR 3). Before the window: the time Join
 * opens (with minutes left in the last hour). In the window: "Join Class" when the lesson is
 * ready (a parent allows the teacher's meeting links and the teacher added one), otherwise the
 * `waiting` words, still unavailable. After the end: "Lesson ended". Join Class goes to AA Pro's
 * own address, which checks everything again on the server and only then opens Zoom; the meeting
 * link itself is never in the page. Re-checked every 30 seconds while the page is open, with a
 * quiet announcement for screen readers when the state changes. The demo keeps JoinButton.
 */
export function LessonJoinStatus({
  startIso,
  endIso,
  nowIso,
  timeZone,
  lessonId,
  ready = false,
  waiting = NOT_READY,
  size = 'child',
  label,
}: {
  startIso: string;
  endIso: string;
  /** The server's time when the page was made, so the first render matches. */
  nowIso: string;
  timeZone: string;
  /** Needed for Join Class; without it Join never opens (PR 2 behaviour). */
  lessonId?: string;
  ready?: boolean;
  /** What an unavailable Join says during the window. */
  waiting?: string;
  size?: 'child' | 'md';
  /** Names the lesson for screen readers when a page lists several. */
  label?: string;
}) {
  const [now, setNow] = useState(() => new Date(nowIso));
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      const t = new Date();
      setNow(t);
      // Near and during the lesson, re-read the page's data from the server too, so a link the
      // teacher just saved, or a permission a parent just gave or stopped, shows without a reload.
      const near =
        t.getTime() >= Date.parse(startIso) - REFRESH_FROM_MINUTES * MINUTE && t.getTime() < Date.parse(endIso);
      if (lessonId && near && document.visibilityState === 'visible') router.refresh();
    }, JOIN_STATUS_REFRESH_MS);
    return () => clearInterval(id);
  }, [router, lessonId, startIso, endIso]);
  const state = joinState(startIso, endIso, now);
  const live = state === 'open' && ready && lessonId;
  return (
    <>
      {live ? (
        <span className="flex flex-col gap-1.5 md:items-end">
          <a
            href={`/lessons/${lessonId}/join`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label ? `Join Class: ${label}` : undefined}
            className={buttonClasses({ size })}
          >
            Join Class
          </a>
          <span className="max-w-[320px] text-sm leading-5 text-on-surface-variant">{JOIN_NOTE}</span>
        </span>
      ) : (
        <Button
          size={size}
          inactive
          aria-label={label ? `${joinStatusText(startIso, endIso, now, timeZone, waiting)}: ${label}` : undefined}
        >
          {joinStatusText(startIso, endIso, now, timeZone, waiting)}
        </Button>
      )}
      <p className="sr-only" aria-live="polite">
        {state === 'open'
          ? live
            ? 'Join Class is open.'
            : 'Your lesson’s join time has started.'
          : state === 'ended'
            ? 'Your lesson has ended.'
            : ''}
      </p>
    </>
  );
}
