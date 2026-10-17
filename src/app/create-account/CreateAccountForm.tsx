'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUpAction, type FormState } from '@/app/account/actions';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import { TIME_ZONES } from '@/config/timeZones';

/** Board 62: create a parent or teacher account (OC-38). Children never sign up themselves. */
export function CreateAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const role = v.role === 'teacher' ? 'teacher' : 'parent';
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" aria-describedby={e.role ? 'role-error' : undefined}>
        <legend className="mb-2.5 p-0 text-[15px] font-bold">I am…</legend>
        {(
          [
            ['parent', 'A parent', 'Add your children, choose their teachers and share books.', 'Family account'],
            [
              'teacher',
              'A teacher',
              'Teach your students. The AA Pro team checks your profile first.',
              'Approval needed',
            ],
          ] as const
        ).map(([value, title, hint, chip]) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3.5 rounded-[28px] border-2 border-transparent bg-surface-container-low p-4 hover:bg-surface-container has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
          >
            <input
              type="radio"
              name="role"
              value={value}
              defaultChecked={role === value}
              aria-describedby={`role-${value}-hint`}
              className="mt-1 h-[22px] w-[22px] flex-none accent-primary"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <strong className="font-headline text-[19px] leading-7">{title}</strong>
                <span
                  aria-hidden="true"
                  className={
                    value === 'parent'
                      ? 'rounded-full bg-primary-fixed px-2.5 py-0.5 text-label-sm text-on-primary-fixed-variant'
                      : 'rounded-full bg-[var(--pub-violet-bg)] px-2.5 py-0.5 text-label-sm text-[var(--pub-violet)]'
                  }
                >
                  {chip}
                </span>
              </span>
              <span id={`role-${value}-hint`} className="text-sm leading-5 text-on-surface-variant">
                {hint}
              </span>
            </span>
          </label>
        ))}
        {e.role ? (
          <span id="role-error" className="text-sm font-bold text-on-error-container">
            {e.role}
          </span>
        ) : null}
      </fieldset>
      <TextField label="Your name" name="name" autoComplete="name" defaultValue={v.name} error={e.name} required />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={v.email}
        error={e.email}
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. A phrase with spaces is fine."
        error={e.password}
        required
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="timeZone" className="text-sm font-bold leading-5">
          Time zone
        </label>
        <select
          id="timeZone"
          name="timeZone"
          defaultValue={v.timeZone ?? 'Asia/Kolkata'}
          className="min-h-[52px] rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 text-base text-on-surface"
        >
          {TIME_ZONES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {e.timeZone ? <span className="text-sm font-bold text-on-error-container">{e.timeZone}</span> : null}
      </div>
      <label className="flex items-start gap-3 text-[15px] leading-[22px]">
        <input
          type="checkbox"
          name="consent"
          value="yes"
          className="h-[22px] w-[22px] flex-none accent-primary"
          aria-describedby={e.consent ? 'consent-error' : undefined}
        />
        <span>I have read the privacy notice and agree to the terms.</span>
      </label>
      {e.consent ? (
        <span id="consent-error" className="-mt-3 text-sm font-bold text-on-error-container">
          {e.consent}
        </span>
      ) : null}
      <Button type="submit" inactive={pending} className="min-h-14 text-[17px]">
        {pending ? 'Creating your account…' : 'Create account'}
        {pending ? null : (
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-surface-container-low px-5 py-3.5">
        <span className="text-body-md">Already have an account?</span>
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center rounded-full bg-primary-fixed px-5 font-bold text-on-primary-fixed-variant no-underline"
        >
          Sign in
        </Link>
      </div>
    </form>
  );
}
