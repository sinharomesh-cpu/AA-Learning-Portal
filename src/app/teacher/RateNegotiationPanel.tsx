'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { setRateNegotiationAction } from './rateActions';

/** Board RN4: the global rate negotiation control on the teacher dashboard (OC-99 (9)–(10)). */
export function RateNegotiationPanel({
  on,
  openPrices,
  waiting,
}: {
  on: boolean;
  /** Labels of the plans whose price switch is on, e.g. ["Hourly", "Monthly"]. */
  openPrices: string[];
  waiting: number;
}) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(setRateNegotiationAction, {});
  return (
    <section
      aria-labelledby="rate-negotiation"
      className="flex flex-col gap-3 rounded-lg border border-card-border bg-surface-container-lowest p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="rate-negotiation" className="font-headline text-headline-sm font-bold">
          Rate negotiation
        </h2>
        <StatusChip kind={on ? 'success' : 'neutral'}>{on ? 'Accepting rate proposals' : 'Off'}</StatusChip>
      </div>
      <p className="text-body-md text-on-surface-variant">
        Let parents offer a different rate for prices you choose. Off until you turn it on. AA Pro does not collect or
        process payments.
      </p>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <form action={action}>
        <input type="hidden" name="on" value={on ? 'no' : 'yes'} />
        <Button type="submit" variant={on ? 'secondary' : 'primary'} inactive={pending}>
          {on ? 'Stop accepting rate proposals' : 'Accept rate proposals'}
        </Button>
      </form>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[15px]">
        <li>
          Prices open for proposals: <strong>{openPrices.length ? openPrices.join(', ') : 'none yet'}</strong> (set in{' '}
          <Link href="/teacher/listing" className="font-bold underline">
            your listing
          </Link>
          )
        </li>
        <li>
          Waiting for your answer: <strong>{waiting}</strong> ·{' '}
          <Link href="/teacher/enquiries/rates" className="font-bold underline">
            Rate proposals
          </Link>
        </li>
      </ul>
      {on && openPrices.length === 0 ? (
        <FormMessage tone="warning">Turned on, but no price is open yet. Choose prices in your listing.</FormMessage>
      ) : null}
      <p className="text-sm text-on-surface-variant">
        When this is off, no price takes proposals and your asking prices show as fixed. Open negotiations continue;
        nothing is deleted or cancelled.
      </p>
    </section>
  );
}
