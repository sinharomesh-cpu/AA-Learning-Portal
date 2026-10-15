'use client';

import { useActionState } from 'react';
import {
  changePasswordAction,
  confirmEmailAction,
  forgotPasswordAction,
  resetPasswordAction,
  type FormState,
} from '@/app/account/actions';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';

/** Small client forms for the account pages (WP2-3). All checks run again on the server. */

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmEmailAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" inactive={pending}>
        Confirm my email
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <Button type="submit" inactive={pending}>
        Send reset link
      </Button>
    </form>
  );
}

export function NewPasswordForm({ token, purpose }: { token: string; purpose: 'password_reset' | 'set_password' }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="purpose" value={purpose} />
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. A phrase with spaces is fine."
        error={e.password}
        required
      />
      <TextField
        label="Type it again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={e.confirm}
        required
      />
      <Button type="submit" inactive={pending}>
        {purpose === 'set_password' ? 'Save password and continue' : 'Save new password'}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextField
        label="Current password"
        name="current"
        type="password"
        autoComplete="current-password"
        error={e.current}
        required
      />
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. You will be signed out everywhere and sign in again."
        error={e.password}
        required
      />
      <TextField
        label="Type it again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={e.confirm}
        required
      />
      <Button type="submit" inactive={pending}>
        Change password
      </Button>
    </form>
  );
}
