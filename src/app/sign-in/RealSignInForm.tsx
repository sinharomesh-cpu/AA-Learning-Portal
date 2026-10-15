'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { resendConfirmationAction, signInWithPasswordAction, type FormState } from '@/app/account/actions';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';

/** M-01 email and password sign-in (board 11/45), with the states from the board. */
export function RealSignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signInWithPasswordAction, {});
  const [resend, resendAction, resending] = useActionState<FormState, FormData>(resendConfirmationAction, {});
  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5" noValidate>
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
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
