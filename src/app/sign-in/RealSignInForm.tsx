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
          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                ['parent', 'A parent'],
                ['teacher', 'A teacher'],
              ] as const
            ).map(([value, title]) => (
              <label
                key={value}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[20px] border-2 border-outline bg-white px-4 has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40"
              >
                <input
                  type="radio"
                  name="signInAs"
                  value={value}
                  checked={as === value}
                  onChange={() => setAs(value)}
                  className="h-[22px] w-[22px] flex-none accent-primary"
                />
                <strong className="text-[16px]">{title}</strong>
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
        <Link href="/forgot-password" className="self-start text-[15px] font-bold">
          Forgot password?
        </Link>
        <Button type="submit" inactive={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
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
