'use client';

import Link from 'next/link';
import { Chip, PanelHead } from '@/components/ui/Panel';
import { SHELL, TILE_KEY } from '@/components/ui/styles';
import { useActionState, useState } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { TIME_ZONES } from '@/config/timeZones';
import { SUBJECT_IDS, SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { type ChildFormState, createChildAction, giveChildConsentAction, updateChildAction } from './actions';

/**
 * Parent forms for children (WP2-4): M-06 consent, M-08 create and edit. All values are checked
 * again on the server; these forms only make the common case easy.
 */

export interface ChildProfileValues {
  name: string;
  grade: number;
  curriculum: string | null;
  timeZone: string;
  subjects: string[];
  avatar: string;
}

export const AVATAR_STYLE: Record<string, { label: string; bg: string; ring: string; path: React.ReactNode }> = {
  star: {
    label: 'Blue star',
    bg: 'bg-primary-fixed',
    ring: 'text-on-primary-fixed-variant',
    path: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />,
  },
  sun: {
    label: 'Orange sun',
    bg: 'bg-secondary-fixed',
    ring: 'text-on-secondary-fixed-variant',
    path: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
  },
  leaf: {
    label: 'Green leaf',
    bg: 'bg-success-container',
    ring: 'text-on-tertiary-fixed-variant',
    path: (
      <>
        <path d="M5 19c8 0 14-6 14-14C11 5 5 11 5 19z" />
        <path d="M5 19l8-8" />
      </>
    ),
  },
  moon: {
    label: 'Purple moon',
    bg: 'bg-surface-container',
    ring: 'text-on-surface-variant',
    path: <path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" />,
  },
};

export function AvatarIcon({ avatar, size = 26 }: { avatar: string; size?: number }) {
  const a = AVATAR_STYLE[avatar] ?? AVATAR_STYLE.star!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={a.ring}
    >
      {a.path}
    </svg>
  );
}

function FieldError({ id, children }: { id: string; children?: string }) {
  return children ? (
    <span id={id} className="text-sm font-bold leading-5 text-on-error-container">
      {children}
    </span>
  ) : null;
}

/** The "About your child", "Subjects" and "Picture" sections of M-08 (board 18). */
function ProfileSections({
  initial,
  state,
  curricula,
}: {
  initial: ChildProfileValues;
  state: ChildFormState;
  curricula: readonly string[];
}) {
  const v = state.values;
  const e = state.fieldErrors ?? {};
  const val = (key: string, fallback: string) => (typeof v?.[key] === 'string' ? (v[key] as string) : fallback);
  const subjects = Array.isArray(v?.subjects) ? (v.subjects as string[]) : initial.subjects;
  const avatar = val('avatar', initial.avatar) || 'star';
  const name = val('name', initial.name) || 'your child';
  return (
    <>
      <section aria-labelledby="about-child" className={SHELL}>
        <PanelHead id="about-child" title="About your child" />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              label="First name (shown in the app)"
              name="name"
              autoComplete="off"
              maxLength={40}
              required
              defaultValue={val('name', initial.name)}
              error={e.name}
            />
            <SelectField
              label="Grade"
              name="grade"
              defaultValue={val('grade', String(initial.grade))}
              error={e.grade}
              options={Array.from({ length: 12 }, (_, i) => [String(i + 1), `Grade ${i + 1}`] as const)}
            />
            <SelectField
              label="Curriculum"
              name="curriculum"
              defaultValue={val('curriculum', initial.curriculum ?? '')}
              error={e.curriculum}
              hint="The list is configured by AA Pro."
              options={[['', 'Not set'] as const, ...curricula.map((c) => [c, c] as const)]}
            />
            <SelectField
              label="Time zone"
              name="timeZone"
              defaultValue={val('timeZone', initial.timeZone)}
              error={e.timeZone}
              hint="Defaults to yours. All times are shown in this zone for your child."
              options={TIME_ZONES}
              wide
            />
          </div>
          <p className="text-sm leading-5 text-on-surface-variant">
            We don&apos;t ask for date of birth, surname, school or a photo.
          </p>
        </div>
      </section>

      <section aria-labelledby="child-subjects" className={SHELL}>
        <PanelHead id="child-subjects" title="Subjects" />
        <div className="flex flex-col gap-3.5 px-5 py-5 sm:px-6">
          <fieldset
            className="m-0 flex flex-wrap gap-2.5 border-0 p-0"
            aria-describedby={e.subjects ? 'child-subjects-error' : undefined}
          >
            <legend className={cx(TILE_KEY, 'float-left mb-1 p-0')}>
              Choose the subjects {name} can learn on AA Pro
            </legend>
            {SUBJECT_IDS.map((id) => (
              <Chip key={id} name="subjects" value={id} defaultChecked={subjects.includes(id)}>
                {SUBJECTS[id].name}
              </Chip>
            ))}
          </fieldset>
          <FieldError id="child-subjects-error">{e.subjects}</FieldError>
        </div>
      </section>

      <section aria-labelledby="child-picture" className={SHELL}>
        <PanelHead id="child-picture" title="Picture" />
        <div className="flex flex-col gap-3.5 px-5 py-5 sm:px-6">
          <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
            <legend className="mb-2.5 p-0 text-sm leading-5 text-on-surface-variant">
              Pick an illustration. Photo upload is not offered.
            </legend>
            {Object.entries(AVATAR_STYLE).map(([key, a]) => (
              <label
                key={key}
                className={cx(
                  'flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-[3px] border-transparent has-[:checked]:border-primary has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                  a.bg,
                )}
              >
                <input type="radio" name="avatar" value={key} defaultChecked={avatar === key} className="sr-only" />
                <span className="sr-only">{a.label}</span>
                <AvatarIcon avatar={key} />
              </label>
            ))}
          </fieldset>
        </div>
      </section>
    </>
  );
}

