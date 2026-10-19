'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { FilterPopover, OPTION } from '@/components/listing/TeacherSearch';

/**
 * A drop-down in the homepage search style (OC-105, OC-110): a pill button that opens a small
 * panel of choices, with a hidden input carrying the value in the form. Used instead of the
 * browser's own select on signed-in pages.
 */
export function PillSelect({
  name,
  label,
  options,
  defaultValue,
  value: controlled,
  onChange,
  align = 'left',
  wide,
}: {
  name?: string;
  label: string;
  options: ReadonlyArray<readonly [string, string]>;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  align?: 'left' | 'right';
  wide?: boolean;
}) {
  const [own, setOwn] = useState(defaultValue ?? options[0]?.[0] ?? '');
  const value = controlled ?? own;
  const text = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <FilterPopover label={label} value={text} active={false} align={align} wide={wide}>
        <div className="-mx-1 flex max-h-[320px] flex-col gap-0.5 overflow-y-auto px-1">
          {options.map(([v, t]) => (
            <button
              key={v}
              type="button"
              className={OPTION}
              aria-pressed={value === v}
              onClick={() => {
                setOwn(v);
                onChange?.(v);
              }}
            >
              <span className="min-w-0 truncate">{t}</span>
              {value === v ? <Icon name="check" size={18} className="flex-none" /> : null}
            </button>
          ))}
        </div>
      </FilterPopover>
    </>
  );
}
