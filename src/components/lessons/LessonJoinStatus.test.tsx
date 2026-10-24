import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOIN_NOTE, JOIN_STATUS_REFRESH_MS, joinStatusText, LessonJoinStatus } from './LessonJoinStatus';

/** CR-17 PR 2, U1: the child's Join status for a real teacher lesson (OC-44), with a controlled clock. */
const START = '2026-10-27T11:00:00.000Z'; // 4:30 pm IST
const END = '2026-10-27T11:25:00.000Z'; // 4:55 pm IST
const TZ = 'Asia/Kolkata';
const at = (minutesFromStart: number) => new Date(Date.parse(START) + minutesFromStart * 60_000);

describe('joinStatusText (OC-44: opens 10 minutes before, until the end)', () => {
  it('names the opening time, with minutes left in the last hour', () => {
    expect(joinStatusText(START, END, at(-24 * 60), TZ)).toBe('Join opens at 4:20 pm');
    expect(joinStatusText(START, END, at(-71), TZ)).toBe('Join opens at 4:20 pm');
    expect(joinStatusText(START, END, at(-70), TZ)).toBe('Join opens at 4:20 pm · in 60 min');
    expect(joinStatusText(START, END, at(-35), TZ)).toBe('Join opens at 4:20 pm · in 25 min');
    expect(joinStatusText(START, END, at(-10.5), TZ)).toBe('Join opens at 4:20 pm · in 1 min');
  });
  it('during the window it is still unavailable until PR 3; after the end it says so', () => {
    expect(joinStatusText(START, END, at(-10), TZ)).toBe('Your teacher’s class link isn’t ready yet');
    expect(joinStatusText(START, END, at(24.99), TZ)).toBe('Your teacher’s class link isn’t ready yet');
    expect(joinStatusText(START, END, at(25), TZ)).toBe('Lesson ended');
  });
});

describe('LessonJoinStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('changes on its own while the page is open, and is never a link or an available button', () => {
    vi.setSystemTime(at(-11));
    render(<LessonJoinStatus startIso={START} endIso={END} nowIso={at(-11).toISOString()} timeZone={TZ} />);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Join opens at 4:20 pm · in 1 min');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('link')).toBeNull();

    act(() => {
      vi.setSystemTime(at(-10));
      vi.advanceTimersByTime(JOIN_STATUS_REFRESH_MS);
    });
    expect(screen.getByRole('button')).toHaveTextContent('Your teacher’s class link isn’t ready yet');
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Your lesson’s join time has started.')).toHaveAttribute('aria-live', 'polite');

    act(() => {
      vi.setSystemTime(at(25));
      vi.advanceTimersByTime(JOIN_STATUS_REFRESH_MS);
    });
    expect(screen.getByRole('button')).toHaveTextContent('Lesson ended');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('LessonJoinStatus with a ready lesson (CR-17 PR 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('becomes “Join Class” (AA Pro’s own address, never the Zoom link) only inside the window', () => {
    vi.setSystemTime(at(-11));
    render(
      <LessonJoinStatus
        startIso={START}
        endIso={END}
        nowIso={at(-11).toISOString()}
        timeZone={TZ}
        lessonId="5b3c2c34-5a1b-4c3e-9a3e-2f1b0c9d8e7f"
        ready
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    act(() => {
      vi.setSystemTime(at(-10));
      vi.advanceTimersByTime(JOIN_STATUS_REFRESH_MS);
    });
    const link = screen.getByRole('link', { name: 'Join Class' });
    expect(link).toHaveAttribute('href', '/lessons/5b3c2c34-5a1b-4c3e-9a3e-2f1b0c9d8e7f/join');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(JOIN_NOTE)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('zoom.us');
    act(() => {
      vi.setSystemTime(at(25));
      vi.advanceTimersByTime(JOIN_STATUS_REFRESH_MS);
    });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button')).toHaveTextContent('Lesson ended');
  });

  it('a lesson that isn’t ready stays unavailable with the given words during the window', () => {
    vi.setSystemTime(at(-5));
    render(
      <LessonJoinStatus
        startIso={START}
        endIso={END}
        nowIso={at(-5).toISOString()}
        timeZone={TZ}
        lessonId="5b3c2c34-5a1b-4c3e-9a3e-2f1b0c9d8e7f"
        waiting="Allow the teacher’s links to join"
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button')).toHaveTextContent('Allow the teacher’s links to join');
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });
});
