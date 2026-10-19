'use client';

import { useActionState, useId, useState } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { CURRICULA_LIST } from '@/lib/curricula';
import { keepValuesOnSubmit } from '@/lib/keepValuesOnSubmit';
import { formatAmount } from '@/lib/listing';
import { describePackage, type HourlyOffer, lessonPriceMinor, type PackageTerms } from '@/lib/pricing';
import { MESSAGE_MAX, OFFERS_MAX, PAYMENT_NOTE, parseOfferAmount } from '@/lib/rateNegotiation';
import { formatMinute, type UsualTime, WEEKDAYS } from '@/lib/usualTimes';
import { proposeAction, type ProposeFormState } from './actions';
import type { ProposeKid, ProposeWait } from './ProposeForm';

const FIELD =
  'box-border min-h-12 w-full rounded-[14px] border-2 border-outline bg-surface-container-lowest px-3 text-base';
const CHOICE =
  'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 py-2 text-[15px] has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

function Err({ id, text }: { id: string; text?: string }) {
  return text ? (
    <span id={id} className="text-sm font-bold leading-5 text-on-error-container">
      {text}
    </span>
  ) : null;
}

const key = (t: UsualTime) => `${t.weekday}:${t.start}:${t.end}`;
const range = (t: UsualTime) =>
  `${WEEKDAYS[t.weekday - 1]} ${formatMinute(t.start)}–${t.end === 1440 ? '12:00 am' : formatMinute(t.end)}`;

/**
 * Board PM4 (CR-15; FR-043): propose a different hourly rate at one negotiable time, or a
 * different total price for the learning package. Price only: lesson length, class count,
 * frequency, period, times and terms stay as the teacher published them (P-6).
 */
