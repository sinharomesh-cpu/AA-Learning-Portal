'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import { TIME_ZONES } from '@/config/timeZones';
import { SUBJECT_IDS, SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { saveTeacherProfileAction, type TeacherProfileFormState } from './actions';

/**
 * M-20 teacher onboarding and M-22 profile edit (board M-20/M-22). Every value is checked again
 * on the server; the form only makes the common case easy.
 */
export interface TeacherProfileValues {
  name: string;
  email: string;
  timeZone: string;
  subjects: string[];
  grades: number[];
  bio: string;
}

export type ProfileMode = 'draft' | 'changes_requested' | 'submitted' | 'approved';

const CHOICE =
  'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-full border-2 border-outline px-4 text-[15px] font-bold has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';
const SELECT = 'min-h-[52px] rounded-[16px] border-2 bg-surface-container-lowest px-4 text-base';
const BIO_MAX = 1000;

function FieldError({ id, children }: { id: string; children?: string }) {
  return children ? (
    <span id={id} className="text-sm font-bold leading-5 text-on-error-container">
      {children}
    </span>
  ) : null;
}

export function TeacherProfileForm({
  initial,
  mode,
  needTerms,
}: {
  initial: TeacherProfileValues;
  mode: ProfileMode;
  /** Before approval, until the teacher has accepted the terms once. */
  needTerms: boolean;
}) {
  const [state, action, pending] = useActionState<TeacherProfileFormState, FormData>(saveTeacherProfileAction, {});
  const v = state.values;
  const e = state.fieldErrors ?? {};
  const str = (key: string, fallback: string) => (typeof v?.[key] === 'string' ? (v[key] as string) : fallback);
  const subjects = Array.isArray(v?.subjects) ? (v.subjects as string[]) : initial.subjects;
  const grades = Array.isArray(v?.grades) ? (v.grades as string[]).map(Number) : initial.grades;
  const [bioLength, setBioLength] = useState([...str('bio', initial.bio)].length);
  const hasErrors = Object.keys(e).length > 0;
  const approved = mode === 'approved';

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {hasErrors ? <FormMessage tone="error">Please check the highlighted fields.</FormMessage> : null}
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <Card as="section" aria-labelledby="tp-about" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="tp-about" className="text-[20px] font-bold leading-7">
          About you
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="Name shown to families"
            name="name"
            autoComplete="name"
            maxLength={80}
            required
            defaultValue={str('name', initial.name)}
            hint='For example "Teacher A. Rao". Please don’t add phone numbers or other contact details.'
            error={e.name}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold leading-5">Contact email</span>
            <span className="flex min-h-[52px] items-center break-all rounded-[16px] bg-surface-container-low px-4 text-base">
              {initial.email}
            </span>
            <span className="text-sm leading-5 text-on-surface-variant">
              Your sign-in email. Families never see it. To change it, contact AA Pro support.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tp-timeZone" className="text-sm font-bold leading-5">
              Your time zone
            </label>
            <select
              id="tp-timeZone"
              name="timeZone"
              defaultValue={str('timeZone', initial.timeZone)}
              aria-invalid={e.timeZone ? true : undefined}
              aria-describedby={['tp-timeZone-hint', e.timeZone ? 'tp-timeZone-error' : ''].filter(Boolean).join(' ')}
              className={cx(SELECT, e.timeZone ? 'border-error' : 'border-outline')}
            >
              {TIME_ZONES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <FieldError id="tp-timeZone-error">{e.timeZone}</FieldError>
            <span id="tp-timeZone-hint" className="text-sm leading-5 text-on-surface-variant">
              Families see your times in their own time zone.
            </span>
          </div>
        </div>
      </Card>

      <Card as="section" aria-labelledby="tp-teaching" className="flex flex-col gap-5 p-4 sm:p-6">
        <h2 id="tp-teaching" className="text-[20px] font-bold leading-7">
          What you teach
        </h2>
        {approved ? (
          <FormMessage tone="info">
            Changing your subjects or grades sends them to the AA Pro team for review. Until then you keep teaching your
            approved subjects and grades.
          </FormMessage>
        ) : null}
        <fieldset
          className="m-0 flex flex-col gap-2.5 border-0 p-0"
          aria-describedby={e.subjects ? 'tp-subjects-error' : undefined}
        >
          <legend className="mb-2.5 p-0 text-sm font-bold leading-5">Subjects you teach</legend>
          <div className="flex flex-wrap gap-2.5">
            {SUBJECT_IDS.map((id) => (
              <label key={id} className={CHOICE}>
                <input
                  type="checkbox"
                  name="subjects"
                  value={id}
                  defaultChecked={subjects.includes(id)}
                  className="h-[22px] w-[22px] accent-primary"
                />
                {SUBJECTS[id].name}
              </label>
            ))}
          </div>
          <FieldError id="tp-subjects-error">{e.subjects}</FieldError>
        </fieldset>
        <fieldset
          className="m-0 flex flex-col gap-2.5 border-0 p-0"
          aria-describedby={e.grades ? 'tp-grades-error' : undefined}
        >
          <legend className="mb-2.5 p-0 text-sm font-bold leading-5">Grades you teach</legend>
          <div className="flex flex-wrap gap-2.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
              <label key={g} className={CHOICE}>
                <input
                  type="checkbox"
                  name="grades"
                  value={g}
                  defaultChecked={grades.includes(g)}
                  className="h-[22px] w-[22px] accent-primary"
                />
                Grade {g}
              </label>
            ))}
          </div>
          <FieldError id="tp-grades-error">{e.grades}</FieldError>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tp-bio" className="text-sm font-bold leading-5">
            About you (short)
          </label>
          <textarea
            id="tp-bio"
            name="bio"
            rows={5}
            maxLength={BIO_MAX}
            defaultValue={str('bio', initial.bio)}
            onChange={(ev) => setBioLength([...ev.target.value].length)}
            aria-invalid={e.bio ? true : undefined}
            aria-describedby={['tp-bio-hint', e.bio ? 'tp-bio-error' : ''].filter(Boolean).join(' ')}
            className={cx(
              'min-h-[120px] w-full rounded-[16px] border-2 bg-surface-container-lowest px-4 py-3 text-base',
              e.bio ? 'border-error' : 'border-outline',
            )}
          />
          <FieldError id="tp-bio-error">{e.bio}</FieldError>
          <span id="tp-bio-hint" className="text-sm leading-5 text-on-surface-variant">
            Your teaching experience and approach, in a few sentences. Families see this when choosing a teacher. (
            {bioLength}/{BIO_MAX})
          </span>
        </div>
        <p className="text-sm leading-5 text-on-surface-variant">
          AA Pro does not show ratings, reviews or badges on teacher profiles.
        </p>
      </Card>

      {needTerms ? (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3.5 text-[15px] leading-[22px]">
            <input
              type="checkbox"
              name="terms"
              value="yes"
              defaultChecked={str('terms', '') === 'yes'}
              aria-invalid={e.terms ? true : undefined}
              aria-describedby={e.terms ? 'tp-terms-error' : undefined}
              className="mt-0.5 h-6 w-6 flex-none accent-primary"
            />
            <span>
              I agree to the{' '}
              <Link href="/teacher-terms" target="_blank">
                AA Pro teacher terms (draft, opens in a new tab)
              </Link>
              .
            </span>
          </label>
          <FieldError id="tp-terms-error">{e.terms}</FieldError>
        </div>
      ) : null}

      {state.notice ? (
        <FormMessage tone={state.outcome === 'saved_change_pending' ? 'info' : 'success'}>{state.notice}</FormMessage>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {mode === 'draft' || mode === 'changes_requested' ? (
          <>
            <Button type="submit" name="intent" value="submit" inactive={pending}>
              {pending ? 'Saving…' : mode === 'changes_requested' ? 'Send again for approval' : 'Send for approval'}
            </Button>
            <Button type="submit" name="intent" value="draft" variant="secondary" inactive={pending}>
              Save draft
            </Button>
          </>
        ) : (
          <Button type="submit" name="intent" value="submit" inactive={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
    </form>
  );
}
