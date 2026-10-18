'use client';

import { useActionState, useId, useState } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { CURRICULA_LIST } from '@/lib/curricula';
import { keepValuesOnSubmit } from '@/lib/keepValuesOnSubmit';
import { describePrice, formatAmount, type ListingPrice, PRICE_MODEL_LABEL } from '@/lib/listing';
import {
  LESSONS_LABEL,
  MESSAGE_MAX,
  OFFERS_MAX,
  PAYMENT_NOTE,
  parseOfferAmount,
  PER_PERIOD,
} from '@/lib/rateNegotiation';
import { proposeAction, type ProposeFormState } from './actions';

const FIELD =
  'box-border min-h-12 w-full rounded-[14px] border-2 border-outline bg-surface-container-lowest px-3 text-base';
const CHOICE =
  'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 text-[15px] has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

export interface ProposeKid {
  id: string;
  label: string;
  subjects: string[];
}

export interface ProposeWait {
  childKey: string;
  model: string;
  text: string;
}

function Err({ id, text }: { id: string; text?: string }) {
  return text ? (
    <span id={id} className="text-sm font-bold leading-5 text-on-error-container">
      {text}
    </span>
  ) : null;
}

/** Board RN2: propose a rate. The basis and currency come from the chosen asking price. */
export function ProposeForm({
  publicId,
  teacherName,
  subjects,
  prices,
  kids,
  waits,
  initialPrice,
}: {
  publicId: string;
  teacherName: string;
  subjects: string[];
  prices: Array<ListingPrice & { index: number }>;
  kids: ProposeKid[];
  waits: ProposeWait[];
  initialPrice: number;
}) {
  const [state, action, pending] = useActionState<ProposeFormState, FormData>(proposeAction, {});
  const e = state.fieldErrors ?? {};
  const id = useId();
  const [priceIndex, setPriceIndex] = useState(
    prices.some((p) => p.index === initialPrice) ? initialPrice : (prices[0]?.index ?? 0),
  );
  const price = prices.find((p) => p.index === priceIndex) ?? prices[0]!;
  const [who, setWho] = useState(kids[0]?.id ?? 'new');
  const [grade, setGrade] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const kid = kids.find((k) => k.id === who);
  const offered = kid ? kid.subjects : subjects;
  const [subject, setSubject] = useState(offered.length === 1 ? offered[0]! : '');
  const [amount, setAmount] = useState('');
  const [sessions, setSessions] = useState(String(price.sessions ?? ''));
  const [minutes, setMinutes] = useState(String(price.minutes));

  const childKey = who === 'new' ? `grade:${grade}:${curriculum}` : `child:${who}`;
  const wait = waits.find((w) => w.childKey === childKey && w.model === price.model);
  const offerMinor = parseOfferAmount(amount);
  const perLesson = (minor: number, n: number | null) =>
    n && n > 0 ? formatAmount(price.currency, Math.round(minor / n)) : '—';

  return (
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="publicId" value={publicId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={`${id}-price-hint`}>
        <legend className="mb-2 p-0 text-[15px] font-bold">Which price?</legend>
        {prices.map((p) => (
          <label key={p.index} className={CHOICE}>
            <input
              type="radio"
              name="price"
              value={p.index}
              checked={p.index === priceIndex}
              onChange={() => {
                setPriceIndex(p.index);
                setSessions(String(p.sessions ?? ''));
                setMinutes(String(p.minutes));
              }}
              className="h-5 w-5 accent-primary"
            />
            <span>
              <strong>{PRICE_MODEL_LABEL[p.model]}</strong> · {describePrice(p)}
            </span>
          </label>
        ))}
        <span id={`${id}-price-hint`} className="text-sm leading-5 text-on-surface-variant">
          Only prices that take proposals are listed. The basis ({PRICE_MODEL_LABEL[price.model].toLowerCase()}) and
          currency stay the same for every offer; nothing is converted.
        </span>
        <Err id={`${id}-price-err`} text={e.price} />
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

      <div className={price.model === 'hourly' ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4 md:grid-cols-3'}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-amount`} className="text-sm font-bold">
            Your offer ({price.currency} {PER_PERIOD[price.model]})
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
            Any amount above zero, like 3400 or 3400.50.
          </span>
          <Err id={`${id}-amount-err`} text={e.amount} />
        </div>
        {price.model !== 'hourly' ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-sessions`} className="text-sm font-bold">
              {LESSONS_LABEL[price.model]}
            </label>
            <input
              id={`${id}-sessions`}
              name="sessions"
              inputMode="numeric"
              className={FIELD}
              value={sessions}
              aria-describedby={`${id}-sessions-hint`}
              onChange={(ev) => setSessions(ev.target.value)}
            />
            <span id={`${id}-sessions-hint`} className="text-sm leading-5 text-on-surface-variant">
              1 to 31
            </span>
            <Err id={`${id}-sessions-err`} text={e.sessions} />
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
            className={FIELD}
            value={minutes}
            aria-describedby={`${id}-minutes-hint`}
            onChange={(ev) => setMinutes(ev.target.value)}
          />
          <span id={`${id}-minutes-hint`} className="text-sm leading-5 text-on-surface-variant">
            10 to 40
          </span>
          <Err id={`${id}-minutes-err`} text={e.minutes} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[15px]">
          <caption className="mb-2 text-left text-sm font-bold">Compare</caption>
          <thead>
            <tr className="border-b border-card-border">
              <th scope="col" className="py-2 pr-3">
                <span className="sr-only">Item</span>
              </th>
              <th scope="col" className="py-2 pr-3">
                Asking price
              </th>
              <th scope="col" className="py-2">
                Your offer
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-card-border">
              <th scope="row" className="py-2 pr-3">
                {PRICE_MODEL_LABEL[price.model]}
              </th>
              <td className="py-2 pr-3">{formatAmount(price.currency, price.amountMinor)}</td>
              <td className="py-2 font-bold">{offerMinor ? formatAmount(price.currency, offerMinor) : '—'}</td>
            </tr>
            <tr className="border-b border-card-border">
              <th scope="row" className="py-2 pr-3">
                Lessons
              </th>
              <td className="py-2 pr-3">
                {price.sessions ? `${price.sessions} × ` : ''}
                {price.minutes} min
              </td>
              <td className="py-2">
                {price.model !== 'hourly' ? `${sessions || '—'} × ` : ''}
                {minutes || '—'} min
              </td>
            </tr>
            {price.model !== 'hourly' ? (
              <tr>
                <th scope="row" className="py-2 pr-3">
                  Per lesson
                </th>
                <td className="py-2 pr-3">{perLesson(price.amountMinor, price.sessions)}</td>
                <td className="py-2">{offerMinor ? perLesson(offerMinor, Number(sessions) || null) : '—'}</td>
              </tr>
            ) : null}
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

      <FormMessage tone="info">{PAYMENT_NOTE}</FormMessage>
      <p className="text-sm leading-5 text-on-surface-variant">
        This is <strong>offer 1 of {OFFERS_MAX}</strong>. You and {teacherName} can make up to {OFFERS_MAX} offers in
        total; each new offer gives the other side 14 days to answer.
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
