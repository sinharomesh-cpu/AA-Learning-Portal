'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { resendConfirmationAction, signInWithPasswordAction, type FormState } from '@/app/account/actions';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';

/** M-01 email and password sign-in (board 11/45), with the states from the board. */
export function RealSignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signInWithPasswordAction, {});
  const [resend, resendAction, resending] = useActionState<FormState, FormData>(resendConfirmationAction, {});
  const [as, setAs] = useState<'parent' | 'teacher'>(state.values?.signInAs === 'teacher' ? 'teacher' : 'parent');
  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5" noValidate>
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        {/* OC-59: a guide only. The account's own role decides which portal opens, so either choice works. */}
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" aria-describedby="sign-in-as-hint">
          <legend className="mb-2.5 p-0 text-[15px] font-bold">I am signing in as…</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['parent', 'A parent', 'Children, teachers and books'],
                ['teacher', 'A teacher', 'Your teaching home'],
              ] as const
            ).map(([value, title, detail]) => (
              <label
                key={value}
                className="flex min-h-[72px] cursor-pointer items-center gap-3.5 rounded-[24px] border-2 border-transparent bg-surface-container-low px-4 py-3 hover:bg-surface-container has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
              >
                <input
                  type="radio"
                  name="signInAs"
                  value={value}
                  checked={as === value}
                  onChange={() => setAs(value)}
                  aria-describedby={`as-${value}`}
                  className="h-[22px] w-[22px] flex-none accent-primary"
                />
                <span className="flex flex-col">
                  <strong className="font-headline text-[18px] leading-6">{title}</strong>
                  <span id={`as-${value}`} className="text-body-sm text-on-surface-variant">
                    {detail}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <span id="sign-in-as-hint" className="text-sm leading-5 text-on-surface-variant">
            {as === 'parent'
              ? "Use the email you registered with. You'll go to your family home."
              : "Use the email you registered with. You'll go to your teaching home."}{' '}
            AA Pro always opens the portal that belongs to your account.
          </span>
        </fieldset>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
        />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        <Link href="/forgot-password" className="-mt-1 self-end text-[15px] font-bold">
          Forgot password?
        </Link>
        <Button type="submit" inactive={pending} className="min-h-14 text-[17px]">
          {pending ? 'Signing in…' : 'Sign in'}
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
      </form>
      {state.needsConfirm ? (
        <form action={resendAction} className="flex flex-col gap-3">
          <input type="hidden" name="email" value={state.values?.email ?? ''} />
          {resend.notice ? <FormMessage tone="success">{resend.notice}</FormMessage> : null}
          {resend.error ? <FormMessage tone="error">{resend.error}</FormMessage> : null}
          <Button type="submit" variant="secondary" inactive={resending}>
            Send a new confirmation link
          </Button>
        </form>
      ) : null}
    </div>
  );
}