/** Shown once after creating a child or resetting a password (board 18, step 2). */
export function CredentialsCard({
  credentials,
  children,
}: {
  credentials: NonNullable<ChildFormState['credentials']>;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[20px] border border-primary bg-primary-fixed/40 p-4 sm:p-5"
      data-testid="child-credentials"
    >
      <span className="text-xs font-bold uppercase tracking-[.06em] text-on-surface-variant">
        {credentials.childName}&apos;s sign-in details · shown once
      </span>
      <dl className="m-0 grid gap-2 sm:grid-cols-[auto_1fr] sm:gap-x-6">
        <dt className="text-sm font-bold">Username</dt>
        <dd className="m-0 break-all font-mono text-[18px] font-bold" data-testid="child-username">
          {credentials.username}
        </dd>
        <dt className="text-sm font-bold">Password</dt>
        <dd className="m-0 break-all font-mono text-[18px] font-bold" data-testid="child-password">
          {credentials.password}
        </dd>
      </dl>
      <p className="text-sm leading-5">
        Write these down or give them to {credentials.childName} now. You won&apos;t see this password again. Your child
        signs in on the child sign-in page.
      </p>
      {children}
    </div>
  );
}

export function CreateChildForm({ initial, curricula }: { initial: ChildProfileValues; curricula: readonly string[] }) {
  const [state, action, pending] = useActionState<ChildFormState, FormData>(createChildAction, {});
  if (state.credentials) {
    return (
      <CredentialsCard credentials={state.credentials}>
        <div className="clear-both flex flex-wrap gap-2">
          <LinkButton href="/parent/children">Done</LinkButton>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Add another child
          </Button>
        </div>
      </CredentialsCard>
    );
  }
  const e = state.fieldErrors ?? {};
  const username = typeof state.values?.username === 'string' ? state.values.username : '';
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {Object.keys(e).length ? <FormMessage tone="error">Please check the highlighted fields.</FormMessage> : null}
      <ProfileSections initial={initial} state={state} curricula={curricula} />
      <section aria-labelledby="child-sign-in" className={SHELL}>
        <PanelHead id="child-sign-in" title="Sign-in details" />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              label="Username"
              name="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              required
              defaultValue={username}
              hint="Letters and numbers. AA Pro adds 4 numbers so every username is unique, for example kiran-4821. Please don't use a surname."
              error={e.username}
            />
            <TextField
              label="Password (optional)"
              name="password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              hint="At least 8 characters. Leave it empty and we'll make an easy-to-type one."
              error={e.password}
            />
          </div>
          <p className="text-sm leading-5 text-on-surface-variant">
            You&apos;ll see the password once on the next screen. After that nobody can see it, including you and AA Pro
            staff; you can only replace it.
          </p>
        </div>
      </section>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" inactive={pending}>
          {pending ? 'Adding…' : 'Add child'}
        </Button>
        <LinkButton href="/parent/children" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

export function EditChildForm({
  childId,
  initial,
  curricula,
}: {
  childId: string;
  initial: ChildProfileValues;
  curricula: readonly string[];
}) {
  const [state, action, pending] = useActionState<ChildFormState, FormData>(updateChildAction, {});
  const hasErrors = Object.keys(state.fieldErrors ?? {}).length > 0;
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="childId" value={childId} />
      {hasErrors ? <FormMessage tone="error">Please check the highlighted fields.</FormMessage> : null}
      <ProfileSections initial={initial} state={state} curricula={curricula} />
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" inactive={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        <LinkButton href="/parent/children" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

/** M-06 privacy notice and guardian consent (board 16), before the first child is added. */
export function ConsentForm() {
  const [state, action, pending] = useActionState<ChildFormState, FormData>(giveChildConsentAction, {});
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const ready = Boolean(ticked.guardian && ticked.aiTutor);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <h2 className="text-[22px] font-bold leading-7">Your choices</h2>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {(
        [
          [
            'guardian',
            'Required:',
            'I am the parent or legal guardian, and I agree to AA Pro creating and managing an account for my child as described above.',
          ],
          [
            'aiTutor',
            'Required to use the AI Tutor:',
            "I agree that lesson context and my child's voice are processed during AI lessons, without storing raw audio.",
          ],
          [
            'emailReminders',
            'Optional:',
            'Send me booking confirmations and reminders by email. You can add WhatsApp later when it is available.',
          ],
        ] as const
      ).map(([name, lead, text]) => (
        <label
          key={name}
          className="flex items-start gap-3.5 rounded-[16px] border-2 border-card-border p-4 text-[15px] leading-[22px]"
        >
          <input
            type="checkbox"
            name={name}
            value="yes"
            onChange={(event) => setTicked((t) => ({ ...t, [name]: event.target.checked }))}
            className="mt-0.5 h-6 w-6 flex-none accent-primary"
          />
          <span>
            <strong>{lead}</strong> {text}
          </span>
        </label>
      ))}
      <p id="consent-help" className="text-sm leading-5 text-on-surface-variant">
        Tick both required boxes to continue. We record which version of this notice you agreed to, and when.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" inactive={pending || !ready} aria-describedby="consent-help">
          Agree and continue
        </Button>
        <Link href="/#safety" className="inline-flex min-h-12 items-center text-[15px] font-bold">
          Read about safety and privacy
        </Link>
      </div>
    </form>
  );
}
