'use client';

import { type ReactNode } from 'react';
import { FormMessage } from '@/components/forms/FormMessage';
import { Icon } from '@/components/icons/Icon';
import { FilterPopover, OPTION } from '@/components/listing/TeacherSearch';
import { cx } from '@/lib/cx';
import { CURRENCIES, type Currency } from '@/lib/listing';
import { formatMinute } from '@/lib/usualTimes';
import { HEAD, TILE, TILE_KEY } from './builderStyles';
import type { OfferFormState } from './offerActions';

export { SHELL, TILE, TILE_KEY } from './builderStyles';

/**
 * Shared parts of the teacher listing page's approved design (OC-108, boards PT0–PT1): card shell
 * with a tinted header, numbered sections, steppers, a price field with the homepage-style
 * currency panel, choice cards and status badges. Used by hourly lessons, the learning package and
 * the listing status card (OC-109) so the page reads as one design.
 */

export function CardHead({
  id,
  title,
  intro,
  badge,
}: {
  id: string;
  title: string;
  intro: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className={HEAD}>
      <div className="flex max-w-[60ch] flex-col gap-1">
        <h2 id={id} className="font-headline text-[26px] font-bold leading-8">
          {title}
        </h2>
        <p className="text-[15px] leading-[22px] text-on-surface-variant">{intro}</p>
      </div>
      {badge}
    </div>
  );
}

export const SYMBOL: Record<Currency, string> = { INR: '₹', SGD: 'S$', USD: 'US$' };

/** "5–6 pm", "10 am–12 pm", "4:30–6 pm": short labels for the usual-time windows. */
export function windowText(start: number, end: number): string {
  const a = formatMinute(start).replace(':00', '');
  const b = formatMinute(end).replace(':00', '');
  const [at, ap] = [a.slice(0, -3), a.slice(-2)];
  return ap === b.slice(-2) ? `${at}–${b}` : `${a}–${b}`;
}
export const int = (s: string) => (/^\d{1,3}$/.test(s.trim()) ? Number(s.trim()) : NaN);

const SQUARE =
  'flex size-11 flex-none cursor-pointer items-center justify-center rounded-[14px] border border-card-border bg-surface-container-lowest text-on-surface hover:border-outline disabled:cursor-not-allowed disabled:opacity-40';

export function Stepper({
  id,
  name,
  label: text,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  hint: string;
}) {
  const n = int(value);
  const move = (d: number) => {
    const base = Number.isNaN(n) ? min : n;
    onChange(String(Math.min(max, Math.max(min, base + d))));
  };
  return (
    <div className={TILE}>
      <label htmlFor={id} className={TILE_KEY}>
        {text}
      </label>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className={SQUARE}
          aria-label={`Fewer: ${text}`}
          disabled={!Number.isNaN(n) && n <= min}
          onClick={() => move(-step)}
        >
          <Icon name="remove" size={18} />
        </button>
        <input
          id={id}
          name={name}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
          className="h-11 w-[72px] min-w-0 rounded-[12px] border border-transparent bg-transparent text-center font-headline text-[28px] font-bold text-on-surface outline-none focus:border-primary focus:bg-surface-container-lowest"
        />
        <button
          type="button"
          className={SQUARE}
          aria-label={`More: ${text}`}
          disabled={!Number.isNaN(n) && n >= max}
          onClick={() => move(step)}
        >
          <Icon name="add" size={18} />
        </button>
      </div>
      <span id={`${id}-hint`} className="text-[13px] leading-[18px] text-on-surface-variant">
        {hint}
      </span>
    </div>
  );
}

