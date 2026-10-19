'use client';

import { useActionState, useId } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { applyMigrationAction, type MigrationFormState, rollbackMigrationAction } from './actions';

const FIELD =
  'box-border min-h-12 w-full max-w-[260px] rounded-[14px] border-2 border-outline bg-surface-container-lowest px-3 text-base';

/** Apply or roll back, each confirmed by typing a word (deliberately not a single click). */
export function MigrationForm({ kind, disabled }: { kind: 'apply' | 'rollback'; disabled?: boolean }) {
  const [state, action, pending] = useActionState<MigrationFormState, FormData>(
    kind === 'apply' ? applyMigrationAction : rollbackMigrationAction,
    {},
  );
  const id = useId();
  const word = kind === 'apply' ? 'CONVERT' : 'ROLL BACK';
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <label htmlFor={id} className="text-sm font-bold">
        Type {word} to confirm
      </label>
      <input id={id} name="confirm" autoComplete="off" className={FIELD} disabled={disabled} />
      <div>
        <Button type="submit" variant={kind === 'apply' ? 'primary' : 'danger'} inactive={pending || disabled}>
          {pending ? 'Working…' : kind === 'apply' ? 'Convert and turn on' : 'Turn off and roll back'}
        </Button>
      </div>
    </form>
  );
}
