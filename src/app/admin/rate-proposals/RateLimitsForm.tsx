'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import { RATE_LIMIT_RANGES } from '@/lib/rateNegotiation';
import { type RateLimitFormState, saveRateLimitsAction } from './actions';

export function RateLimitsForm({ activePerParent, newPerDay }: { activePerParent: number; newPerDay: number }) {
  const [state, action, pending] = useActionState<RateLimitFormState, FormData>(saveRateLimitsAction, {});
  const field = (name: 'activePerParent' | 'newPerDay', label: string, value: number) => (
    <TextField
      name={name}
      label={label}
      hint={`From ${RATE_LIMIT_RANGES[name].min} to ${RATE_LIMIT_RANGES[name].max}`}
      inputMode="numeric"
      type="number"
      min={RATE_LIMIT_RANGES[name].min}
      max={RATE_LIMIT_RANGES[name].max}
      step={1}
      required
      defaultValue={value}
    />
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('activePerParent', 'Open proposals per parent at once', activePerParent)}
        {field('newPerDay', 'New proposals per parent per day', newPerDay)}
      </div>
      <div>
        <Button type="submit" variant="primary" inactive={pending}>
          {pending ? 'Saving…' : 'Save limits'}
        </Button>
      </div>
    </form>
  );
}
