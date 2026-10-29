'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { CHOICE_CARD, INPUT, OVERLAY_INPUT } from '@/components/ui/styles';
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

/** TL-1: one chapter the parent may name (from chaptersForRequest). */
export interface ChapterOption {
  id: string;
  label: string;
}

const MAX_CHAPTERS = 5;
const MAX_TOPIC = 120;

/**
 * Step 3 of Book a teacher: one start time, then "Send request" (CR-17 PR 2). TL-1 (D-TLS-6,
 * D-TLS-7): optionally, up to five chapters from the family's books shared with this child in this
 * subject, or one topic, never both. Choosing nothing sends exactly today's request.
 */
export function RequestForm({
  childId,
  teacherId,
  subject,
  minutes,
  dayName,
  options,
  summary,
  chapters,
  childName,
  subjectName,
}: {
  childId: string;
  teacherId: string;
  subject: string;
  minutes: number;
  dayName: string;
  options: TimeOption[];
  summary: string;
  chapters: ChapterOption[];
  childName: string;
  subjectName: string;
}) {
  const [state, action, pending] = useActionState<LessonFormState, FormData>(requestLessonAction, {});
  const [picked, setPicked] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const toggle = (id: string, on: boolean) =>
    setPicked((p) => (on ? (p.includes(id) ? p : [...p, id]) : p.filter((x) => x !== id)));
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
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" aria-describedby="cover-help">
        <legend className="mb-1 text-[17px] font-bold">What should the lesson cover? (optional)</legend>
        <p id="cover-help" className="m-0 text-sm leading-5 text-on-surface-variant">
          {chapters.length
            ? `Choose up to ${MAX_CHAPTERS} chapters from your books shared with ${childName} for ${subjectName}, or type a topic instead.`
            : `None of your published books for ${subjectName} is shared with ${childName} yet. You can type a topic instead.`}{' '}
          The teacher sees your choice with the request.
        </p>
        {chapters.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Chapters">
            {chapters.map((c) => {
              const on = picked.includes(c.id);
              const blocked = !on && (picked.length >= MAX_CHAPTERS || topic.trim() !== '');
              return (
                <li key={c.id}>
                  <label
                    className={`flex min-h-12 items-center gap-3 rounded-[16px] border border-card-border px-4 py-2 text-[15px] leading-[22px] ${
                      blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="chapter"
                      value={c.id}
                      checked={on}
                      disabled={blocked}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                      className="h-[22px] w-[22px] shrink-0 accent-primary"
                    />
                    <span className="break-words">{c.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lesson-topic" className="text-[15px] font-bold">
            {chapters.length ? 'Or a topic' : 'Topic'}
          </label>
          <input
            id="lesson-topic"
            name="topic"
            value={topic}
            disabled={picked.length > 0}
            // Not maxLength: browsers count UTF-16 units, so an emoji would count twice (TL-F7). This
            // stops at MAX_TOPIC characters, as the server and the database count them.
            onChange={(e) => setTopic([...e.target.value].slice(0, MAX_TOPIC).join(''))}
            placeholder="For example: fractions revision"
            className={`${INPUT} min-h-12`}
            aria-describedby="topic-help"
          />
          <span id="topic-help" className="text-sm leading-5 text-on-surface-variant">
            {picked.length > 0
              ? `${picked.length} of ${MAX_CHAPTERS} chapters chosen. Clear them to type a topic instead.`
              : `Up to ${MAX_TOPIC} characters.`}
          </span>
        </div>
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
