'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { Icon } from '@/components/icons/Icon';
import { cx } from '@/lib/cx';
import { type Currency, formatAmount, parseAmount } from '@/lib/listing';
import {
  checkPackage,
  defaultWeeks,
  maxClassesPerWeek,
  minPerWeekFor,
  minWeeks,
  PACKAGE_CLASSES_DEFAULT,
  PACKAGE_CLASSES_MAX,
  PACKAGE_CLASSES_MIN,
  PACKAGE_PROBLEM_TEXT,
  PACKAGE_TERMS_VERSION,
  packageStartTimes,
  packageTimesOverlap,
  type PackageTime,
  PER_WEEK_MAX,
  PER_WEEK_MIN,
  TERMS_NOTE_MAX,
  WEEKS_MAX,
} from '@/lib/pricing';
import { formatMinute, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/usualTimes';
import {
  Badge,
  CardHead,
  ChoiceCard,
  int,
  PriceField,
  Result,
  Section,
  SHELL,
  Step,
  Stepper,
  TILE,
  TILE_KEY,
  windowText,
} from './builderUi';
import { type OfferFormState, savePackageAction, withdrawPackageAction } from './offerActions';

/**
 * Learning package builder (OC-108, boards PT0–PT1). The same form and rules as before (board
 * PM3): one price set by the teacher, 22–60 classes, 2–7 a week, up to 26 weeks, class times
 * inside usual times without overlapping. Same-day classes are allowed (OC-108 (2)). The server
 * and the database check every rule again.
 */

export interface PackageSlot {
  weekday: number;
  start: number;
  end: number;
}

export interface PackageInitial {
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

const PER_WEEK = Array.from({ length: PER_WEEK_MAX - PER_WEEK_MIN + 1 }, (_, i) => i + PER_WEEK_MIN);
const key = (t: PackageTime) => `${t.weekday}:${t.start}`;
const label = (t: PackageTime) => `${WEEKDAYS_SHORT[t.weekday - 1]} ${formatMinute(t.start)}`;
export function PackageEditor({
  initial,
  slots,
  masterOn,
}: {
  initial: PackageInitial;
  slots: PackageSlot[];
  masterOn: boolean;
}) {
  const [state, action, pending] = useActionState<OfferFormState, FormData>(savePackageAction, {});
  const [wState, withdraw, wPending] = useActionState<OfferFormState>(withdrawPackageAction, {});
  const [currency, setCurrency] = useState<Currency>(initial.currency ?? 'INR');
  const [price, setPrice] = useState(initial.priceMinor ? String(initial.priceMinor / 100) : '');
  const [classes, setClasses] = useState(String(initial.classes ?? PACKAGE_CLASSES_DEFAULT));
  const [perWeek, setPerWeek] = useState(initial.perWeek ?? 4);
  const [minutes, setMinutes] = useState(String(initial.minutes ?? 40));
  const [weeks, setWeeks] = useState(
    initial.weeks ? String(initial.weeks) : String(defaultWeeks(PACKAGE_CLASSES_DEFAULT, initial.perWeek ?? 4)),
  );
  const [weeksTouched, setWeeksTouched] = useState(initial.weeks !== null);
  const [times, setTimes] = useState<PackageTime[]>(initial.times);
  const [negotiable, setNegotiable] = useState(initial.negotiable);
  const [day, setDay] = useState<number>(() => initial.times[0]?.weekday ?? slots[0]?.weekday ?? 1);

  const c = int(classes);
  const m = int(minutes);
  const pw = perWeek;
  const starts = packageStartTimes(slots, m);
  const capacity = maxClassesPerWeek(slots, m);
  const minPw = Number.isInteger(c) && c > 0 ? minPerWeekFor(c) : PER_WEEK_MIN;
  // Times that no longer fit (length changed, or usual times edited) drop out of the choice.
  const chosen = times.filter((t) => starts.some((s) => key(s) === key(t))).slice(0, pw);
  const priceMinor = parseAmount(price);
  const problems = [
    ...new Set(
      checkPackage(
        {
          currency,
          priceMinor: priceMinor ?? 0,
          classes: c,
          perWeek: pw,
          minutes: m,
          weeks: int(weeks),
          times: chosen,
          termsVersion: PACKAGE_TERMS_VERSION,
          termsNote: null,
        },
        slots,
      ),
    ),
  ];
  const ready = problems.length === 0;
  const tooMany = starts.length > 0 && pw > capacity;
  const fitPw = Math.min(capacity, PER_WEEK_MAX);
  const canFit = fitPw >= Math.max(PER_WEEK_MIN, minPw);

  const resetWeeks = (nc: number, np: number) => {
    if (!weeksTouched && Number.isInteger(nc) && nc > 0) setWeeks(String(defaultWeeks(nc, np)));
  };
  const choosePerWeek = (n: number) => {
    setPerWeek(n);
    setTimes((ts) => ts.slice(0, n));
    resetWeeks(c, n);
  };
  const toggle = (t: PackageTime) =>
    setTimes((ts) => (ts.some((x) => key(x) === key(t)) ? ts.filter((x) => key(x) !== key(t)) : [...chosen, t]));

  const status = initial.status;
  const statusChip =
    status === 'offered' ? (
      <Badge tone="good" icon="check">
        Offered
      </Badge>
    ) : status === 'needs_review' ? (
      <Badge tone="bad" icon="info">
        Needs details
      </Badge>
    ) : status === 'draft' ? (
      <Badge tone="neutral">Draft · not offered</Badge>
    ) : (
      <Badge tone="neutral">Not set up</Badge>
    );
  const stepState = (done: boolean, now: boolean) => (done ? 'done' : now ? 'now' : 'todo');
  const shapeDone = !problems.some((p) =>
    ['classes', 'minutes', 'per_week', 'weeks_short', 'weeks_long', 'price', 'currency'].includes(p),
  );
  const timesDone = !problems.some((p) => p.startsWith('times')) && !tooMany;

  // One chip for a start time; numbered when chosen, greyed when it would overlap a chosen class.
  const chip = (t: PackageTime) => {
    const at = chosen.findIndex((x) => key(x) === key(t));
    const on = at >= 0;
    const clash = !on && chosen.some((x) => packageTimesOverlap(x, t, m));
    const full = !on && chosen.length >= pw;
    return (
      <button
        key={key(t)}
        type="button"
        aria-pressed={on}
        aria-label={`${WEEKDAYS[t.weekday - 1]} ${formatMinute(t.start)}${on ? `, class time ${at + 1}` : clash ? ', overlaps another class' : ''}`}
        disabled={clash || full}
        onClick={() => toggle(t)}
        className={cx(
          'relative flex h-10 w-full cursor-pointer items-center justify-center whitespace-nowrap rounded-[12px] border px-1 text-[13px] font-extrabold',
          on
            ? 'border-primary bg-primary text-on-primary shadow-[0_8px_16px_-10px_rgba(0,97,148,.9)]'
            : clash
              ? 'cursor-not-allowed border-dashed border-card-border bg-surface-container-low font-semibold text-on-surface-variant/60'
              : full
                ? 'cursor-not-allowed border-card-border bg-surface-container-lowest text-on-surface-variant/70'
                : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary',
        )}
      >
        {formatMinute(t.start)}
        {on ? (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-2 flex size-5 items-center justify-center rounded-full border-2 border-surface-container-lowest bg-[#13774a] text-[11px] text-white"
          >
            {at + 1}
          </span>
        ) : null}
      </button>
    );
  };
  const windows = (d: number) =>
    slots
      .filter((s) => s.weekday === d)
      .map((s) => windowText(s.start, s.end))
      .join(', ');
  const dayStarts = (d: number) => starts.filter((s) => s.weekday === d);
  const summary = [...chosen]
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start)
    .map(label)
    .join(' · ');

  return (
    <section
      aria-labelledby="pk-title"
      className="grid items-start gap-6 xl:col-span-2 min-[1600px]:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className={SHELL}>
        <CardHead
          id="pk-title"
          title="Learning package"
          intro={`A set of ${PACKAGE_CLASSES_MIN} to ${PACKAGE_CLASSES_MAX} classes at fixed weekly times, for one price you set. Both of you agree before it starts; it never renews automatically.`}
          badge={statusChip}
        />
        <ol
          className="m-0 flex list-none flex-wrap gap-1.5 border-b border-card-border px-5 py-3.5 sm:px-6"
          aria-label="Steps"
        >
          <Step n={1} state={stepState(shapeDone, true)}>
            Shape and price
          </Step>
          <Step n={2} state={stepState(timesDone, shapeDone)}>
            Class times
          </Step>
          <Step n={3} state={stepState(ready, shapeDone && timesDone)}>
            Offers
          </Step>
        </ol>
        {status === 'needs_review' ? (
          <div className="px-5 pt-5 sm:px-6">
            <FormMessage tone="warning">
              <strong>Your earlier monthly price moved here and isn’t shown to parents yet.</strong>{' '}
              {initial.reviewIssues.map((i) => REVIEW_TEXT[i] ?? i).join(' ')}
            </FormMessage>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 px-5 pt-4 empty:hidden sm:px-6">
          <Result state={state} />
          <Result state={wState} />
        </div>
        <form action={action} noValidate>
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="perWeek" value={pw} />
          <input type="hidden" name="negotiable" value={negotiable ? 'yes' : 'no'} />
          {chosen.map((t) => (
            <input key={key(t)} type="hidden" name="time" value={key(t)} />
          ))}

          <Section n={1} id="pk-s1" title="Shape and price">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Stepper
                id="pk-classes"
                name="classes"
                label="Classes"
                value={classes}
                min={PACKAGE_CLASSES_MIN}
                max={PACKAGE_CLASSES_MAX}
                onChange={(v) => {
                  setClasses(v);
                  resetWeeks(int(v), pw);
                }}
                hint={`${PACKAGE_CLASSES_MIN} to ${PACKAGE_CLASSES_MAX} classes`}
              />
              <Stepper
                id="pk-minutes"
                name="minutes"
                label="Lesson length (min)"
                value={minutes}
                min={10}
                max={40}
                step={5}
                onChange={setMinutes}
                hint="10 to 40 minutes"
              />
              <fieldset className={cx(TILE, 'm-0 min-w-0')}>
                <legend className={cx(TILE_KEY, 'float-left mb-2 p-0')}>Classes a week</legend>
                <div className="clear-both flex flex-wrap gap-1.5">
                  {PER_WEEK.map((n) => {
                    const on = n === pw;
                    const off = n < minPw || (starts.length > 0 && n > capacity);
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${n} a week${off ? ', doesn’t fit' : ''}`}
                        disabled={off && !on}
                        onClick={() => choosePerWeek(n)}
                        className={cx(
                          'flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-[14px] border px-3 text-[15px] font-extrabold',
                          on
                            ? off
                              ? 'border-error bg-error-container text-on-error-container line-through'
                              : 'border-primary bg-primary text-on-primary shadow-[0_6px_14px_-8px_rgba(0,97,148,.8)]'
                            : off
                              ? 'cursor-not-allowed border-dashed border-card-border bg-surface-container-low text-on-surface-variant/50 line-through'
                              : 'border-card-border bg-surface-container-lowest text-on-surface hover:border-outline',
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[13px] leading-[18px] text-on-surface-variant">
                  {starts.length === 0
                    ? `At least ${minPw} for this many classes.`
                    : `Your usual times fit up to ${capacity} a week${minPw > PER_WEEK_MIN ? `; at least ${minPw} for this many classes` : ''}.`}
                </span>
              </fieldset>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Stepper
                id="pk-weeks"
                name="weeks"
                label="Complete within (weeks)"
                value={weeks}
                min={Number.isInteger(c) && c > 0 ? minWeeks(c, pw) : 1}
                max={WEEKS_MAX}
                onChange={(v) => {
                  setWeeks(v);
                  setWeeksTouched(true);
                }}
                hint={
                  Number.isInteger(c) && c > 0
                    ? `Shortest: ${minWeeks(c, pw)} weeks (${c} ÷ ${pw}, rounded up). Up to ${WEEKS_MAX}.`
                    : `Up to ${WEEKS_MAX} weeks.`
                }
              />
              <PriceField
                id="pk-price"
                name="price"
                label="Package price"
                value={price}
                onChange={setPrice}
                currency={currency}
                onCurrency={setCurrency}
                hint="For the whole package. Whole amounts or up to 2 decimals, e.g. 1500 or 1499.50. Not worked out from your hourly rate."
              />
            </div>
          </Section>

          <Section n={2} id="pk-s2" title="Weekly class times">
            <div className="flex flex-wrap items-center gap-3" aria-live="polite">
              <span aria-hidden="true" className="flex gap-1.5">
                {Array.from({ length: pw }, (_, i) => (
                  <span
                    key={i}
                    className={cx('size-3.5 rounded-full', i < chosen.length ? 'bg-[#13774a]' : 'bg-outline-variant')}
                  />
                ))}
              </span>
              {chosen.length === pw && !tooMany ? (
                <Badge tone="good" icon="check">
                  All {pw} chosen
                </Badge>
              ) : (
                <strong>
                  {chosen.length} of {pw} chosen
                </strong>
              )}
              <span className="text-[13px] text-on-surface-variant">
                One time for each class a week. Tap a time to choose it; tap again to remove it.
              </span>
            </div>
            {starts.length === 0 ? (
              <FormMessage tone="info">
                Add usual times long enough for a {Number.isInteger(m) ? `${m}-minute` : ''} lesson on{' '}
                <a href="/teacher/availability" className="font-bold">
                  Availability
                </a>{' '}
                first.
              </FormMessage>
            ) : (
              <>
                {/* Desktop and tablet: the whole week (PT0). */}
                <div className="hidden grid-cols-7 gap-2 md:grid" role="group" aria-label="Class times by day">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) =>
                    dayStarts(d).length ? (
                      <div
                        key={d}
                        className="flex min-w-0 flex-col gap-1.5 rounded-[18px] border border-card-border bg-surface-container-lowest p-2"
                      >
                        <span className="text-center text-xs font-extrabold uppercase tracking-[.06em] text-on-surface-variant">
                          {WEEKDAYS_SHORT[d - 1]}
                        </span>
                        <span className="rounded-[8px] bg-[#e3f6ec] px-1 py-0.5 text-center text-[11px] font-bold text-[#005236] dark:bg-[#0e3b27] dark:text-[#b2e3c8]">
                          {windows(d)}
                        </span>
                        {dayStarts(d).map(chip)}
                      </div>
                    ) : (
                      <div
                        key={d}
                        className="flex min-h-[140px] flex-col items-center gap-2 rounded-[18px] border border-dashed border-card-border bg-[repeating-linear-gradient(135deg,transparent_0_8px,rgba(127,135,150,.08)_8px_16px)] p-2"
                      >
                        <span className="text-xs font-extrabold uppercase tracking-[.06em] text-on-surface-variant">
                          {WEEKDAYS_SHORT[d - 1]}
                        </span>
                        <span className="m-auto text-center text-xs text-on-surface-variant">Not usually free</span>
                      </div>
                    ),
                  )}
                </div>
                {/* Phone: day tabs, then the times (PT1). */}
                <div className="flex flex-col gap-3 md:hidden">
                  <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Days">
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const has = dayStarts(d).length > 0;
                      const n = chosen.filter((t) => t.weekday === d).length;
                      const on = d === day;
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          disabled={!has}
                          aria-label={`${WEEKDAYS[d - 1]}${has ? (n ? `, ${n} chosen` : '') : ', not usually free'}`}
                          onClick={() => setDay(d)}
                          className={cx(
                            'flex h-[58px] w-12 flex-none flex-col items-center justify-center gap-0.5 rounded-[16px] border text-xs font-extrabold',
                            on
                              ? 'border-primary bg-primary text-on-primary'
                              : has
                                ? 'border-card-border bg-surface-container-lowest text-on-surface'
                                : 'border-dashed border-card-border bg-surface-container-low text-on-surface-variant/50',
                          )}
                        >
                          {WEEKDAYS_SHORT[d - 1]}
                          {n ? <span className={on ? 'text-white' : 'text-[#13774a]'}>{n}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                  {dayStarts(day).length ? (
                    <>
                      <span className="self-start rounded-[10px] bg-[#e3f6ec] px-2.5 py-1 text-xs font-bold text-[#005236] dark:bg-[#0e3b27] dark:text-[#b2e3c8]">
                        {WEEKDAYS[day - 1]} · usually free {windows(day)}
                      </span>
                      <div className="grid grid-cols-3 gap-2">{dayStarts(day).map(chip)}</div>
                    </>
                  ) : (
                    <p className="text-sm text-on-surface-variant">Choose a day with usual times.</p>
                  )}
                </div>
              </>
            )}
            {tooMany ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-[20px] border border-[#f5cf8f] bg-[#fff4e0] p-4 text-[#4d2f00] dark:border-[#6b4b12] dark:bg-[#2d1f05] dark:text-[#ffd58f]"
              >
                <Icon name="info" size={22} className="mt-0.5 flex-none" />
                <div className="flex flex-col gap-1">
                  <strong>{pw} classes a week won’t fit your usual times</strong>
                  <span>
                    {capacity === 0
                      ? 'No class of this length fits your usual times.'
                      : `Your usual times fit ${capacity} ${capacity === 1 ? 'class' : 'classes'} of ${m} minutes a week without overlapping.`}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canFit ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPerWeek(fitPw);
                          setTimes((ts) => ts.slice(0, fitPw));
                          setWeeksTouched(false);
                          if (Number.isInteger(c) && c > 0) setWeeks(String(defaultWeeks(c, fitPw)));
                        }}
                        className="h-[42px] cursor-pointer rounded-full border border-[#4d2f00] bg-[#4d2f00] px-4 text-sm font-extrabold text-white"
                      >
                        Use {fitPw} a week
                        {Number.isInteger(c) && c > 0 ? ` · ${defaultWeeks(c, fitPw)} weeks` : ''}
                      </button>
                    ) : null}
                    <a
                      href="/teacher/availability"
                      className="inline-flex h-[42px] items-center gap-2 rounded-full border border-[#c7a35e] bg-white px-4 text-sm font-extrabold text-[#4d2f00] no-underline dark:bg-transparent dark:text-[#ffd58f]"
                    >
                      <Icon name="calendar_month" size={16} />
                      Add usual times on Availability
                    </a>
                  </div>
                </div>
              </div>
            ) : chosen.length === pw && pw > 0 ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-[20px] border border-[#b2e3c8] bg-[#e9f8f0] p-4 text-[#00391f] dark:border-[#1e5c3d] dark:bg-[#0e2a1d] dark:text-[#c8f1da]"
              >
                <Icon name="check" size={22} className="mt-0.5 flex-none" />
                <div>
                  <strong className="block">{summary}</strong>
                  Every week{Number.isInteger(int(weeks)) ? ` for up to ${int(weeks)} weeks` : ''}. Times are in your
                  time zone; parents see them in theirs.
                </div>
              </div>
            ) : null}
            <span className="text-[13px] text-on-surface-variant">
              Only start times inside your usual times are shown, in 30-minute steps. Greyed times would overlap a class
              you already chose. Two classes on the same day are fine if they don’t overlap.
            </span>
          </Section>

          <Section n={3} id="pk-s3" title="Can parents propose a different price?">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="pk-s3">
              <ChoiceCard
                checked={!negotiable}
                onChange={() => setNegotiable(false)}
                icon="lock"
                title="Fixed price"
                text="Parents book at your price."
              />
              <ChoiceCard
                checked={negotiable}
                onChange={() => setNegotiable(true)}
                icon="forum"
                title="Open to offers"
                text="Parents may propose a different price only. Classes, length, times, period and terms stay as you set them."
              />
            </div>
            {!masterOn && negotiable ? (
              <FormMessage tone="warning">
                “Accept rate proposals” is off on your dashboard, so parents can’t propose until you turn it on.
              </FormMessage>
            ) : null}
            <details className="rounded-[16px] border border-card-border p-3">
              <summary className="cursor-pointer text-sm font-bold">Terms and your notes for parents</summary>
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-[15px]">
                  AA Pro standard package terms (draft, version “{PACKAGE_TERMS_VERSION}”) — shown to parents before
                  they confirm. Draft wording, pending legal review before launch.
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
                  className="box-border min-h-20 w-full rounded-[16px] border border-outline bg-surface-container-lowest px-4 py-3 text-base outline-none hover:border-on-surface-variant focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <span id="pk-note-hint" className="text-sm text-on-surface-variant">
                  Up to {TERMS_NOTE_MAX} characters. They can’t change the standard terms. No contact details, please.
                </span>
              </div>
            </details>
          </Section>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-low/40 px-5 py-4 sm:px-6">
            <span className="text-[13px] text-on-surface-variant">
              {ready
                ? 'Parents will see exactly the summary shown here.'
                : 'You can save a draft any time; it’s offered once everything is complete.'}
            </span>
            <div className="flex flex-wrap gap-2.5">
              <Button type="submit" name="intent" value="draft" variant="secondary" inactive={pending}>
                Save as draft
              </Button>
              <Button type="submit" name="intent" value="offer" inactive={pending}>
                {pending ? 'Saving…' : 'Offer this package'}
              </Button>
            </div>
          </div>
        </form>
        {status === 'offered' || status === 'needs_review' ? (
          <form action={withdraw} className="border-t border-card-border px-5 py-4 sm:px-6">
            <Button type="submit" variant="secondary" inactive={wPending}>
              Stop offering the package
            </Button>
          </form>
        ) : null}
      </div>

      {/* Preview and checklist (PT0 right column). */}
      <aside
        className="grid items-start gap-4 md:grid-cols-2 min-[1600px]:sticky min-[1600px]:top-6 min-[1600px]:flex min-[1600px]:flex-col"
        aria-label="Package preview"
      >
        {ready ? (
          <div className="flex flex-col gap-2.5 rounded-[24px] border border-[#c8ecd8] bg-[#effaf4] p-5 text-on-surface dark:border-[#1e5c3d] dark:bg-[#0e2a1d]">
            <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.07em] text-[#005236] dark:text-[#b2e3c8]">
              <Icon name="visibility" size={16} />
              What parents will see
            </span>
            <span className="font-headline text-[28px] font-bold leading-9">
              {formatAmount(currency, priceMinor!)}{' '}
              <span className="font-body text-sm font-semibold text-on-surface-variant">for {c} classes</span>
            </span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
              <li className="flex gap-2">
                <Icon name="schedule" size={16} className="mt-0.5 flex-none" />
                {m} min · {pw} a week · within {int(weeks)} weeks
              </li>
              <li className="flex gap-2">
                <Icon name="calendar_month" size={16} className="mt-0.5 flex-none" />
                {summary}
              </li>
              <li className="flex gap-2">
                <Icon name={negotiable ? 'forum' : 'lock'} size={16} className="mt-0.5 flex-none" />
                {negotiable ? 'Open to offers on price' : 'Fixed price'}
              </li>
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-[24px] border border-card-border bg-surface-container-low p-5">
            <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.07em] text-on-surface-variant">
              <Icon name="visibility" size={16} />
              Parents can’t see this yet
            </span>
            <span className="text-[13px] text-on-surface-variant">Finish the steps to show it on your listing.</span>
          </div>
        )}
        <div
          className="flex flex-col gap-2.5 rounded-[24px] border border-card-border bg-surface-container-lowest p-5"
          aria-live="polite"
        >
          <span className="text-xs font-extrabold uppercase tracking-[.07em] text-primary">
            {ready ? 'Ready to offer' : 'Before you can offer it'}
          </span>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {ready ? (
              <li className="flex items-center gap-2 text-[#13774a]">
                <Icon name="check" size={18} />
                Everything is complete.
              </li>
            ) : (
              <>
                {tooMany ? (
                  <li className="flex items-start gap-2 text-[#8a5300] dark:text-[#ffd58f]">
                    <Icon name="info" size={18} className="mt-0.5 flex-none" />
                    {pw} a week won’t fit your usual times.
                  </li>
                ) : null}
                {problems.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[#8a5300] dark:text-[#ffd58f]">
                    <Icon name="info" size={18} className="mt-0.5 flex-none" />
                    {p === 'times_count' ? `${chosen.length} of ${pw} class times chosen.` : PACKAGE_PROBLEM_TEXT[p]}
                  </li>
                ))}
              </>
            )}
          </ul>
        </div>
        <p className="text-[13px] text-on-surface-variant">
          Changing the package never changes your hourly lessons. Proposals already made keep the details they were made
          for.
        </p>
      </aside>
    </section>
  );
}
