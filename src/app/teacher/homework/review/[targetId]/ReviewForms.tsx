'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { QUESTION_TYPE_LABEL } from '@/lib/worksheetQuestions';
import type { ReviewDetail } from '@/server/assignments';
import { changeDatesAction, releaseAction, type ReviewState, saveReviewAction, withdrawAction } from '../../actions';

const AREA = cx(INPUT, 'min-h-24 py-3');
const SMALL = cx(INPUT.replace('w-full', ''), 'min-h-11 w-24');

function Result({ state }: { state: ReviewState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.notice) return <FormMessage tone="success">{state.notice}</FormMessage>;
  return null;
}

/** HW4: marks per question (automatic marks can be overridden), feedback, outcome. */
export function MarkingForm({ detail }: { detail: ReviewDetail }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(saveReviewAction, {});
  const [revising, setRevising] = useState(false);
  const uid = useId();
  const locked = detail.status === 'reviewed' && detail.released;
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="targetId" value={detail.targetId} />
      <input type="hidden" name="count" value={detail.questions.length} />
      <Result state={state} />
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {detail.questions.map((q) => (
          <li
            key={q.index}
            className="flex flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-lowest p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-on-surface-variant">
                Question {q.index + 1} · {QUESTION_TYPE_LABEL[q.type]} · {q.points} {q.points === 1 ? 'mark' : 'marks'}
              </span>
              {q.autoPoints !== null ? (
                <span className="rounded-full border border-success-border bg-success-container px-3 py-1 text-xs font-bold text-on-success-container">
                  Automatic: {q.autoPoints}
                </span>
              ) : (
                <span className="rounded-full border border-warning-border bg-warning-container px-3 py-1 text-xs font-bold text-on-warning-container">
                  You mark this
                </span>
              )}
            </div>
            <p className="m-0 whitespace-pre-line text-[17px] leading-7">{q.prompt}</p>
            <div className="rounded-[16px] bg-surface-container-low px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-[.06em] text-on-surface-variant">Answer</span>
              <p className="m-0 whitespace-pre-line text-[16px] leading-6">{q.answerText}</p>
            </div>
            {q.correct ? <p className="m-0 text-sm leading-5 text-on-surface-variant">Your key: {q.correct}</p> : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-m${q.index}`} className="text-sm font-bold">
                  {q.autoPoints === null ? 'Marks' : 'Change the mark (optional)'}
                </label>
                <input
                  id={`${uid}-m${q.index}`}
                  name={`mark-${q.index}`}
                  inputMode="decimal"
                  defaultValue={q.teacherPoints ?? ''}
                  disabled={locked}
                  className={SMALL}
                />
              </div>
              <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
                <label htmlFor={`${uid}-c${q.index}`} className="text-sm font-bold">
                  Comment (optional)
                </label>
                <input
                  id={`${uid}-c${q.index}`}
                  name={`comment-${q.index}`}
                  maxLength={1000}
                  defaultValue={q.comment ?? ''}
                  disabled={locked}
                  className={cx(INPUT, 'min-h-11')}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-fb`} className="text-sm font-bold">
          Feedback for the student (optional)
        </label>
        <textarea
          id={`${uid}-fb`}
          name="feedback"
          maxLength={4000}
          defaultValue={detail.feedback ?? ''}
          disabled={locked}
          className={AREA}
        />
        <span className="text-[13px] text-on-surface-variant">
          Typed feedback only, up to 4,000 characters. Shown after you release.
        </span>
      </div>
      {revising ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-note`} className="text-sm font-bold">
            What should they change?
          </label>
          <textarea id={`${uid}-note`} name="note" maxLength={500} required className={AREA} />
        </div>
      ) : null}
      {locked ? (
        <FormMessage tone="info">Released: these marks can no longer be changed here.</FormMessage>
      ) : (
        <div className="flex flex-wrap gap-3">
          {revising ? (
            <>
              <Button type="submit" name="intent" value="revision" inactive={pending}>
                Send back for a revision
              </Button>
              <Button variant="secondary" onClick={() => setRevising(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button type="submit" name="intent" value="release" inactive={pending}>
                Save and release
              </Button>
              <Button type="submit" name="intent" value="reviewed" variant="secondary" inactive={pending}>
                Save as reviewed
              </Button>
              <Button variant="secondary" onClick={() => setRevising(true)}>
                Ask for a revision
              </Button>
            </>
          )}
        </div>
      )}
    </form>
  );
}

export function ReleaseButton({ targetId }: { targetId: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(releaseAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="targetId" value={targetId} />
      <Result state={state} />
      <div>
        <Button type="submit" inactive={pending}>
          Release marks
        </Button>
      </div>
    </form>
  );
}

export function WithdrawButton({ assignmentId, title }: { assignmentId: string; title: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(withdrawAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Result state={state} />
      <div>
        <Button variant="danger" inactive={pending} onClick={() => setOpen(true)}>
          Withdraw
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title={`Withdraw “${title}”?`}
        confirmLabel="Withdraw"
        cancelLabel="Keep it"
        tone="danger"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        It stops being due. The student keeps it as history, with any answers already saved.
      </ConfirmDialog>
    </form>
  );
}

/** W-10: change the dates of work the student can't see yet. */
export function ChangeDatesForm({ assignmentId, today }: { assignmentId: string; today: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(changeDatesAction, {});
  const uid = useId();
  const FIELD = cx(INPUT, 'min-h-12');
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-v`} className="text-sm font-bold">
            New assignment date
          </label>
          <input id={`${uid}-v`} name="visibleOn" type="date" min={today} required className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-d`} className="text-sm font-bold">
            Due date (optional)
          </label>
          <input id={`${uid}-d`} name="dueOn" type="date" min={today} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-t`} className="text-sm font-bold">
            Due time
          </label>
          <input id={`${uid}-t`} name="dueTime" type="time" defaultValue="18:00" className={FIELD} />
        </div>
      </div>
      <div>
        <Button type="submit" variant="secondary" inactive={pending}>
          Change dates
        </Button>
      </div>
    </form>
  );
}
