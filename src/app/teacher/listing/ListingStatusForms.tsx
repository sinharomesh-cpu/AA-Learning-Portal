'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { type ListingFormState, listingStatusAction, renewListingAction } from './actions';

/** Board D5: pause or withdraw a shown listing. */
export function ListingStatusButtons({ canPause, canWithdraw }: { canPause: boolean; canWithdraw: boolean }) {
  const [state, action, pending] = useActionState<ListingFormState, FormData>(listingStatusAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <div className="flex flex-wrap gap-3">
        {canPause ? (
          <Button type="submit" name="action" value="pause" variant="secondary" inactive={pending}>
            Pause
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button type="submit" name="action" value="withdraw" variant="danger" inactive={pending}>
            Withdraw
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Board D5, L-3: renew for 60 days with three confirmations. */
export function RenewForm() {
  const [state, action, pending] = useActionState<ListingFormState, FormData>(renewListingAction, {});
  const err = state.fieldErrors?.renew;
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" aria-describedby={err ? 'renew-error' : undefined}>
        <legend className="mb-1 p-0 text-[16px] font-bold">Renew for 60 days</legend>
        {[
          ['confirmTimes', 'My usual free times are correct.'],
          ['confirmPrices', 'My asking prices are correct.'],
          ['confirmSubjects', 'These are still the subjects and grades I’m approved to teach.'],
        ].map(([name, text]) => (
          <label key={name} className="flex items-start gap-3 text-[15px] leading-[22px]">
            <input type="checkbox" name={name} value="yes" className="mt-0.5 h-6 w-6 flex-none accent-primary" />
            <span>{text}</span>
          </label>
        ))}
        {err ? (
          <span id="renew-error" className="text-sm font-bold text-on-error-container">
            {err}
          </span>
        ) : null}
      </fieldset>
      <div>
        <Button type="submit" inactive={pending}>
          {pending ? 'Renewing…' : 'Renew listing'}
        </Button>
      </div>
    </form>
  );
}
