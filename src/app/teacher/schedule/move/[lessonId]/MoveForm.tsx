'use client';

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { type PlannableOption, PlannedChapterPicker } from '@/components/lessons/PlannedChapterPicker';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { type ProposalReviewView, proposeMoveAction, reviewMoveAction, type ScheduleState } from '../../actions';

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
  const form = useRef<HTMLFormElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  // DEF-TL4-09 (PO 3 Nov 2026): the TL-3 review step, reused. The review belongs to the send state it
  // was made under: a refused send (for example a changed price) needs a fresh review.
  const [reviewed, setReviewed] = useState<{ view: ProposalReviewView; under: ScheduleState } | null>(null);
  const review = reviewed && reviewed.under === state ? reviewed.view : null;
  const setReview = (view: ProposalReviewView | null) => setReviewed(view ? { view, under: state } : null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  function check() {
    const f = form.current;
    if (!f || !f.reportValidity()) return;
    const fd = new FormData(f);
    startChecking(async () => {
      const r = await reviewMoveAction(fd);
      setReviewError(r.error ?? null);
      setReview(r.review ?? null);
    });
  }
  return (
    <form
      ref={form}
      onChange={() => {
        setReview(null);
        setReviewError(null);
      }}
      // DEF-TL4-14: submitted without the form `action` prop, so React does not reset the fields after
      // a refusal. A reset left the chosen chapters unticked while the picker still counted them, so a
      // second "Send" could go without the chapters the teacher could see as chosen.
      onSubmit={(e) => {
        e.preventDefault();
        // DEF-TL4-09: a move is always reviewed first (Enter in a field opens the review too).
        if (!review) {
          check();
          return;
        }
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="flex flex-col gap-5"
      data-testid="move-form"
    >
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
      {review ? (
        <section
          aria-labelledby="move-review-heading"
          className="flex flex-col gap-4 rounded-[18px] border-2 border-primary p-4 sm:p-5"
          data-testid="move-review"
        >
          <h3
            id="move-review-heading"
            ref={reviewHeading}
            tabIndex={-1}
            className="m-0 text-[19px] font-bold leading-[26px]"
          >
            Check the new time
          </h3>
          <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-[15px] leading-[22px] sm:grid-cols-[max-content_1fr]">
            <dt className="font-bold">For</dt>
            <dd className="m-0">{review.forWhom}</dd>
            <dt className="font-bold">Booked now</dt>
            <dd className="m-0">
              {review.now} <span className="text-on-surface-variant">(your time zone)</span>
            </dd>
            <dt className="font-bold">New time</dt>
            <dd className="m-0">
              {review.when} <span className="text-on-surface-variant">(your time zone)</span>
            </dd>
            <dt className="font-bold">New price</dt>
            <dd className="m-0">
              {review.price} <span className="text-on-surface-variant">(information only)</span>
            </dd>
            <dt className="font-bold">Chapters</dt>
            <dd className="m-0 break-words">
              {review.planned.length ? review.planned.join('; ') : 'The lesson’s own chapters move with it'}
            </dd>
          </dl>
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            Nothing changes until one of {childName}’s parents accepts. Until then the lesson stays booked at its
            current time.
          </p>
          <input type="hidden" name="priceBasis" value={review.priceBasis} />
          <input type="hidden" name="priceMinor" value={review.priceMinor} />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" inactive={pending}>
              {pending ? 'Sending…' : 'Send new time'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setReview(null)}>
              Change details
            </Button>
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {reviewError ? <FormMessage tone="error">{reviewError}</FormMessage> : null}
          <div>
            <Button type="button" inactive={checking} onClick={check}>
              {checking ? 'Checking…' : 'Review new time'}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
