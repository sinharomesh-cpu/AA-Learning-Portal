'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { type PlannableOption, PlannedChapterPicker } from '@/components/lessons/PlannedChapterPicker';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { proposeLessonAction, type ScheduleState } from '../schedule/actions';

/**
 * TL-3 "Schedule a class", step 2: the day and time in the teacher's own time zone (any 5-minute
 * start, 24 hours to 4 weeks ahead, not limited to usual times: D-TLS-3), the length (10-40 minutes
 * in 5-minute steps) and optional planned chapters (D-E2E-2, WF-10). No free-text message (TL3-2).
 * The server and the database check everything again.
 */
export function ProposeForm({
  childId,
  subject,
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
  childId: string;
  subject: string;
  childName: string;
  subjectName: string;
  /** YYYY-MM-DD bounds in the teacher's time zone. */
  firstDate: string;
  lastDate: string;
  lengths: number[];
  defaultMinutes: number;
  chapters: PlannableOption[];
  /** "India Standard Time, Asia/Kolkata". */
  zone: string;
  /** Readiness §3.2 step 2: confirmed lessons shown as busy, already formatted in the teacher's zone. */
  busy: Array<{ when: string; whose: 'you' | 'child' }>;
}) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(proposeLessonAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" data-testid="propose-form">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="subject" value={subject} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="propose-date" className="text-[15px] font-bold">
            Day
          </label>
          <input
            id="propose-date"
            name="date"
            type="date"
            required
            min={firstDate}
            max={lastDate}
            className={cx(INPUT, 'min-h-12 w-auto')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="propose-time" className="text-[15px] font-bold">
            Start time
          </label>
          <input
            id="propose-time"
            name="time"
            type="time"
            required
            step={300}
            aria-describedby="propose-time-help"
            className={cx(INPUT, 'min-h-12 w-auto')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="propose-length" className="text-[15px] font-bold">
            Length
          </label>
          <select
            id="propose-length"
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
      <p id="propose-time-help" className="m-0 text-sm leading-5 text-on-surface-variant">
        In your time zone ({zone}). Any start on a 5-minute step, at least 24 hours and up to 4 weeks ahead. It doesn’t
        have to be inside your usual times, but it can’t overlap a confirmed lesson of yours or of {childName}.
      </p>
      <div className="flex flex-col gap-1.5" data-testid="busy-times">
        <p id="busy-heading" className="m-0 text-[15px] font-bold">
          Busy in the next 4 weeks
        </p>
        {busy.length ? (
          <ul aria-labelledby="busy-heading" className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-sm leading-5">
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
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby="material-help">
        <legend className="mb-1 text-[15px] font-bold">Ask the parent for material (optional)</legend>
        <p id="material-help" className="m-0 text-sm leading-5 text-on-surface-variant">
          Sent with the proposal. The parent can share a book or chapter you can already view, or say it isn’t
          available.
        </p>
        <label htmlFor="material-description" className="text-sm font-bold">
          What do you need?
        </label>
        <input
          id="material-description"
          name="materialDescription"
          maxLength={200}
          placeholder="For example: the workbook pages on fractions"
          className={cx(INPUT, 'min-h-12')}
        />
        <label htmlFor="material-note" className="text-sm font-bold">
          Note for the parent (optional)
        </label>
        <textarea id="material-note" name="materialNote" maxLength={300} rows={2} className={cx(INPUT, 'py-2')} />
      </fieldset>
      <p className="m-0 rounded-[18px] bg-surface-container-low px-4 py-3 text-[15px] leading-[22px]">
        {childName}’s parents are asked to accept or decline. Nothing is booked, and no meeting link can be added, until
        one of them accepts. They have 48 hours to answer (less when the lesson is sooner). The price is your listed or
        agreed rate, as for a request, shown to the family for information: AA Pro takes no payment.
      </p>
      <div>
        <Button type="submit" inactive={pending}>
          {pending ? 'Sending…' : 'Send proposal'}
        </Button>
      </div>
    </form>
  );
}
