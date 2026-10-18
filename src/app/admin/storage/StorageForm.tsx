'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import { saveStorageSettingsAction, type StorageFormState } from './actions';

export interface SettingField {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  value: number;
}

/** The five storage safety limits (OC-96); whole numbers inside their ranges. */
export function StorageForm({ fields }: { fields: SettingField[] }) {
  const [state, action, pending] = useActionState<StorageFormState, FormData>(saveStorageSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <TextField
            key={f.key}
            name={f.key}
            label={`${f.label} (${f.unit})`}
            hint={`From ${f.min.toLocaleString('en-GB')} to ${f.max.toLocaleString('en-GB')}`}
            inputMode="numeric"
            type="number"
            min={f.min}
            max={f.max}
            step={1}
            required
            defaultValue={f.value}
          />
        ))}
      </div>
      <div>
        <Button type="submit" variant="primary" inactive={pending}>
          {pending ? 'Saving…' : 'Save limits'}
        </Button>
      </div>
    </form>
  );
}
