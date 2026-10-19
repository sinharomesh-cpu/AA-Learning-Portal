'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { type AnswerState, answerEnquiryAction } from './actions';

export function AnswerForm({ enquiryId, parentFirstName }: { enquiryId: string; parentFirstName: string }) {
  const [state, action, pending] = useActionState<AnswerState, FormData>(answerEnquiryAction, {});
  const err = state.fieldErrors?.note;
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="enquiryId" value={enquiryId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`note-${enquiryId}`} className="text-sm font-bold">
          Note to {parentFirstName} (optional)
        </label>
        <textarea
          id={`note-${enquiryId}`}
          name="note"
          rows={3}
          maxLength={500}
          aria-invalid={err ? true : undefined}
          aria-describedby={`note-${enquiryId}-hint`}
          className="w-full rounded-[16px] border border-outline bg-surface-container-lowest px-4 py-3 text-base outline-none hover:border-on-surface-variant focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        {err ? <span className="text-sm font-bold text-on-error-container">{err}</span> : null}
        <span id={`note-${enquiryId}-hint`} className="text-sm text-on-surface-variant">
          Plain text, up to 500 characters. Please don&apos;t add phone numbers or email addresses.
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          name="decision"
          value="accept"
          inactive={pending}
          aria-label={`Accept the enquiry from ${parentFirstName}`}
        >
          Accept
        </Button>
        <Button
          type="submit"
          name="decision"
          value="decline"
          variant="secondary"
          inactive={pending}
          aria-label={`Decline the enquiry from ${parentFirstName}`}
        >
          Decline
        </Button>
      </div>
    </form>
  );
}
