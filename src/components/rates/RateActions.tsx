'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { DECLINE_REASON_TEXT, DECLINE_REASONS } from '@/lib/linkRequests';
import type { Currency, PriceModel } from '@/lib/listing';
import { LESSONS_LABEL, MESSAGE_MAX, OFFERS_MAX, PAYMENT_NOTE, PER_PERIOD, type Side } from '@/lib/rateNegotiation';
import { answerAction, counterAction, type RateFormState, withdrawAction } from './actions';

const FIELD =
  'box-border min-h-12 w-full rounded-[14px] border-2 border-outline bg-surface-container-lowest px-3 text-base';

export interface RateActionsProps {
  id: string;
  side: Side;
  myTurn: boolean;
  active: boolean;
  offers: number;
  model: PriceModel;
  currency: Currency;
  /** "₹3,700 a month · 8 lessons × 40 min" — the latest offer, for the accept dialog. */
  latestText: string;
  latestAmount: string;
  latest: { sessions: number | null; minutes: number };
  /** "Kiran" for the parent; "Grade 5 · CBSE" for the teacher. */
  about: string;
  /** The other side's name, for the dialogs. */
  otherName: string;
}

function Result({ state }: { state: RateFormState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.notice) return <FormMessage tone="success">{state.notice}</FormMessage>;
  return null;
}

/** Boards RN3, RN5, RN6: accept, counter, decline and (parent) withdraw, by turn. */
export function RateActions(p: RateActionsProps) {
  if (!p.active) return null;
  return (
    <div className="flex flex-col gap-3">
      {p.myTurn ? (
        <div className="flex flex-wrap items-start gap-2.5">
          <AnswerButton {...p} answer="accept" />
          <AnswerButton {...p} answer="decline" />
          {p.side === 'parent' ? <WithdrawButton {...p} /> : null}
        </div>
      ) : p.side === 'parent' ? (
        <div className="flex flex-wrap items-start gap-2.5">
          <WithdrawButton {...p} />
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">Nothing to do until the parent answers.</p>
      )}
      {p.myTurn && p.offers < OFFERS_MAX ? <CounterForm {...p} /> : null}
      {p.myTurn && p.offers >= OFFERS_MAX ? (
        <p className="text-sm text-on-surface-variant">
          This is the last offer allowed. You can accept or decline it; no more counter-offers.
        </p>
      ) : null}
    </div>
  );
}

function AnswerButton(p: RateActionsProps & { answer: 'accept' | 'decline' }) {
  const [state, action, pending] = useActionState<RateFormState, FormData>(answerAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const accept = p.answer === 'accept';
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="answer" value={p.answer} />
      <Result state={state} />
      <Button type="button" variant={accept ? 'primary' : 'danger'} inactive={pending} onClick={() => setOpen(true)}>
        {accept ? `Accept ${p.latestAmount}` : 'Decline'}
      </Button>
      <ConfirmDialog
        open={open}
        title={accept ? `Accept ${p.latestAmount}?` : 'Decline this offer?'}
        confirmLabel={accept ? 'Accept' : 'Decline'}
        cancelLabel="Back"
        tone={accept ? 'primary' : 'danger'}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        {accept ? (
          <>
            <p className="m-0">
              {p.otherName} · {p.about} · {p.latestText}.
            </p>
            <p className="mb-0 mt-2 text-sm">
              This records the agreed rate. It doesn&apos;t link the teacher to a child, book lessons or take a payment.
            </p>
          </>
        ) : (
          <>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-bold text-on-surface">Reason (optional)</legend>
              {DECLINE_REASONS.map((r) => (
                <label
                  key={r}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 text-base text-on-surface has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40"
                >
                  <input type="radio" name="reason" value={r} className="h-5 w-5 accent-primary" />
                  {DECLINE_REASON_TEXT[r]}
                </label>
              ))}
            </fieldset>
            <p id={`${id}-wait`} className="mb-0 mt-3 text-sm">
              After a decline, the parent can&apos;t start a new proposal with this teacher for the same child and price
              for 7 days.
            </p>
          </>
        )}
      </ConfirmDialog>
    </form>
  );
}

function WithdrawButton(p: RateActionsProps) {
  const [state, action, pending] = useActionState<RateFormState, FormData>(withdrawAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={p.id} />
      <Result state={state} />
      <Button type="button" variant="secondary" inactive={pending} onClick={() => setOpen(true)}>
        Withdraw
      </Button>
      <ConfirmDialog
        open={open}
        title="Withdraw this proposal?"
        confirmLabel="Withdraw"
        cancelLabel="Keep it"
        tone="danger"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        {p.otherName} will no longer be able to answer it. You can propose again at any time.
      </ConfirmDialog>
    </form>
  );
}

function CounterForm(p: RateActionsProps) {
  const [state, action, pending] = useActionState<RateFormState, FormData>(counterAction, {});
  const id = useId();
  const e = state.fieldErrors ?? {};
  return (
    <details className="rounded-[16px] border border-card-border bg-surface-container-low px-4 py-2">
      <summary className="min-h-11 cursor-pointer py-2 font-bold">Counter-offer</summary>
      <form action={action} className="flex flex-col gap-3 pb-3 pt-1" noValidate>
        <input type="hidden" name="id" value={p.id} />
        <Result state={state} />
        <p className="text-sm leading-5 text-on-surface-variant">
          This will be{' '}
          <strong>
            offer {p.offers + 1} of {OFFERS_MAX}
          </strong>{' '}
          and gives {p.otherName} 14 days to answer. The basis and currency ({p.currency}) stay the same.
        </p>
        <div className={p.model === 'hourly' ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3 sm:grid-cols-3'}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-amount`} className="text-sm font-bold">
              Your offer ({p.currency} {PER_PERIOD[p.model]})
            </label>
            <input id={`${id}-amount`} name="amount" inputMode="decimal" autoComplete="off" className={FIELD} />
            {e.amount ? <span className="text-sm font-bold text-on-error-container">{e.amount}</span> : null}
          </div>
          {p.model !== 'hourly' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-sessions`} className="text-sm font-bold">
                {LESSONS_LABEL[p.model]}
              </label>
              <input
                id={`${id}-sessions`}
                name="sessions"
                inputMode="numeric"
                defaultValue={p.latest.sessions ?? ''}
                className={FIELD}
              />
              {e.sessions ? <span className="text-sm font-bold text-on-error-container">{e.sessions}</span> : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-minutes`} className="text-sm font-bold">
              Minutes per lesson
            </label>
            <input
              id={`${id}-minutes`}
              name="minutes"
              inputMode="numeric"
              defaultValue={p.latest.minutes}
              className={FIELD}
            />
            {e.minutes ? <span className="text-sm font-bold text-on-error-container">{e.minutes}</span> : null}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-message`} className="text-sm font-bold">
            Message (optional)
          </label>
          <textarea
            id={`${id}-message`}
            name="message"
            maxLength={MESSAGE_MAX}
            aria-describedby={`${id}-message-hint`}
            className="box-border min-h-20 w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 py-3 text-base"
          />
          <span id={`${id}-message-hint`} className="text-sm leading-5 text-on-surface-variant">
            Up to {MESSAGE_MAX} characters. No contact details, please.
          </span>
        </div>
        <FormMessage tone="info">{PAYMENT_NOTE}</FormMessage>
        <div>
          <Button type="submit" inactive={pending}>
            {pending ? 'Sending…' : 'Send counter-offer'}
          </Button>
        </div>
      </form>
    </details>
  );
}
