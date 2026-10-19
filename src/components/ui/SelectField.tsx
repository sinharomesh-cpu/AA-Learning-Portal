'use client';

import type { ReactNode } from 'react';
import { PillSelect } from './PillSelect';

/**
 * A form drop-down in the homepage search style (OC-110): the pill shows the label and the chosen
 * value; a hidden input sends the value with the form. Hint and error sit underneath.
 */
export function SelectField({
  name,
  label,
  options,
  defaultValue,
  value,
  onChange,
  hint,
  error,
  wide,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<readonly [string, string]>;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex">
        <PillSelect
          name={name}
          label={label}
          options={options}
          defaultValue={defaultValue}
          value={value}
          onChange={onChange}
          wide={wide}
        />
      </div>
      {error ? <span className="text-sm font-bold leading-5 text-on-error-container">{error}</span> : null}
      {hint ? <span className="text-[13px] leading-[18px] text-on-surface-variant">{hint}</span> : null}
    </div>
  );
}
