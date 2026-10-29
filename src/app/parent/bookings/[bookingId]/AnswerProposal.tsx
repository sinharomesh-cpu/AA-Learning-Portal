'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { answerProposalAction, type LessonFormState } from '../../calendar/actions';

/**
 * TL3-5: Accept or Decline a teacher's proposal, each after a confirmation (an accessible dialog).
 * Accept repeats the time in the parent's own time zone; Decline takes an optional reason (up to
 * 200 characters) that the teacher sees on the lesson and that is never copied into a notice.
 */
export function AnswerProposal({ lessonId, summary }: { lessonId: string; summary: string }) {
  const [state, action, pending] = useActionState<LessonFormState, FormData>(answerProposalAction, {});
  const [open, setOpen] = useState<'accept' | 'decline' | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const answer = useRef<HTMLInputElement>(null);
  const formId = useId();
  const reasonId = useId();
  const submit = (a: 'accept' | 'decline') => {
    setOpen(null);
    if (answer.current) answer.current.value = a;
    form.current?.requestSubmit();
  };
  return (
    <form ref={form} id={formId} action={action} className="flex flex-col gap-3" data-testid="answer-proposal">
      <input type="hidden" name="lessonId" value={lessonId} />
      <input ref={answer} type="hidden" name="answer" value="accept" />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" inactive={pending} onClick={() => setOpen('accept')} aria-label={`Accept: ${summary}`}>
          Accept
        </Button>
        <Button
          type="button"
          variant="secondary"
          inactive={pending}
          onClick={() => setOpen('decline')}
          aria-label={`Decline: ${summary}`}
        >
          Decline
        </Button>
      </div>
      <ConfirmDialog
        open={open === 'accept'}
        title="Accept this lesson?"
        confirmLabel="Accept"
        cancelLabel="Go back"
        onCancel={() => setOpen(null)}
        onConfirm={() => submit('accept')}
      >
        {summary}. It is booked once you accept, and the teacher is told. You or the teacher can cancel up to 30 minutes
        before the start.
      </ConfirmDialog>
      <ConfirmDialog
        open={open === 'decline'}
        title="Decline this lesson?"
        confirmLabel="Decline"
        cancelLabel="Go back"
        onCancel={() => setOpen(null)}
        onConfirm={() => submit('decline')}
      >
        <span className="flex flex-col gap-2">
          <span>{summary}. The teacher is told.</span>
          <label htmlFor={reasonId} className="text-sm font-bold text-on-surface">
            Reason for the teacher (optional)
          </label>
          <textarea id={reasonId} form={formId} name="reason" maxLength={200} rows={2} className={cx(INPUT, 'py-2')} />
          <span className="text-sm text-on-surface-variant">
            Up to 200 characters. Please don’t include contact details.
          </span>
        </span>
      </ConfirmDialog>
    </form>
  );
}
