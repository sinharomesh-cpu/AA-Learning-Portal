'use client';

import Link from 'next/link';
import { Chip, PanelHead, TickCard, TileKey } from '@/components/ui/Panel';
import { INPUT, SHELL, TILE, TILE_KEY } from '@/components/ui/styles';
import { PillSelect } from '@/components/ui/PillSelect';
import { useActionState, useState } from 'react';
import { Button } from '@/components/Button';
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
  curricula: string[];
  experienceYears: number | null;
}

export type ProfileMode = 'draft' | 'changes_requested' | 'submitted' | 'approved';

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
  curriculaOptions,
}: {
  initial: TeacherProfileValues;
  mode: ProfileMode;
  /** Before approval, until the teacher has accepted the terms once. */
  needTerms: boolean;
  /** The curricula offered (OC-58), passed from the server. */
  curriculaOptions: readonly string[];
}) {
  const [state, action, pending] = useActionState<TeacherProfileFormState, FormData>(saveTeacherProfileAction, {});
  const v = state.values;
  const e = state.fieldErrors ?? {};
  const str = (key: string, fallback: string) => (typeof v?.[key] === 'string' ? (v[key] as string) : fallback);
  const subjects = Array.isArray(v?.subjects) ? (v.subjects as string[]) : initial.subjects;
  const grades = Array.isArray(v?.grades) ? (v.grades as string[]).map(Number) : initial.grades;
  const curricula = Array.isArray(v?.curricula) ? (v.curricula as string[]) : initial.curricula;
  const [bioLength, setBioLength] = useState([...str('bio', initial.bio)].length);
  const hasErrors = Object.keys(e).length > 0;
  const approved = mode === 'approved';

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {hasErrors ? <FormMessage tone="error">Please check the highlighted fields.</FormMessage> : null}
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <section aria-labelledby="tp-about" className={SHELL}>
        <PanelHead id="tp-about" title="About you" />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
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
            <div className={TILE}>
              <TileKey>Contact email</TileKey>
              <span className="break-all text-[17px] font-bold">{initial.email}</span>
              <span className="text-[13px] leading-[18px] text-on-surface-variant">
                Your sign-in email. Families never see it. To change it, contact AA Pro support.
              </span>
            </div>
            <div className={TILE}>
              <TileKey>Your time zone</TileKey>
              <div className="flex">
                <PillSelect
                  name="timeZone"
                  label="Time zone"
                  options={TIME_ZONES}
                  defaultValue={str('timeZone', initial.timeZone)}
                  wide
                />
              </div>
              <FieldError id="tp-timeZone-error">{e.timeZone}</FieldError>
              <span className="text-[13px] leading-[18px] text-on-surface-variant">
                Families see your times in their own time zone.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="tp-teaching" className={SHELL}>
        <PanelHead id="tp-teaching" title="What you teach" />
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
          {approved ? (
            <FormMessage tone="info">
              Changing your subjects or grades sends them to the AA Pro team for review. Until then you keep teaching
              your approved subjects and grades.
            </FormMessage>
          ) : null}
          <fieldset className={cx(TILE, 'm-0')} aria-describedby={e.subjects ? 'tp-subjects-error' : undefined}>
            <legend className={cx(TILE_KEY, 'float-left mb-1 p-0')}>Subjects you teach</legend>
            <div className="clear-both flex flex-wrap gap-2">
              {SUBJECT_IDS.map((id) => (
                <Chip key={id} name="subjects" value={id} defaultChecked={subjects.includes(id)}>
                  {SUBJECTS[id].name}
                </Chip>
              ))}
            </div>
            <FieldError id="tp-subjects-error">{e.subjects}</FieldError>
          </fieldset>
          <fieldset className={cx(TILE, 'm-0')} aria-describedby={e.grades ? 'tp-grades-error' : undefined}>
            <legend className={cx(TILE_KEY, 'float-left mb-1 p-0')}>Grades you teach</legend>
            <div className="clear-both flex flex-wrap gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <Chip key={g} name="grades" value={g} defaultChecked={grades.includes(g)}>
                  Grade {g}
                </Chip>
              ))}
            </div>
            <FieldError id="tp-grades-error">{e.grades}</FieldError>
          </fieldset>
          <fieldset
            className={cx(TILE, 'm-0')}
            aria-describedby={['tp-curricula-hint', e.curricula ? 'tp-curricula-error' : ''].filter(Boolean).join(' ')}
          >
            <legend className={cx(TILE_KEY, 'float-left mb-1 p-0')}>Curricula you teach (optional)</legend>
            <div className="clear-both flex flex-wrap gap-2">
              {curriculaOptions.map((c) => (
                <Chip key={c} name="curricula" value={c} defaultChecked={curricula.includes(c)}>
                  {c}
                </Chip>
              ))}
            </div>
            <FieldError id="tp-curricula-error">{e.curricula}</FieldError>
            <span id="tp-curricula-hint" className="text-sm leading-5 text-on-surface-variant">
              Saved at once. If you publish a listing later, families see this as stated by you.
            </span>
          </fieldset>
          <div className="max-w-[320px]">
            <TextField
              label="Years of teaching experience (optional)"
              name="experienceYears"
              inputMode="numeric"
              maxLength={2}
              defaultValue={str(
                'experienceYears',
                initial.experienceYears === null ? '' : String(initial.experienceYears),
              )}
              hint="Whole years, 0 to 60. Saved at once; shown “as stated by the teacher” on a listing."
              error={e.experienceYears}
            />
          </div>
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
              className={cx(INPUT, 'min-h-[120px] w-full py-3', e.bio ? 'border-error' : '')}
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
        </div>
      </section>

      {needTerms ? (
        <div className="flex flex-col gap-1.5">
          <TickCard
            name="terms"
            value="yes"
            defaultChecked={str('terms', '') === 'yes'}
            aria-invalid={e.terms ? true : undefined}
            aria-describedby={e.terms ? 'tp-terms-error' : undefined}
          >
            I agree to the{' '}
            <Link href="/teacher-terms" target="_blank">
              AA Pro teacher terms (draft, opens in a new tab)
            </Link>
            .
          </TickCard>
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
