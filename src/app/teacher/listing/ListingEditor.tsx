'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { ListingDetails } from '@/components/listing/ListingDetails';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { keepValuesOnSubmit } from '@/lib/keepValuesOnSubmit';
import {
  CURRENCIES,
  type Currency,
  type ListingPrice,
  type ListingSnapshot,
  parseAmount,
  PRICE_MODEL_LABEL,
  PRICE_MODELS,
  type PriceModel,
  PRICES_MAX,
  snapshotKey,
} from '@/lib/listing';
import type { UsualTime } from '@/lib/usualTimes';
import { type ListingFormState, saveListingAction } from './actions';

const CHOICE =
  'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-full border-2 border-outline px-4 text-[15px] font-bold has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';
const FIELD = 'min-h-12 w-full rounded-[14px] border-2 border-outline bg-surface-container-lowest px-3 text-base';

interface PriceRow {
  key: number;
  model: PriceModel;
  currency: Currency;
  amount: string;
  sessions: string;
  minutes: string;
}

let nextKey = 1;
const toRow = (p: ListingPrice): PriceRow => ({
  key: nextKey++,
  model: p.model,
  currency: p.currency,
  amount: String(p.amountMinor / 100),
  sessions: p.sessions === null ? '' : String(p.sessions),
  minutes: String(p.minutes),
});

function Err({ id, text }: { id: string; text?: string }) {
  return text ? (
    <span id={id} className="text-sm font-bold leading-5 text-on-error-container">
      {text}
    </span>
  ) : null;
}

/**
 * Board D5: the teacher's listing editor with a live "What parents see" preview. The preview
 * shows exactly what publishing would show; the server builds the same copy again from the
 * saved values and the profile, so the browser cannot publish anything else.
 */