export function ProposeOfferForm({
  publicId,
  teacherName,
  subjects,
  hourly,
  slots,
  pkg,
  timeZone,
  kids,
  waits,
  initial,
}: {
  publicId: string;
  teacherName: string;
  subjects: string[];
  hourly: HourlyOffer | null;
  /** Only the times open to proposals now. */
  slots: UsualTime[];
  /** The package, when its price is open to proposals now. */
  pkg: PackageTerms | null;
  timeZone: string;
  kids: ProposeKid[];
  waits: ProposeWait[];
  initial: string;
}) {
  const [state, action, pending] = useActionState<ProposeFormState, FormData>(proposeAction, {});
  const e = state.fieldErrors ?? {};
  const id = useId();
  const options = [...(hourly ? slots.map((t) => `hourly|${key(t)}`) : []), ...(pkg ? ['package'] : [])];
  const [choice, setChoice] = useState(options.includes(initial) ? initial : (options[0] ?? ''));
  const isPackage = choice === 'package';
  const slotKey = isPackage ? '' : (choice.split('|')[1] ?? '');
  const [who, setWho] = useState(kids[0]?.id ?? 'new');
  const [grade, setGrade] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const kid = kids.find((k) => k.id === who);
  const offered = kid ? kid.subjects : subjects;
  const [subject, setSubject] = useState(offered.length === 1 ? offered[0]! : '');
  const [amount, setAmount] = useState('');
  const currency = isPackage ? pkg!.currency : (hourly?.currency ?? 'INR');
  const asking = isPackage ? pkg!.priceMinor : (hourly?.rateMinor ?? 0);
  const offerMinor = parseOfferAmount(amount);
  const childKey = who === 'new' ? `grade:${grade}:${curriculum}` : `child:${who}`;
  const wait = waits.find((w) => w.childKey === childKey && w.model === (isPackage ? 'package' : 'hourly'));

  return (
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="kind" value={isPackage ? 'package' : 'hourly'} />
      <input type="hidden" name="slot" value={slotKey} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={`${id}-what-hint`}>
        <legend className="mb-2 p-0 text-[15px] font-bold">What would you like to propose?</legend>
        {hourly
          ? slots.map((t) => (
              <label key={key(t)} className={CHOICE}>
                <input
                  type="radio"
                  name="choice"
                  value={`hourly|${key(t)}`}
                  checked={choice === `hourly|${key(t)}`}
                  onChange={() => setChoice(`hourly|${key(t)}`)}
                  className="h-5 w-5 flex-none accent-primary"
                />
                <span>
                  <strong>Hourly lessons</strong> · {range(t)} · {formatAmount(hourly.currency, hourly.rateMinor)} per
                  hour ({formatAmount(hourly.currency, lessonPriceMinor(hourly.rateMinor, hourly.minutes))} a{' '}
                  {hourly.minutes}-minute lesson)
                </span>
              </label>
            ))
          : null}
        {pkg ? (
          <label className={CHOICE}>
            <input
              type="radio"
              name="choice"
              value="package"
              checked={isPackage}
              onChange={() => setChoice('package')}
              className="h-5 w-5 flex-none accent-primary"
            />
            <span>
              <strong>Learning package</strong> · {formatAmount(pkg.currency, pkg.priceMinor)} for the whole package ·{' '}
              {describePackage(pkg)}
            </span>
          </label>
        ) : null}
        <span id={`${id}-what-hint`} className="text-sm leading-5 text-on-surface-variant">
          Only what {teacherName} has opened to proposals is listed. Times are in the teacher&apos;s time zone (
          {timeZone}). Hourly and package proposals are separate: one of each can be open at the same time.
        </span>
        <Err id={`${id}-slot-err`} text={e.slot ?? e.price} />
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-who`} className="text-sm font-bold">
            For which child?
          </label>
          <select
            id={`${id}-who`}
            name="who"
            className={FIELD}
            value={who}
            aria-describedby={`${id}-who-hint`}
            onChange={(ev) => {
              setWho(ev.target.value);
              setSubject('');
            }}
          >
            {kids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
            <option value="new">A child I haven&apos;t added yet</option>
          </select>
          <span id={`${id}-who-hint`} className="text-sm leading-5 text-on-surface-variant">
            The teacher sees only the grade and curriculum, never a name.
          </span>
          <Err id={`${id}-who-err`} text={e.who} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-subject`} className="text-sm font-bold">
            Subject
          </label>
          <select
            id={`${id}-subject`}
            name="subject"
            className={FIELD}
            value={subject}
            aria-invalid={e.subject ? true : undefined}
            aria-describedby={e.subject ? `${id}-subject-err` : undefined}
            onChange={(ev) => setSubject(ev.target.value)}
          >
            <option value="">Choose a subject</option>
            {offered.map((s) => (
              <option key={s} value={s}>
                {SUBJECTS[s as SubjectId]?.name ?? s}
              </option>
            ))}
          </select>
          <Err id={`${id}-subject-err`} text={e.subject} />
        </div>
      </div>

      {who === 'new' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-grade`} className="text-sm font-bold">
              Grade
            </label>
            <select
              id={`${id}-grade`}
              name="grade"
              className={FIELD}
              value={grade}
              onChange={(ev) => setGrade(ev.target.value)}
            >
              <option value="">Choose a grade</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
            <Err id={`${id}-grade-err`} text={e.grade} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-curriculum`} className="text-sm font-bold">
              Curriculum
            </label>
            <select
              id={`${id}-curriculum`}
              name="curriculum"
              className={FIELD}
              value={curriculum}
              onChange={(ev) => setCurriculum(ev.target.value)}
            >
              <option value="">Choose a curriculum</option>
              {CURRICULA_LIST.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Err id={`${id}-curriculum-err`} text={e.curriculum} />
          </div>
        </div>
      ) : null}

      {wait ? <FormMessage tone="warning">{wait.text}</FormMessage> : null}

      <div className="flex max-w-[420px] flex-col gap-1.5">
        <label htmlFor={`${id}-amount`} className="text-sm font-bold">
          {isPackage ? `Your package price offer (${currency})` : `Your hourly rate offer (${currency} per hour)`}
        </label>
        <input
          id={`${id}-amount`}
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          className={FIELD}
          value={amount}
          aria-invalid={e.amount ? true : undefined}
          aria-describedby={`${id}-amount-hint${e.amount ? ` ${id}-amount-err` : ''}`}
          onChange={(ev) => setAmount(ev.target.value)}
        />
        <span id={`${id}-amount-hint`} className="text-sm leading-5 text-on-surface-variant">
          {isPackage
            ? 'For the whole package. Price only: the classes, length, times, period and terms stay as published.'
            : offerMinor && hourly
              ? `= ${formatAmount(currency, lessonPriceMinor(offerMinor, hourly.minutes))} for a ${hourly.minutes}-minute lesson. No commitment to further lessons.`
              : 'Per hour. The lesson length stays as published.'}
        </span>
        <Err id={`${id}-amount-err`} text={e.amount} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[15px]">
          <caption className="mb-2 text-left text-sm font-bold">Summary</caption>
          <tbody>
            <tr className="border-b border-card-border">
              <th scope="row" className="py-2 pr-3">
                {isPackage ? 'Teacher’s package price' : 'Teacher’s hourly rate'}
              </th>
              <td className="py-2">{formatAmount(currency, asking)}</td>
            </tr>
            <tr className="border-b border-card-border">
              <th scope="row" className="py-2 pr-3">
                Your offer
              </th>
              <td className="py-2 font-bold">{offerMinor ? formatAmount(currency, offerMinor) : '—'}</td>
            </tr>
            <tr>
              <th scope="row" className="py-2 pr-3">
                Unchanged
              </th>
              <td className="py-2">
                {isPackage && pkg
                  ? `${describePackage(pkg)} · terms version “${pkg.termsVersion}”`
                  : hourly
                    ? `${hourly.minutes}-minute lessons · ${slotKey ? range({ weekday: Number(slotKey.split(':')[0]), start: Number(slotKey.split(':')[1]), end: Number(slotKey.split(':')[2]) }) : ''}`
                    : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-message`} className="text-sm font-bold">
          Message to the teacher (optional)
        </label>
        <textarea
          id={`${id}-message`}
          name="message"
          maxLength={MESSAGE_MAX}
          className="box-border min-h-24 w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 py-3 text-base"
          aria-describedby={`${id}-message-hint`}
        />
        <span id={`${id}-message-hint`} className="text-sm leading-5 text-on-surface-variant">
          Up to {MESSAGE_MAX} characters. Please don&apos;t share contact details or your child&apos;s name.
        </span>
        <Err id={`${id}-message-err`} text={e.message} />
      </div>

      <FormMessage tone="info">
        {PAYMENT_NOTE} Agreeing a price doesn&apos;t book lessons, link the teacher to your child or start a payment
        {isPackage ? ', and a package still needs both of you to confirm its terms later' : ''}.
      </FormMessage>
      <p className="text-sm leading-5 text-on-surface-variant">
        This is <strong>offer 1 of {OFFERS_MAX}</strong>. Each new offer gives the other side 14 days to answer.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" inactive={pending}>
          {pending ? 'Sending…' : 'Send proposal'}
        </Button>
        <LinkButton href={`/teachers/${publicId}`} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
