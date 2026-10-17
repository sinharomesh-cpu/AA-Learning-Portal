'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { withdrawEnquiryAction, type WithdrawState } from './actions';

export function WithdrawForm({ enquiryId, teacherName }: { enquiryId: string; teacherName: string }) {
  const [state, action, pending] = useActionState<WithdrawState, FormData>(withdrawEnquiryAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <div>
        <Button type="submit" variant="secondary" inactive={pending} aria-label={`Withdraw enquiry to ${teacherName}`}>
          Withdraw enquiry
        </Button>
      </div>
    </form>
  );
}
