'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import {
  answerLessonAction,
  cancelTeacherLessonAction,
  meetingLinkAction,
  outcomeAction,
  type ScheduleState,
} from './actions';

function Result({ state }: { state: ScheduleState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.notice) return <FormMessage tone="success">{state.notice}</FormMessage>;
  return null;
}

/** Accept, or decline with an optional reason (CR-17 PR 2). */
export function AnswerButtons({ lessonId, label }: { lessonId: string; label: string }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(answerLessonAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const answer = useRef<HTMLInputElement>(null);
  const formId = useId();
  const noteId = useId();
  if (state.notice) return <Result state={state} />;
  return (
    <form ref={form} id={formId} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="lessonId" value={lessonId} />
      <input ref={answer} type="hidden" name="answer" value="accept" />
      <Result state={state} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          inactive={pending}
          onClick={() => {
            if (answer.current) answer.current.value = 'accept';
          }}
          aria-label={`Accept: ${label}`}
        >
          Accept
        </Button>
        <Button
          type="button"
          variant="secondary"
          inactive={pending}
          onClick={() => setOpen(true)}
          aria-label={`Decline: ${label}`}
        >
          Decline
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title="Decline this request?"
        confirmLabel="Decline"
        cancelLabel="Go back"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          if (answer.current) answer.current.value = 'decline';
          form.current?.requestSubmit();
        }}
      >
        <span className="flex flex-col gap-2">
          <span>{label}. The family is told.</span>
          <label htmlFor={noteId} className="text-sm font-bold text-on-surface">
            Reason for the family (optional)
          </label>
          <textarea id={noteId} form={formId} name="note" maxLength={200} rows={2} className={cx(INPUT, 'py-2')} />
        </span>
      </ConfirmDialog>
    </form>
  );
}

/** Cancel a confirmed lesson, after a confirmation. */
export function TeacherCancelButton({ lessonId, label }: { lessonId: string; label: string }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(cancelTeacherLessonAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  if (state.notice) return <Result state={state} />;
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="lessonId" value={lessonId} />
      <Result state={state} />
      <Button
        type="button"
        variant="danger"
        inactive={pending}
        onClick={() => setOpen(true)}
        aria-label={`Cancel lesson: ${label}`}
      >
        Cancel lesson
      </Button>
      <ConfirmDialog
        open={open}
        title="Cancel this lesson?"
        confirmLabel="Cancel lesson"
        cancelLabel="Keep the lesson"
        tone="danger"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        {label}. The family is told.
      </ConfirmDialog>
    </form>
  );
}

/** After the lesson: Taught, or Did not take place (D3A-7). */
export function OutcomeButtons({ lessonId, label }: { lessonId: string; label: string }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(outcomeAction, {});
  if (state.notice) return <Result state={state} />;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="lessonId" value={lessonId} />
      <Result state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="outcome" value="taught" inactive={pending} aria-label={`Taught: ${label}`}>
          Taught
        </Button>
        <Button
          type="submit"
          name="outcome"
          value="not_taken_place"
          variant="secondary"
          inactive={pending}
          aria-label={`Did not take place: ${label}`}
        >
          Did not take place
        </Button>
      </div>
    </form>
  );
}

/**
 * CR-17 PR 3 (D3A-1): the teacher pastes their own Zoom meeting's participant link. The saved
 * link is never shown again in the page (it usually carries the passcode); a new one replaces it.
 */
export function MeetingLinkForm({ lessonId, label, added }: { lessonId: string; label: string; added: boolean }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(meetingLinkAction, {});
  const inputId = useId();
  const helpId = useId();
  return (
    <form action={action} className="flex w-full max-w-[360px] flex-col gap-2">
      <input type="hidden" name="lessonId" value={lessonId} />
      <label htmlFor={inputId} className="text-sm font-bold">
        {added ? 'Change the Zoom meeting link' : 'Zoom meeting link'}
      </label>
      <input
        id={inputId}
        name="link"
        type="url"
        inputMode="url"
        autoComplete="off"
        required
        maxLength={500}
        placeholder="https://…zoom.us/…"
        aria-describedby={helpId}
        className={INPUT}
      />
      <p id={helpId} className="m-0 text-sm leading-5 text-on-surface-variant">
        From your own Zoom meeting. AA Pro keeps it private: Join Class opens it for this lesson only, from 10 minutes
        before the start. Deleted 7 days after the lesson.
      </p>
      <Result state={state} />
      <Button type="submit" variant="secondary" inactive={pending} aria-label={`Save meeting link: ${label}`}>
        {added ? 'Change link' : 'Save link'}
      </Button>
    </form>
  );
}
