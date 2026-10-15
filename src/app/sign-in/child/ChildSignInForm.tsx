'use client';

import { useActionState } from 'react';
import { childSignInAction, type FormState } from '@/app/account/actions';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';

/** M-02 child sign-in (boards 12/13): large fields, plain words, the same message for any mistake. */
export function ChildSignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(childSignInAction, {});
  const locked = state.error?.startsWith("Let's take a break");
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormMessage tone={locked ? 'warning' : 'error'}>{state.error}</FormMessage> : null}
      <TextField
        label="Your username"
        name="username"
        size="child"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        defaultValue={state.values?.username}
        invalid={Boolean(state.error && !locked)}
      />
      <TextField
        label="Your password"
        name="password"
        type="password"
        size="child"
        autoComplete="current-password"
        required
        invalid={Boolean(state.error && !locked)}
      />
      <Button type="submit" size="child" inactive={pending}>
        {pending ? 'Checking…' : "Let's go"}
      </Button>
    </form>
  );
}