/** Big amount field with the currency symbol and the homepage-style currency panel. */
export function PriceField({
  id,
  name,
  label,
  value,
  onChange,
  currency,
  onCurrency,
  suffix,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  currency: Currency;
  onCurrency: (c: Currency) => void;
  suffix?: string;
  hint: ReactNode;
}) {
  return (
    <div className={TILE}>
      <label htmlFor={id} className={TILE_KEY}>
        {label}
      </label>
      <div className="flex min-h-[60px] flex-wrap items-center gap-2 rounded-[18px] border border-transparent bg-surface-container-low py-1.5 pl-4 pr-2 focus-within:border-primary focus-within:bg-surface-container-lowest focus-within:ring-4 focus-within:ring-primary/15">
        <span aria-hidden="true" className="font-headline text-[24px] font-bold text-on-surface-variant">
          {SYMBOL[currency]}
        </span>
        <input
          id={id}
          name={name}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          aria-describedby={`${id}-hint`}
          className="h-11 min-w-[100px] flex-1 border-0 bg-transparent font-headline text-[28px] font-bold text-on-surface outline-none"
        />
        {suffix ? <span className="text-[15px] font-bold text-on-surface-variant">{suffix}</span> : null}
        <FilterPopover label="Currency" value={currency} active={false} align="right">
          <>
            {CURRENCIES.map((x) => (
              <button
                key={x}
                type="button"
                className={OPTION}
                aria-pressed={currency === x}
                onClick={() => onCurrency(x)}
              >
                {x} ({SYMBOL[x]}) {currency === x ? <Icon name="check" size={18} /> : null}
              </button>
            ))}
          </>
        </FilterPopover>
      </div>
      <span id={`${id}-hint`} className="text-[13px] leading-[18px] text-on-surface-variant">
        {hint}
      </span>
    </div>
  );
}

export function Result({ state }: { state: OfferFormState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.problems?.length)
    return (
      <FormMessage tone="error">
        {state.problems.length === 1 ? (
          state.problems[0]
        ) : (
          <ul className="m-0 list-disc pl-5">
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </FormMessage>
    );
  if (state.notice) return <FormMessage tone="success">{state.notice}</FormMessage>;
  return null;
}

export function Badge({
  tone,
  icon,
  children,
}: {
  tone: 'good' | 'bad' | 'neutral';
  icon?: 'check' | 'info';
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold',
        tone === 'good' && 'bg-[#c8f1da] text-[#00391f]',
        tone === 'bad' && 'bg-error-container text-on-error-container',
        tone === 'neutral' && 'bg-surface-container text-on-surface-variant',
      )}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </span>
  );
}

export function Step({ n, state, children }: { n: number; state: 'done' | 'now' | 'todo'; children: ReactNode }) {
  return (
    <li
      aria-current={state === 'now' ? 'step' : undefined}
      className={cx(
        'inline-flex h-[34px] items-center gap-2 rounded-full pl-1.5 pr-3.5 text-sm font-bold',
        state === 'done' && 'bg-[#e3f6ec] text-[#005236] dark:bg-[#0e2a1d] dark:text-[#b2e3c8]',
        state === 'now' && 'bg-primary-fixed/50 text-on-primary-fixed-variant',
        state === 'todo' && 'bg-surface-container-low text-on-surface-variant',
      )}
    >
      <span
        className={cx(
          'flex size-6 items-center justify-center rounded-full border text-xs font-extrabold',
          state === 'done' && 'border-[#13774a] bg-[#13774a] text-white',
          state === 'now' && 'border-primary bg-primary text-on-primary',
          state === 'todo' && 'border-card-border bg-surface-container-lowest',
        )}
      >
        {state === 'done' ? <Icon name="check" size={14} /> : n}
      </span>
      {children}
      {state === 'done' ? <span className="sr-only">(done)</span> : null}
    </li>
  );
}

export function Section({ n, id, title, children }: { n: number; id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-b border-card-border px-5 py-5 sm:px-6">
      <h3 id={id} className="flex items-center gap-2.5 text-[18px] font-extrabold leading-6">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-[10px] bg-on-surface text-sm text-surface"
        >
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ChoiceCard({
  checked,
  onChange,
  icon,
  title,
  text,
}: {
  checked: boolean;
  onChange: () => void;
  icon: 'lock' | 'forum';
  title: string;
  text: string;
}) {
  return (
    <label
      className={cx(
        'relative flex cursor-pointer items-start gap-3 rounded-[20px] border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
        checked ? 'border-2 border-primary bg-primary-fixed/30' : 'border-card-border bg-surface-container-lowest',
      )}
    >
      <input
        type="radio"
        name="pk-negotiable"
        checked={checked}
        onChange={onChange}
        className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0"
      />
      <span
        className={cx(
          'flex size-10 flex-none items-center justify-center rounded-[14px]',
          icon === 'forum' ? 'bg-[#e3f6ec] text-[#005236]' : 'bg-surface-container text-on-surface',
        )}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="flex flex-col gap-0.5">
        <strong className="text-[15px]">{title}</strong>
        <span className="text-[13px] leading-[18px] text-on-surface-variant">{text}</span>
      </span>
    </label>
  );
}
