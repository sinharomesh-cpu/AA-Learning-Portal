'use client';

import { useActionState, useId, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { cx } from '@/lib/cx';
import { CURRENCIES, type Currency, formatAmount, parseAmount } from '@/lib/listing';
import {
  checkPackage,
  defaultWeeks,
  minPerWeekFor,
  minWeeks,
  PACKAGE_CLASSES_DEFAULT,
  PACKAGE_CLASSES_MAX,
  PACKAGE_CLASSES_MIN,
  PACKAGE_PROBLEM_TEXT,
  PACKAGE_TERMS_VERSION,
  lessonPriceMinor,
  PER_WEEK_MAX,
  TERMS_NOTE_MAX,
  WEEKS_MAX,
} from '@/lib/pricing';
import { formatMinute, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/usualTimes';
import {
  type OfferFormState,
  saveHourlyAction,
  savePackageAction,
  slotNegotiableAction,
  withdrawPackageAction,
} from './offerActions';

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
      ? `${formatAmount(currency, lessonPriceMinor(rateMinor, mins))} a ${mins}-minute lesson`
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

interface PackageInitial {
  status: 'draft' | 'offered' | 'needs_review' | 'none';
  currency: Currency | null;
  priceMinor: number | null;
  classes: number | null;
  perWeek: number | null;
  minutes: number | null;
  weeks: number | null;
  times: Array<{ weekday: number; start: number }>;
  negotiable: boolean;
  termsNote: string | null;
  reviewIssues: string[];
}

const REVIEW_TEXT: Record<string, string> = {
  classes_below_minimum: 'Your earlier monthly price had fewer than 22 classes. Packages need at least 22.',
  details_missing: 'Add classes a week, the completion period and class times — they weren’t stored before.',
  minutes_invalid: 'Your earlier lesson length isn’t allowed for packages.',
};

/** Board PM3: the learning package — its own price, never calculated from the hourly rate (P-7). */
export function PackageEditor({
  initial,
  slots,
  masterOn,
}: {
  initial: PackageInitial;
  slots: EditorSlot[];
  masterOn: boolean;
}) {
  const [state, action, pending] = useActionState<OfferFormState, FormData>(savePackageAction, {});
  const [wState, withdraw, wPending] = useActionState<OfferFormState>(withdrawPackageAction, {});
  const [currency, setCurrency] = useState<Currency>(initial.currency ?? 'INR');
  const [price, setPrice] = useState(initial.priceMinor ? String(initial.priceMinor / 100) : '');
  const [classes, setClasses] = useState(String(initial.classes ?? PACKAGE_CLASSES_DEFAULT));
  const [perWeek, setPerWeek] = useState(String(initial.perWeek ?? 4));
  const [minutes, setMinutes] = useState(String(initial.minutes ?? 40));
  const [weeks, setWeeks] = useState(
    initial.weeks ? String(initial.weeks) : String(defaultWeeks(PACKAGE_CLASSES_DEFAULT, initial.perWeek ?? 4)),
  );
  const [weeksTouched, setWeeksTouched] = useState(initial.weeks !== null);
  const [times, setTimes] = useState<string[]>(initial.times.map((t) => `${t.weekday}:${t.start}`));
  const [negotiable, setNegotiable] = useState(initial.negotiable);

  const c = Number(classes);
  const pw = Number(perWeek);
  const m = Number(minutes);
  const validCounts = Number.isInteger(c) && c >= 1 && Number.isInteger(pw) && pw >= 1;
  const minimum = validCounts ? minWeeks(c, pw) : null;
  const onCounts = (nextClasses: string, nextPerWeek: string) => {
    const nc = Number(nextClasses);
    const np = Number(nextPerWeek);
    if (!weeksTouched && Number.isInteger(nc) && nc > 0 && Number.isInteger(np) && np > 0)
      setWeeks(String(defaultWeeks(nc, np)));
  };
  // Every start time where a class of this length fits inside a usual time (30-minute steps).
  const options = slots.flatMap((s) => {
    const out: Array<{ value: string; label: string }> = [];
    for (let t = s.start; Number.isInteger(m) && m >= 10 && t + m <= s.end; t += 30)
      out.push({ value: `${s.weekday}:${t}`, label: `${WEEKDAYS_SHORT[s.weekday - 1]} ${formatMinute(t)}` });
    return out;
  });
  const rows = Number.isInteger(pw) && pw >= 1 && pw <= PER_WEEK_MAX ? pw : 0;
  const priceMinor = parseAmount(price);
  const problems = checkPackage(
    {
      currency,
      priceMinor: priceMinor ?? 0,
      classes: c,
      perWeek: pw,
      minutes: m,
      weeks: Number(weeks),
      times: times.slice(0, rows).map((v) => {
        const [weekday, start] = v.split(':').map(Number);
        return { weekday: weekday!, start: start! };
      }),
      termsVersion: PACKAGE_TERMS_VERSION,
      termsNote: null,
    },
    slots,
  );
  const status = initial.status;
  const chip =
    status === 'offered' ? (
      <StatusChip kind="success">Offered</StatusChip>
    ) : status === 'needs_review' ? (
      <StatusChip kind="error">Needs review</StatusChip>
    ) : status === 'draft' ? (
      <StatusChip kind="neutral">Draft · not offered</StatusChip>
    ) : (
      <StatusChip kind="neutral">Not set up</StatusChip>
    );
  return (
    <Card as="section" aria-labelledby="pk-title" className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="pk-title" className="flex flex-wrap items-center gap-3 text-[20px] font-bold leading-7">
          Learning package {chip}
        </h2>
        <p className="text-[15px] leading-[22px] text-on-surface-variant">
          Structured: {PACKAGE_CLASSES_MIN} to {PACKAGE_CLASSES_MAX} classes at your usual times, for one price you set.
          It needs both of you to agree before it starts and never renews automatically.
        </p>
      </div>
      {status === 'needs_review' ? (
        <FormMessage tone="warning">
          <strong>Your earlier monthly price moved here and isn’t shown to parents yet.</strong>{' '}
          {initial.reviewIssues.map((i) => REVIEW_TEXT[i] ?? i).join(' ')}
        </FormMessage>
      ) : null}
      <Result state={state} />
      <Result state={wState} />
      <form action={action} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pk-classes" className="text-sm font-bold">
              Number of classes
            </label>
            <input
              id="pk-classes"
              name="classes"
              inputMode="numeric"
              value={classes}
              onChange={(ev) => {
                setClasses(ev.target.value);
                onCounts(ev.target.value, perWeek);
              }}
              aria-describedby="pk-classes-hint"
              className={FIELD}
            />
            <span id="pk-classes-hint" className="text-sm text-on-surface-variant">
              {PACKAGE_CLASSES_MIN} to {PACKAGE_CLASSES_MAX}.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pk-minutes" className="text-sm font-bold">
              Lesson length (minutes)
            </label>
            <input
              id="pk-minutes"
              name="minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(ev) => setMinutes(ev.target.value)}
              aria-describedby="pk-min-hint"
              className={FIELD}
            />
            <span id="pk-min-hint" className="text-sm text-on-surface-variant">
              10 to 40 minutes.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pk-perweek" className="text-sm font-bold">
              Classes a week
            </label>
            <select
              id="pk-perweek"
              name="perWeek"
              value={perWeek}
              onChange={(ev) => {
                setPerWeek(ev.target.value);
                onCounts(classes, ev.target.value);
              }}
              aria-describedby="pk-pw-hint"
              className={FIELD}
            >
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span id="pk-pw-hint" className="text-sm text-on-surface-variant">
              At least {Number.isInteger(c) && c > 0 ? minPerWeekFor(c) : 2} for this many classes.
            </span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pk-weeks" className="text-sm font-bold">
              Complete within (weeks)
            </label>
            <input
              id="pk-weeks"
              name="weeks"
              inputMode="numeric"
              value={weeks}
              onChange={(ev) => {
                setWeeks(ev.target.value);
                setWeeksTouched(true);
              }}
              aria-describedby="pk-weeks-hint"
              className={FIELD}
            />
            <span id="pk-weeks-hint" className="text-sm text-on-surface-variant">
              {minimum !== null
                ? `Shortest possible: ${minimum} weeks (${c} classes ÷ ${pw} a week, rounded up). Longer is fine, up to ${WEEKS_MAX}.`
                : `Up to ${WEEKS_MAX} weeks.`}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pk-currency" className="text-sm font-bold">
              Currency
            </label>
            <select
              id="pk-currency"
              name="currency"
              value={currency}
              onChange={(ev) => setCurrency(ev.target.value as Currency)}
              className={FIELD}
            >
              {CURRENCIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pk-price" className="text-sm font-bold">
              Package price
            </label>
            <input
              id="pk-price"
              name="price"
              inputMode="decimal"
              value={price}
              onChange={(ev) => setPrice(ev.target.value)}
              aria-describedby="pk-price-hint"
              className={FIELD}
            />
            <span id="pk-price-hint" className="text-sm text-on-surface-variant">
              For the whole package. Set by you; not worked out from your hourly rate.
            </span>
          </div>
        </div>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-bold">Class times (one for each class a week)</legend>
          {options.length === 0 ? (
            <FormMessage tone="info">Add usual times long enough for a lesson on Availability first.</FormMessage>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <label htmlFor={`pk-time-${i}`} className="text-sm">
                    Class time {i + 1}
                  </label>
                  <select
                    id={`pk-time-${i}`}
                    name="time"
                    value={times[i] ?? ''}
                    onChange={(ev) =>
                      setTimes((ts) => {
                        const next = [...ts];
                        next[i] = ev.target.value;
                        return next;
                      })
                    }
                    className={FIELD}
                  >
                    <option value="">Choose a time</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-bold">Can parents propose a different price?</legend>
          <div className="flex flex-wrap gap-2">
            <label className={CHOICE}>
              <input
                type="radio"
                name="negotiable"
                value="no"
                checked={!negotiable}
                onChange={() => setNegotiable(false)}
                className="h-5 w-5 accent-primary"
              />
              Fixed package price
            </label>
            <label className={CHOICE}>
              <input
                type="radio"
                name="negotiable"
                value="yes"
                checked={negotiable}
                onChange={() => setNegotiable(true)}
                className="h-5 w-5 accent-primary"
              />
              Negotiation available
            </label>
          </div>
          <span className="text-sm text-on-surface-variant">
            Parents may only propose a different price. Classes, length, times, period and terms stay as you set them.
            This setting applies when you save; the hourly time settings don’t affect it.
          </span>
          {!masterOn && negotiable ? (
            <FormMessage tone="warning">
              “Accept rate proposals” is off on your dashboard, so parents can’t propose until you turn it on.
            </FormMessage>
          ) : null}
        </fieldset>
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-card-border p-3">
          <span className="text-sm font-bold">Terms</span>
          <p className="text-[15px]">
            AA Pro standard package terms (draft, version “{PACKAGE_TERMS_VERSION}”) — shown to parents before they
            confirm. Draft wording, pending legal review before launch.
          </p>
          <label htmlFor="pk-note" className="text-sm font-bold">
            Your own notes for parents (optional)
          </label>
          <textarea
            id="pk-note"
            name="termsNote"
            maxLength={TERMS_NOTE_MAX}
            defaultValue={initial.termsNote ?? ''}
            aria-describedby="pk-note-hint"
            className="box-border min-h-20 w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 py-3 text-base"
          />
          <span id="pk-note-hint" className="text-sm text-on-surface-variant">
            Up to {TERMS_NOTE_MAX} characters. They can’t change the standard terms. No contact details, please.
          </span>
        </div>
        {problems.length ? (
          <div className="rounded-[14px] bg-surface-container-low px-3 py-2 text-sm" aria-live="polite">
            <strong>Before you can offer it:</strong>
            <ul className="m-0 list-disc pl-5">
              {[...new Set(problems)].map((p) => (
                <li key={p}>{PACKAGE_PROBLEM_TEXT[p]}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="intent" value="offer" inactive={pending}>
            {pending ? 'Saving…' : 'Offer this package'}
          </Button>
          <Button type="submit" name="intent" value="draft" variant="secondary" inactive={pending}>
            Save as draft
          </Button>
        </div>
      </form>
      {status === 'offered' || status === 'needs_review' ? (
        <form action={withdraw}>
          <Button type="submit" variant="secondary" inactive={wPending}>
            Stop offering the package
          </Button>
        </form>
      ) : null}
      <p className="text-sm text-on-surface-variant">
        Changing the package never changes your hourly lessons. Proposals already made keep the details they were made
        for.
      </p>
    </Card>
  );
}
