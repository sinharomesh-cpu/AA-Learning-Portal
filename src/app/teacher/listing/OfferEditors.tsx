'use client';

import { useActionState, useId, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { cx } from '@/lib/cx';
import { CURRENCIES, type Currency, parseAmount } from '@/lib/listing';
import { describeLessonPrice } from '@/lib/pricing';
import { formatMinute, WEEKDAYS } from '@/lib/usualTimes';
import { type OfferFormState, saveHourlyAction, slotNegotiableAction } from './offerActions';

const FIELD =
  'box-border min-h-12 w-full rounded-[14px] border-2 border-outline bg-surface-container-lowest px-3 text-base';
const CHOICE =
  'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-full border-2 border-outline px-4 text-[15px] font-bold has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

export interface EditorSlot {
  weekday: number;
  start: number;
  end: number;
  negotiable: boolean;
}

function Result({ state }: { state: OfferFormState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.problems?.length)
    return (
      <FormMessage tone="error">
        {state.problems.length === 1 ? (
          state.problems[0]
        ) : (
          <ul className="m-0 list-disc pl-5">
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </FormMessage>
    );
  if (state.notice) return <FormMessage tone="success">{state.notice}</FormMessage>;
  return null;
}

const rangeText = (s: { weekday: number; start: number; end: number }) =>
  `${WEEKDAYS[s.weekday - 1]} ${formatMinute(s.start)}–${s.end === 1440 ? '12:00 am' : formatMinute(s.end)}`;

/** Board PM2: one usual time with its own Fixed rate / Negotiation available setting (P-8). */
function SlotSetting({ slot, lessonText }: { slot: EditorSlot; lessonText: string | null }) {
  const [state, action, pending] = useActionState<OfferFormState, FormData>(slotNegotiableAction, {});
  const name = useId();
  return (
    <li className="flex flex-col gap-2 border-t border-card-border py-3 first:border-t-0">
      <form action={action} className="flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="weekday" value={slot.weekday} />
        <input type="hidden" name="start" value={slot.start} />
        <input type="hidden" name="end" value={slot.end} />
        <span className="text-[15px]">
          <strong>{rangeText(slot)}</strong>
          {lessonText ? <span className="block text-sm text-on-surface-variant">{lessonText}</span> : null}
        </span>
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Hourly rate at {rangeText(slot)}</legend>
          {(
            [
              ['no', 'Fixed rate'],
              ['yes', 'Negotiation available'],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className={cx(CHOICE, 'min-h-11 px-3 text-sm')}>
              <input
                type="radio"
                name="negotiable"
                value={v}
                defaultChecked={(v === 'yes') === slot.negotiable}
                disabled={pending}
                onChange={(ev) => ev.currentTarget.form?.requestSubmit()}
                className="h-[18px] w-[18px] accent-primary"
                aria-describedby={`${name}-r`}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </form>
      <span id={`${name}-r`}>
        <Result state={state} />
      </span>
    </li>
  );
}

/** Board PM2: hourly lessons — rate, currency, one lesson length; no minimum number (P-7). */
export function HourlyEditor({
  initial,
  slots,
  masterOn,
}: {
  initial: { offered: boolean; currency: Currency | null; rateMinor: number | null; minutes: number | null };
  slots: EditorSlot[];
  masterOn: boolean;
}) {
  const [state, action, pending] = useActionState<OfferFormState, FormData>(saveHourlyAction, {});
  const [offered, setOffered] = useState(initial.offered);
  const [currency, setCurrency] = useState<Currency>(initial.currency ?? 'INR');
  const [rate, setRate] = useState(initial.rateMinor ? String(initial.rateMinor / 100) : '');
  const [minutes, setMinutes] = useState(String(initial.minutes ?? 40));
  const rateMinor = parseAmount(rate);
  const mins = Number(minutes);
  const lessonText =
    rateMinor && Number.isInteger(mins) && mins >= 10 && mins <= 40
      ? describeLessonPrice(currency, rateMinor, mins)
      : null;
  return (
    <Card as="section" aria-labelledby="hl-title" className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="hl-title" className="text-[20px] font-bold leading-7">
          Hourly lessons
        </h2>
        <p className="text-[15px] leading-[22px] text-on-surface-variant">
          Flexible: parents arrange one lesson at a time, with no minimum number of lessons.
        </p>
      </div>
      <Result state={state} />
      <form action={action} className="flex flex-col gap-4" noValidate>
        <label className="flex items-center gap-3 text-[15px] font-bold">
          <input
            type="checkbox"
            name="offered"
            value="yes"
            checked={offered}
            onChange={(ev) => setOffered(ev.target.checked)}
            className="h-6 w-6 accent-primary"
          />
          Offer hourly lessons
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hl-currency" className="text-sm font-bold">
              Currency
            </label>
            <select
              id="hl-currency"
              name="currency"
              value={currency}
              onChange={(ev) => setCurrency(ev.target.value as Currency)}
              className={FIELD}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hl-rate" className="text-sm font-bold">
              Hourly rate
            </label>
            <input
              id="hl-rate"
              name="rate"
              inputMode="decimal"
              value={rate}
              onChange={(ev) => setRate(ev.target.value)}
              aria-describedby="hl-rate-hint"
              className={FIELD}
            />
            <span id="hl-rate-hint" className="text-sm text-on-surface-variant">
              Per hour.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hl-minutes" className="text-sm font-bold">
              Lesson length (minutes)
            </label>
            <input
              id="hl-minutes"
              name="minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(ev) => setMinutes(ev.target.value)}
              aria-describedby="hl-min-hint"
              className={FIELD}
            />
            <span id="hl-min-hint" className="text-sm text-on-surface-variant">
              10 to 40 minutes.
            </span>
          </div>
        </div>
        <p className="text-[15px]" aria-live="polite">
          {lessonText ? (
            <>
              Parents see: <strong>{lessonText}</strong> (hourly rate × lesson length).
            </>
          ) : (
            'Enter a rate and length to see the lesson price.'
          )}
        </p>
        <div>
          <Button type="submit" inactive={pending}>
            {pending ? 'Saving…' : 'Save hourly lessons'}
          </Button>
        </div>
      </form>
      <section aria-labelledby="hl-times" className="flex flex-col gap-1">
        <h3 id="hl-times" className="text-[16px] font-bold">
          Your times for hourly lessons
        </h3>
        <p className="text-sm text-on-surface-variant">
          Choose for each time whether parents may propose a different hourly rate. Applies at once. Change the times
          themselves on Availability.
        </p>
        {slots.length ? (
          <ul className="m-0 list-none p-0">
            {slots.map((s) => (
              <SlotSetting key={`${s.weekday}-${s.start}-${s.end}`} slot={s} lessonText={lessonText} />
            ))}
          </ul>
        ) : (
          <FormMessage tone="info">Add your usual times on Availability first.</FormMessage>
        )}
        {!masterOn && slots.some((s) => s.negotiable) ? (
          <FormMessage tone="warning">
            “Accept rate proposals” is off on your dashboard, so parents can’t propose at any time until you turn it on.
          </FormMessage>
        ) : null}
      </section>
      <p className="text-sm text-on-surface-variant">
        Changing hourly lessons never changes your learning package. Prices are shown in their own currency and never
        converted. AA Pro never charges, collects or pays out money.
      </p>
    </Card>
  );
}
