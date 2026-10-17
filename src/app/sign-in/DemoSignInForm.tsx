'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { cx } from '@/lib/cx';
import type { SignInState } from './actions';

export interface PersonaChoice {
  id: string;
  label: string;
  detail: string;
}

interface DemoSignInFormProps {
  action: (state: SignInState, formData: FormData) => Promise<SignInState>;
  choices: PersonaChoice[];
  legend: string;
  submitLabel: string;
  variant: 'adult' | 'child';
}

/** Demo-only sign-in (OC-27): choose a synthetic persona. No password is asked for or stored. */
export function DemoSignInForm({ action, choices, legend, submitLabel, variant }: DemoSignInFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const child = variant === 'child';
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="rounded-[16px] border border-error-border bg-error-container px-4 py-3.5 text-[15px] leading-[22px] text-on-error-container"
        >
          {state.error}
        </p>
      ) : null}
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className={cx('mb-3 p-0 font-bold', child ? 'text-lg' : 'text-sm leading-5')}>{legend}</legend>
        {choices.map((choice, index) => (
          <label
            key={choice.id}
            className={cx(
              'flex cursor-pointer items-center gap-3 rounded-[20px] border-2 border-outline bg-surface-container-lowest px-4 has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40',
              child ? 'min-h-14 text-[18px] font-bold' : 'min-h-[52px] text-base',
            )}
          >
            <input
              type="radio"
              name="persona"
              value={choice.id}
              defaultChecked={index === 0}
              className="h-5 w-5 accent-primary"
            />
            <span className="flex flex-col">
              <span className="font-bold">{choice.label}</span>
              {choice.detail ? (
                <span className="text-sm font-medium leading-5 text-on-surface-variant">{choice.detail}</span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" size={child ? 'child' : 'md'} inactive={pending}>
        {pending ? 'Signing in…' : submitLabel}
      </Button>
    </form>
  );
}
