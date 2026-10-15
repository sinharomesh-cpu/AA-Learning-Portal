'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUpAction, type FormState } from '@/app/account/actions';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';

const TIME_ZONES = [
  ['Asia/Kolkata', 'India (IST)'],
  ['Asia/Singapore', 'Singapore (GMT+8)'],
  ['Asia/Dubai', 'Dubai (GMT+4)'],
  ['Europe/London', 'London (UK time)'],
  ['America/New_York', 'New York (US Eastern)'],
] as const;

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
            ['parent', 'A parent', 'Add your children, choose their teachers and share books.'],
            ['teacher', 'A teacher', 'Teach your students. The AA Pro team checks your profile first.'],
          ] as const
        ).map(([value, title, hint]) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3.5 rounded-[20px] border-2 border-outline bg-white p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40"
          >
            <input
              type="radio"
              name="role"
              value={value}
              defaultChecked={role === value}
              className="mt-0.5 h-[22px] w-[22px] accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <strong className="text-[17px]">{title}</strong>
              <span className="text-sm leading-5 text-on-surface-variant">{hint}</span>
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
          className="min-h-[52px] rounded-[16px] border-2 border-outline bg-white px-4 text-base"
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
      <Button type="submit" inactive={pending}>
        {pending ? 'Creating your account…' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-on-surface-variant">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-bold underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
