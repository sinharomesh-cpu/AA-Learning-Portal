'use client';

import { useActionState, useId, useState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { Icon } from '@/components/icons/Icon';
import { cx } from '@/lib/cx';
import { type Currency, formatAmount, parseAmount } from '@/lib/listing';
import { describeLessonPrice, lessonPriceMinor, lessonRoundingNote } from '@/lib/pricing';
import { formatMinute, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/usualTimes';
import { Badge, CardHead, int, PriceField, Result, Section, SHELL, Stepper } from './builderUi';
import { type OfferFormState, saveHourlyAction, slotNegotiableAction } from './offerActions';

export interface EditorSlot {
  weekday: number;
  start: number;
  end: number;
  negotiable: boolean;
}

const rangeText = (s: { weekday: number; start: number; end: number }) =>
  `${WEEKDAYS[s.weekday - 1]} ${formatMinute(s.start)}–${s.end === 1440 ? '12:00 am' : formatMinute(s.end)}`;

/** Board PM2 (restyled, OC-109): one usual time with its own Fixed rate / Open to offers setting (P-8). */
function SlotSetting({ slot, lessonText }: { slot: EditorSlot; lessonText: string | null }) {
  const [state, action, pending] = useActionState<OfferFormState, FormData>(slotNegotiableAction, {});
  const name = useId();
  return (
    <li className="flex flex-col gap-3 rounded-[20px] border border-card-border bg-surface-container-low/40 p-4">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="weekday" value={slot.weekday} />
        <input type="hidden" name="start" value={slot.start} />
        <input type="hidden" name="end" value={slot.end} />
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-12 flex-none flex-col items-center justify-center rounded-[14px] bg-primary text-[12px] font-extrabold uppercase tracking-[.04em] text-on-primary"
          >
            {WEEKDAYS_SHORT[slot.weekday - 1]}
          </span>
          <span className="flex min-w-0 flex-col">
            <strong className="text-[15px]">{rangeText(slot)}</strong>
            {lessonText ? <span className="text-[13px] text-on-surface-variant">{lessonText}</span> : null}
          </span>
        </div>
        <fieldset className="m-0 grid grid-cols-2 gap-1 rounded-full border-0 bg-surface-container p-1">
          <legend className="sr-only">Hourly rate at {rangeText(slot)}</legend>
          {(
            [
              ['no', 'Fixed rate', 'lock'],
              ['yes', 'Open to offers', 'forum'],
            ] as const
          ).map(([v, label, icon]) => (
            <label
              key={v}
              className="relative flex min-h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold text-on-surface-variant has-[:checked]:bg-surface-container-lowest has-[:checked]:text-on-surface has-[:checked]:shadow-[0_2px_8px_-2px_rgba(19,27,46,.25)] has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-primary"
            >
              <input
                type="radio"
                name="negotiable"
                value={v}
                defaultChecked={(v === 'yes') === slot.negotiable}
                disabled={pending}
                onChange={(ev) => ev.currentTarget.form?.requestSubmit()}
                className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0"
                aria-describedby={`${name}-r`}
              />
              <Icon name={icon} size={16} />
              {label}
            </label>
          ))}
        </fieldset>
      </form>
      <span id={`${name}-r`} className="empty:hidden">
        <Result state={state} />
      </span>
    </li>
  );
}

/** Board PM2 (restyled to boards PT0–PT1, OC-109): hourly lessons — rate, currency, one lesson length (P-7). */
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
  const mins = int(minutes);
  const okLength = Number.isInteger(mins) && mins >= 10 && mins <= 40;
  const lessonText = rateMinor && okLength ? describeLessonPrice(currency, rateMinor, mins) : null;
  const rounding = rateMinor && okLength ? lessonRoundingNote(currency, rateMinor, mins) : null;
  return (
    <section aria-labelledby="hl-title" className={cx(SHELL, 'xl:col-span-2')}>
      <CardHead
        id="hl-title"
        title="Hourly lessons"
        intro="Flexible: parents arrange one lesson at a time, with no minimum number of lessons."
        badge={
          initial.offered ? (
            <Badge tone="good" icon="check">
              Offered
            </Badge>
          ) : (
            <Badge tone="neutral">Not offered</Badge>
          )
        }
      />
      <div className="flex flex-col gap-3 px-5 pt-4 empty:hidden sm:px-6">
        <Result state={state} />
      </div>
      <form action={action} noValidate>
        <input type="hidden" name="currency" value={currency} />
        <Section n={1} id="hl-s1" title="Rate and lesson length">
          <label
            className={cx(
              'relative flex cursor-pointer items-center gap-3 rounded-[20px] border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
              offered
                ? 'border-2 border-primary bg-primary-fixed/30'
                : 'border-card-border bg-surface-container-lowest',
            )}
          >
            <input
              type="checkbox"
              name="offered"
              value="yes"
              checked={offered}
              onChange={(ev) => setOffered(ev.target.checked)}
              className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0"
            />
            <span className="flex size-10 flex-none items-center justify-center rounded-[14px] bg-surface-container text-on-surface">
              <Icon name="schedule" size={20} />
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <strong className="text-[15px]">Offer hourly lessons</strong>
              <span className="text-[13px] leading-[18px] text-on-surface-variant">
                Parents can book single lessons at your usual times.
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cx(
                'relative h-7 w-12 flex-none rounded-full transition-colors',
                offered ? 'bg-primary' : 'bg-outline-variant',
              )}
            >
              <span
                className={cx(
                  'absolute top-1 size-5 rounded-full bg-white shadow transition-[left]',
                  offered ? 'left-6' : 'left-1',
                )}
              />
            </span>
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <PriceField
              id="hl-rate"
              name="rate"
              label="Hourly rate"
              value={rate}
              onChange={setRate}
              currency={currency}
              onCurrency={setCurrency}
              suffix="per hour"
              hint="Whole amounts or up to 2 decimals, e.g. 200 or 199.50."
            />
            <Stepper
              id="hl-minutes"
              name="minutes"
              label="Lesson length (min)"
              value={minutes}
              min={10}
              max={40}
              step={5}
              onChange={setMinutes}
              hint="10 to 40 minutes"
            />
          </div>
          <div
            aria-live="polite"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[20px] border border-human-border bg-primary-fixed/25 px-4 py-3"
          >
            <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.07em] text-on-primary-fixed-variant">
              <Icon name="visibility" size={16} />
              Parents see
            </span>
            {lessonText && rateMinor ? (
              <span className="text-[15px]">
                <strong className="font-headline text-[22px]">
                  {formatAmount(currency, lessonPriceMinor(rateMinor, mins))}
                </strong>{' '}
                a {mins}-minute lesson
                {rounding ? <span className="text-[13px] text-on-surface-variant"> ({rounding})</span> : null}
                <span className="text-[13px] text-on-surface-variant"> · hourly rate × lesson length</span>
              </span>
            ) : (
              <span className="text-[15px] text-on-surface-variant">
                Enter a rate and length to see the lesson price.
              </span>
            )}
          </div>
        </Section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border bg-surface-container-low/40 px-5 py-4 sm:px-6">
          <span className="text-[13px] text-on-surface-variant">
            Changing hourly lessons never changes your learning package.
          </span>
          <Button type="submit" inactive={pending}>
            {pending ? 'Saving…' : 'Save hourly lessons'}
          </Button>
        </div>
      </form>
      <Section n={2} id="hl-times" title="Your times for hourly lessons">
        <p className="-mt-2 text-[13px] text-on-surface-variant">
          Choose for each time whether parents may propose a different hourly rate. Applies at once. Change the times
          themselves on{' '}
          <a href="/teacher/availability" className="font-bold">
            Availability
          </a>
          .
        </p>
        {slots.length ? (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
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
      </Section>
      <p className="px-5 py-4 text-[13px] text-on-surface-variant sm:px-6">
        Prices are shown in their own currency and never converted. AA Pro never charges, collects or pays out money.
      </p>
    </section>
  );
}
