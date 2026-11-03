'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { type PlannableOption, PlannedChapterPicker } from '@/components/lessons/PlannedChapterPicker';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { proposeMoveAction, type ScheduleState } from '../../actions';

/**
 * TL-4 "Move lesson" for the teacher: a new day and time in the teacher's own time zone (proposal
 * rules: any 5-minute start, 24 hours to 4 weeks ahead), the length, and optionally the teacher's own
 * planned chapters (Q-B: if none are chosen, the lesson's chapters move with it). The parents accept
 * or decline; until then the lesson stays booked. The server and the database check everything again.
 */
export function MoveForm({
  lessonId,
  childName,
  subjectName,
  firstDate,
  lastDate,
  lengths,
  defaultMinutes,
  chapters,
  zone,
  busy,
}: {
  lessonId: string;
  childName: string;
  subjectName: string;
  firstDate: string;
  lastDate: string;
  lengths: number[];
  defaultMinutes: number;
  chapters: PlannableOption[];
  zone: string;
  busy: Array<{ when: string; whose: 'you' | 'child' }>;
}) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(proposeMoveAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" data-testid="move-form">
      <input type="hidden" name="replacesLessonId" value={lessonId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="move-date" className="text-[15px] font-bold">
            New day
          </label>
          <input
            id="move-date"
            name="date"
            type="date"
            required
            min={firstDate}
            max={lastDate}
            className={cx(INPUT, 'min-h-12 w-auto')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="move-time" className="text-[15px] font-bold">
            New start time
          </label>
          <input
            id="move-time"
            name="time"
            type="time"
            required
            step={300}
            aria-describedby="move-time-help"
            className={cx(INPUT, 'min-h-12 w-auto')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="move-length" className="text-[15px] font-bold">
            Length
          </label>
          <select
            id="move-length"
            name="minutes"
            defaultValue={String(defaultMinutes)}
            className={cx(INPUT, 'min-h-12 w-auto min-w-40')}
          >
            {lengths.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </div>
      </div>
      <p id="move-time-help" className="m-0 text-sm leading-5 text-on-surface-variant">
        In your time zone ({zone}). Any start on a 5-minute step, at least 24 hours and up to 4 weeks from now. It can’t
        overlap a confirmed lesson of yours or of {childName}.
      </p>
      <div className="flex flex-col gap-1.5" data-testid="busy-times">
        <p id="move-busy-heading" className="m-0 text-[15px] font-bold">
          Busy in the next 4 weeks
        </p>
        {busy.length ? (
          <ul
            aria-labelledby="move-busy-heading"
            className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-sm leading-5"
          >
            {busy.map((b, i) => (
              <li key={i}>
                {b.when} · {b.whose === 'you' ? 'your lesson' : `${childName} has a lesson`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            No confirmed lessons for you or {childName} in the next 4 weeks.
          </p>
        )}
      </div>
      <PlannedChapterPicker chapters={chapters} max={5} childName={childName} subjectName={subjectName} />
      <p className="m-0 text-sm leading-5 text-on-surface-variant">
        If you don’t choose chapters, the lesson’s own chapters move with it. Open material requests move with it too.
      </p>
      <p className="m-0 rounded-[18px] bg-surface-container-low px-4 py-3 text-[15px] leading-[22px]">
        {childName}’s parents are asked to accept or decline the new time. Until one of them accepts, the lesson stays
        booked at its current time. They must answer within 48 hours, and at least 30 minutes before the lesson. The
        price for the new time is worked out as for any lesson and shown to them.
      </p>
      <div>
        <Button type="submit" inactive={pending}>
          {pending ? 'Sending…' : 'Send new time'}
        </Button>
      </div>
    </form>
  );
}
