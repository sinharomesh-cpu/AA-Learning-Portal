'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { CHOICE_CARD, OVERLAY_INPUT } from '@/components/ui/styles';
import { requestLessonAction, type LessonFormState } from '../calendar/actions';

export interface TimeOption {
  /** `${iso}|${priceMinor}|${currency}|${basis}`: the time and the price the parent is shown. */
  value: string;
  clock: string;
  /** The whole lesson's price, e.g. "₹250". */
  price: string;
  /** The hourly rate it comes from, e.g. "₹600". */
  rate: string;
  agreed: boolean;
}

/** Step 3 of Book a teacher: one start time, then "Send request" (CR-17 PR 2). */
export function RequestForm({
  childId,
  teacherId,
  subject,
  minutes,
  dayName,
  options,
  summary,
}: {
  childId: string;
  teacherId: string;
  subject: string;
  minutes: number;
  dayName: string;
  options: TimeOption[];
  summary: string;
}) {
  const [state, action, pending] = useActionState<LessonFormState, FormData>(requestLessonAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="teacherId" value={teacherId} />
      <input type="hidden" name="subject" value={subject} />
      <input type="hidden" name="minutes" value={minutes} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-3 text-[17px] font-bold">Start time on {dayName}</legend>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((o) => (
            <li key={o.value}>
              <label className={CHOICE_CARD}>
                <input type="radio" name="slot" value={o.value} required className={OVERLAY_INPUT} />
                <span className="flex flex-col gap-0.5">
                  <strong className="text-[17px]">{o.clock}</strong>
                  <span className="text-sm text-on-surface-variant">
                    {o.price} for {minutes} min
                    <br />
                    {o.agreed ? 'Agreed rate' : 'Listed rate'} {o.rate} an hour
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <p className="m-0 rounded-[18px] bg-surface-container-low px-4 py-3 text-[15px] leading-[22px]">{summary}</p>
      <div>
        <Button type="submit" inactive={pending}>
          {pending ? 'Sending…' : 'Send request'}
        </Button>
      </div>
    </form>
  );
}