export function ListingEditor({
  approvedSubjects,
  approvedGrades,
  curriculaOptions,
  initial,
  profile,
  timeZoneLabel,
  shown,
}: {
  approvedSubjects: string[];
  approvedGrades: number[];
  curriculaOptions: readonly string[];
  initial: {
    subjects: string[];
    grades: number[];
    curricula: string[];
    experienceYears: number | null;
    prices: ListingPrice[];
  };
  profile: { name: string; bio: string; timeZone: string; usualTimes: UsualTime[]; photoId: string | null };
  timeZoneLabel: string;
  /** The listing is published or paused now. */
  shown: boolean;
}) {
  const [state, action, pending] = useActionState<ListingFormState, FormData>(saveListingAction, {});
  const e = state.fieldErrors ?? {};
  const [subjects, setSubjects] = useState(initial.subjects);
  const [grades, setGrades] = useState(initial.grades);
  const [curricula, setCurricula] = useState(initial.curricula);
  const [experience, setExperience] = useState(initial.experienceYears === null ? '' : String(initial.experienceYears));
  const [rows, setRows] = useState<PriceRow[]>(() => initial.prices.map(toRow));

  const toggle = <T,>(list: T[], value: T, on: boolean) => (on ? [...list, value] : list.filter((x) => x !== value));
  const setRow = (key: number, patch: Partial<PriceRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const previewPrices: ListingPrice[] = rows.flatMap((r) => {
    const amountMinor = parseAmount(r.amount);
    const minutes = Number(r.minutes);
    const sessions = r.model === 'hourly' ? null : Number(r.sessions);
    if (amountMinor === null || !(minutes >= 10 && minutes <= 40)) return [];
    if (sessions !== null && !(Number.isInteger(sessions) && sessions >= 1 && sessions <= 31)) return [];
    return [{ model: r.model, currency: r.currency, amountMinor, sessions, minutes }];
  });
  const expNumber = /^\d{1,2}$/.test(experience.trim()) ? Number(experience.trim()) : null;
  const preview: ListingSnapshot = {
    name: profile.name,
    subjects: approvedSubjects.filter((s) => subjects.includes(s)),
    grades: approvedGrades.filter((g) => grades.includes(g)),
    curricula: curriculaOptions.filter((c) => curricula.includes(c)),
    experienceYears: expNumber !== null && expNumber <= 60 ? expNumber : null,
    bio: profile.bio,
    timeZone: profile.timeZone,
    usualTimes: profile.usualTimes,
    prices: previewPrices,
    photoId: profile.photoId,
  };

  return (
    <form
      action={action}
      onSubmit={keepValuesOnSubmit(action)}
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      noValidate
    >
      {/* What the teacher sees in the preview; the server publishes only if it builds the same. */}
      <input type="hidden" name="previewKey" value={snapshotKey(preview)} />
      <div className="flex flex-col gap-6">
        {state.error || e.form ? <FormMessage tone="error">{state.error ?? e.form}</FormMessage> : null}
        {Object.keys(e).filter((k) => k !== 'form').length ? (
          <FormMessage tone="error">Please check the highlighted parts.</FormMessage>
        ) : null}
        {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}

        <Card as="section" aria-labelledby="ls-teach" className="flex flex-col gap-5 p-4 sm:p-6">
          <h2 id="ls-teach" className="text-[20px] font-bold leading-7">
            What you offer
          </h2>
          <fieldset
            className="m-0 flex flex-col gap-2.5 border-0 p-0"
            aria-describedby="ls-subjects-hint ls-subjects-error"
          >
            <legend className="mb-2.5 p-0 text-sm font-bold leading-5">Subjects</legend>
            <div className="flex flex-wrap gap-2.5">
              {approvedSubjects.map((s) => (
                <label key={s} className={CHOICE}>
                  <input
                    type="checkbox"
                    name="subjects"
                    value={s}
                    checked={subjects.includes(s)}
                    onChange={(ev) => setSubjects((xs) => toggle(xs, s, ev.target.checked))}
                    className="h-[22px] w-[22px] accent-primary"
                  />
                  {SUBJECTS[s as SubjectId]?.name ?? s}
                </label>
              ))}
            </div>
            <Err id="ls-subjects-error" text={e.subjects} />
            <span id="ls-subjects-hint" className="text-sm text-on-surface-variant">
              Only the subjects AA Pro approved on your profile. To add another, change your{' '}
              <Link href="/teacher/profile" className="font-bold underline">
                profile
              </Link>
              ; it is reviewed first.
            </span>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" aria-describedby="ls-grades-error">
            <legend className="mb-2.5 p-0 text-sm font-bold leading-5">Grades</legend>
            <div className="flex flex-wrap gap-2.5">
              {approvedGrades.map((g) => (
                <label key={g} className={CHOICE}>
                  <input
                    type="checkbox"
                    name="grades"
                    value={g}
                    checked={grades.includes(g)}
                    onChange={(ev) => setGrades((xs) => toggle(xs, g, ev.target.checked))}
                    className="h-[22px] w-[22px] accent-primary"
                  />
                  Grade {g}
                </label>
              ))}
            </div>
            <Err id="ls-grades-error" text={e.grades} />
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" aria-describedby="ls-curricula-error">
            <legend className="mb-2.5 p-0 text-sm font-bold leading-5">Curriculum you know well (optional)</legend>
            <div className="flex flex-wrap gap-2.5">
              {curriculaOptions.map((c) => (
                <label key={c} className={CHOICE}>
                  <input
                    type="checkbox"
                    name="curricula"
                    value={c}
                    checked={curricula.includes(c)}
                    onChange={(ev) => setCurricula((xs) => toggle(xs, c, ev.target.checked))}
                    className="h-[22px] w-[22px] accent-primary"
                  />
                  {c}
                </label>
              ))}
            </div>
            <Err id="ls-curricula-error" text={e.curricula} />
          </fieldset>
          <div className="flex max-w-[320px] flex-col gap-1.5">
            <label htmlFor="ls-exp" className="text-sm font-bold leading-5">
              Years of teaching (optional)
            </label>
            <input
              id="ls-exp"
              name="experienceYears"
              inputMode="numeric"
              maxLength={2}
              value={experience}
              onChange={(ev) => setExperience(ev.target.value)}
              aria-invalid={e.experienceYears ? true : undefined}
              aria-describedby="ls-exp-hint ls-exp-error"
              className={cx(FIELD, e.experienceYears ? 'border-error' : '')}
            />
            <Err id="ls-exp-error" text={e.experienceYears} />
            <span id="ls-exp-hint" className="text-sm text-on-surface-variant">
              Shown as “as stated by the teacher”, never as verified.
            </span>
          </div>
          <p className="text-[15px]">
            <strong>How you teach:</strong> Online (Zoom). Online only for now.
          </p>
          <p className="text-[15px]">
            <strong>Usually free:</strong> taken from your weekly times on{' '}
            <Link href="/teacher/availability" className="font-bold underline">
              Availability
            </Link>
            .
          </p>
        </Card>

        <Card as="section" aria-labelledby="ls-prices" className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 id="ls-prices" className="text-[20px] font-bold leading-7">
              Asking prices (up to {PRICES_MAX}, optional)
            </h2>
            <p className="text-[15px] leading-[22px] text-on-surface-variant">
              For information only. Parents pay you directly, as you agree with them. AA Pro never charges, collects or
              pays out money.
            </p>
          </div>
          <Err id="ls-prices-error" text={e.prices} />
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {rows.map((r, i) => (
              <li
                key={r.key}
                className="grid gap-3 rounded-[18px] border border-card-border bg-surface-container-low p-3 sm:grid-cols-2"
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`ls-${r.key}-model`} className="text-sm font-bold">
                    Plan (price {i + 1})
                  </label>
                  <select
                    id={`ls-${r.key}-model`}
                    name="priceModel"
                    value={r.model}
                    onChange={(ev) => setRow(r.key, { model: ev.target.value as PriceModel })}
                    className={FIELD}
                  >
                    {PRICE_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {PRICE_MODEL_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`ls-${r.key}-currency`} className="text-sm font-bold">
                    Currency (price {i + 1})
                  </label>
                  <select
                    id={`ls-${r.key}-currency`}
                    name="priceCurrency"
                    value={r.currency}
                    onChange={(ev) => setRow(r.key, { currency: ev.target.value as Currency })}
                    className={FIELD}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`ls-${r.key}-amount`} className="text-sm font-bold">
                    {r.model === 'hourly' ? 'Amount per hour' : 'Amount per plan'} (price {i + 1})
                  </label>
                  <input
                    id={`ls-${r.key}-amount`}
                    name="priceAmount"
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(ev) => setRow(r.key, { amount: ev.target.value })}
                    className={FIELD}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`ls-${r.key}-minutes`} className="text-sm font-bold">
                    Minutes each (price {i + 1})
                  </label>
                  <input
                    id={`ls-${r.key}-minutes`}
                    name="priceMinutes"
                    inputMode="numeric"
                    value={r.minutes}
                    onChange={(ev) => setRow(r.key, { minutes: ev.target.value })}
                    className={FIELD}
                  />
                </div>
                {r.model !== 'hourly' ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`ls-${r.key}-sessions`} className="text-sm font-bold">
                      Sessions in the plan (price {i + 1})
                    </label>
                    <input
                      id={`ls-${r.key}-sessions`}
                      name="priceSessions"
                      inputMode="numeric"
                      value={r.sessions}
                      onChange={(ev) => setRow(r.key, { sessions: ev.target.value })}
                      className={FIELD}
                    />
                  </div>
                ) : (
                  <input type="hidden" name="priceSessions" value="" />
                )}
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label={`Remove price ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div>
            <Button
              type="button"
              variant="secondary"
              inactive={rows.length >= PRICES_MAX}
              onClick={() =>
                setRows((rs) =>
                  rs.length >= PRICES_MAX
                    ? rs
                    : [
                        ...rs,
                        { key: nextKey++, model: 'hourly', currency: 'INR', amount: '', sessions: '', minutes: '40' },
                      ],
                )
              }
            >
              Add a price
            </Button>
          </div>
          <p className="text-sm text-on-surface-variant">
            Weekly, every-two-weeks and monthly plans need the number of sessions. Sessions are up to 40 minutes. Prices
            are shown in their own currency and never converted.
          </p>
        </Card>

        <Card as="section" aria-labelledby="ls-publish" className="flex flex-col gap-4 p-4 sm:p-6">
          <h2 id="ls-publish" className="text-[20px] font-bold leading-7">
            Before you publish
          </h2>
          <p className="text-[15px] leading-[22px]">
            Anyone on the internet, signed in or not, will see the details in “What parents see”. Your email, phone and
            students are never shown.
          </p>
          <label className="flex items-start gap-3.5 text-[15px] leading-[22px]">
            <input
              type="checkbox"
              name="consent"
              value="yes"
              aria-invalid={e.consent ? true : undefined}
              aria-describedby={e.consent ? 'ls-consent-error' : undefined}
              className="mt-0.5 h-6 w-6 flex-none accent-primary"
            />
            <span>
              I agree to AA Pro showing these details publicly. I can pause or withdraw my listing at any time.
            </span>
          </label>
          <Err id="ls-consent-error" text={e.consent} />
          <p className="text-sm text-on-surface-variant">
            Asked again if you change any of these details. Up to 10 saves a day.
            {shown ? ' Saving a draft keeps your public listing as it is.' : ''}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="intent" value="publish" inactive={pending}>
              {pending ? 'Saving…' : 'Publish'}
            </Button>
            <Button type="submit" name="intent" value="draft" variant="secondary" inactive={pending}>
              Save as draft
            </Button>
          </div>
        </Card>
      </div>

      <Card as="section" aria-labelledby="ls-preview" className="flex flex-col gap-4 p-4 sm:p-6 lg:sticky lg:top-6">
        <h2 id="ls-preview" className="text-[20px] font-bold leading-7">
          What parents see
        </h2>
        <ListingDetails
          listing={preview}
          photoSrc={preview.photoId ? `/teacher-photo/${preview.photoId}` : null}
          timesNote={`Shown here in your time zone (${timeZoneLabel}); parents see their own.`}
        />
        <p className="rounded-[14px] bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">
          Never shown: your email, phone or the children you teach.
        </p>
      </Card>
    </form>
  );
}
