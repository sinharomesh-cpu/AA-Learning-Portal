import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'size'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Marks the field as wrong without its own message (the form shows one message for all). */
  invalid?: boolean;
  /** `child` = 56 px tall with 18 px text, for child-facing forms. */
  size?: 'md' | 'child';
  className?: string;
}

/** Labelled input with hint and error wiring (aria-describedby, aria-invalid). */
export function TextField({ label, hint, error, invalid, size = 'md', className, ...inputProps }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cx('font-bold', size === 'child' ? 'text-base' : 'text-sm leading-5')}>
        {label}
      </label>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error || invalid ? true : undefined}
        className={cx(
          'box-border w-full rounded-[16px] border-2 bg-surface-container-lowest px-4 font-body font-medium text-on-surface',
          size === 'child' ? 'min-h-14 text-[18px]' : 'min-h-[52px] text-base',
          error || invalid ? 'border-error' : 'border-outline',
        )}
        {...inputProps}
      />
      {error ? (
        <span id={errorId} className="text-sm font-bold leading-5 text-on-error-container">
          {error}
        </span>
      ) : null}
      {hint ? (
        <span id={hintId} className="text-sm leading-5 text-on-surface-variant">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
