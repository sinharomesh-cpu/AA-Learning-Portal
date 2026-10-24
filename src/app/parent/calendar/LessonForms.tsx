'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { cancelLessonAction, type LessonFormState, withdrawLessonAction } from './actions';

function Result({ state }: { state: LessonFormState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.notice) return <FormMessage tone="success">{state.notice}</FormMessage>;
  return null;
}

/** Withdraw or cancel, each after a confirmation (CR-17 PR 2). */
export function ParentLessonButton({
  lessonId,
  kind,
  label,
}: {
  lessonId: string;
  kind: 'withdraw' | 'cancel';
  /** What the lesson is, for the button's accessible name and the dialog ("Maths with Ms Rao, Tue 4 Nov, 4:00 pm"). */
  label: string;
}) {
  const [state, action, pending] = useActionState<LessonFormState, FormData>(
    kind === 'withdraw' ? withdrawLessonAction : cancelLessonAction,
    {},
  );
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  if (state.notice) return <Result state={state} />;
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="lessonId" value={lessonId} />
      <Result state={state} />
      <Button
        type="button"
        variant={kind === 'cancel' ? 'danger' : 'secondary'}
        inactive={pending}
        onClick={() => setOpen(true)}
        aria-label={`${kind === 'withdraw' ? 'Withdraw request' : 'Cancel lesson'}: ${label}`}
      >
        {kind === 'withdraw' ? 'Withdraw request' : 'Cancel lesson'}
      </Button>
      <ConfirmDialog
        open={open}
        title={kind === 'withdraw' ? 'Withdraw this request?' : 'Cancel this lesson?'}
        confirmLabel={kind === 'withdraw' ? 'Withdraw' : 'Cancel lesson'}
        cancelLabel={kind === 'withdraw' ? 'Keep it' : 'Keep the lesson'}
        tone={kind === 'cancel' ? 'danger' : 'primary'}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        {label}.{' '}
        {kind === 'withdraw'
          ? 'The teacher is told, and the request can’t be accepted afterwards.'
          : 'The teacher is told. To move a lesson, cancel it and request a new time.'}
      </ConfirmDialog>
    </form>
  );
}
