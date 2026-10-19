'use client';

import { type PointerEvent as ReactPointerEvent, useActionState, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { Icon } from '@/components/icons/Icon';
import { TILE, TILE_KEY } from '@/components/ui/styles';
import {
  addToDays,
  changeCount,
  type EditResult,
  formatDuration,
  isLocked,
  listDays,
  type PackageLock,
  removeRange,
  replaceRange,
  totalMinutes,
} from '@/lib/availabilityEdit';
import { cx } from '@/lib/cx';
import { keepValuesOnSubmit } from '@/lib/keepValuesOnSubmit';
import {
  formatMinute,
  sortUsualTimes,
  USUAL_TIMES_MAX,
  type UsualTime,
  WEEKDAYS,
  WEEKDAYS_SHORT,
} from '@/lib/usualTimes';
import { saveUsualTimesAction, type UsualTimesFormState } from './actions';

/**
 * AV0–AV1 (approved 19 Oct 2026): the availability calendar. A week calendar to drag on
 * (desktop), a day list (phone and screen readers), and "Add times" to put one time on several
 * days at once. The whole week is still saved in one go with the same server checks as before;
 * the hidden inputs below mean a save without JavaScript keeps the week unchanged.
 */

const DAYS = [1, 2, 3, 4, 5, 6, 7];
/** Pixels per 30 minutes in the week calendar (36 px an hour). */
const ROW = 18;
const DAY_PX = 48 * ROW;
const FIRST_HOUR_SHOWN = 6;

const end = (m: number) => (m === 1440 ? '12:00 am (midnight)' : formatMinute(m));
/** "4:00–6:00 pm" or "10:00 am–12:00 pm". */
function span(r: { start: number; end: number }) {
  const a = formatMinute(r.start);
  const b = r.end === 1440 ? '12:00 am' : formatMinute(r.end);
  return a.slice(-2) === b.slice(-2) && r.end !== 1440 ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}
/** Short label for narrow calendar blocks: "4–7 pm", "10 am–12 pm", "4:30–6 pm". */
function compact(r: { start: number; end: number }) {
  const f = (m: number) => {
    const x = formatMinute(m % 1440);
    return x.replace(':00 ', ' ');
  };
  const a = f(r.start);
  const b = f(r.end);
  return a.slice(-2) === b.slice(-2) && r.end !== 1440 ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}
const named = (r: UsualTime) => `${WEEKDAYS[r.weekday - 1]} ${span(r)}`;
const same = (a: UsualTime | null, b: UsualTime) =>
  !!a && a.weekday === b.weekday && a.start === b.start && a.end === b.end;

/** Below the desktop layout (1024 px) the add / change panel opens as a bottom sheet. */
const isPhone = () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;

type Message = { tone: 'error' | 'success'; text: string } | null;

function problemText(r: Exclude<EditResult, { ok: true }>): string {
  if (r.reason === 'count')
    return `You can have up to ${USUAL_TIMES_MAX} times a week. Remove or join a time before adding another.`;
  if (r.reason === 'package') {
    const at = r.times.map((t) => `${WEEKDAYS[t.weekday - 1]} ${formatMinute(t.start)}`).join(', ');
    return `Your learning package has a class at ${at}, so this time must stay. Change the package times first.`;
  }
  return 'Choose at least one day, and an end after the start.';
}

export function AvailabilityPlanner({
  initial,
  timeZoneLabel,
  lock,
}: {
  initial: UsualTime[];
  timeZoneLabel: string;
  lock: PackageLock | null;
}) {
  const [state, action, pending] = useActionState<UsualTimesFormState, FormData>(saveUsualTimesAction, {});
  const [saved, setSaved] = useState<UsualTime[]>(() => sortUsualTimes(initial));
  const [ranges, setRanges] = useState<UsualTime[]>(() => sortUsualTimes(initial));
  const [seenAt, setSeenAt] = useState<number | undefined>(undefined);
  const [days, setDays] = useState<number[]>([]);
  const [from, setFrom] = useState(960);
  const [to, setTo] = useState(1080);
  const [editing, setEditing] = useState<UsualTime | null>(null);
  const [copyDays, setCopyDays] = useState<number[]>([]);
  const [sheet, setSheet] = useState(false);
  const [msg, setMsg] = useState<Message>(null);

  // After a save: a refused save shows what was sent; a successful one becomes the saved week.
  if (state.at !== seenAt) {
    setSeenAt(state.at);
    if (state.rows) {
      setRanges(
        sortUsualTimes(
          state.rows.map((r) => ({ weekday: Number(r.weekday), start: Number(r.start), end: Number(r.end) })),
        ),
      );
    } else if (state.notice) {
      setSaved(ranges);
    }
    setMsg(null);
  }

  const changes = changeCount(saved, ranges);
  useEffect(() => {
    if (!changes) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes]);

  const apply = (r: EditResult, ok?: string) => {
    if (r.ok) {
      setRanges(r.ranges);
      setMsg(ok ? { tone: 'success', text: ok } : null);
      return true;
    }
    setMsg({ tone: 'error', text: problemText(r) });
    return false;
  };

  const startAdding = (preset: number[] = []) => {
    setEditing(null);
    setCopyDays([]);
    setDays(preset);
    setMsg(null);
    setSheet(isPhone());
  };
  const startEditing = (r: UsualTime) => {
    setEditing(r);
    setCopyDays([]);
    setFrom(r.start);
    setTo(r.end);
    setMsg(null);
    setSheet(isPhone());
  };
  const add = () => {
    if (
      apply(
        addToDays(ranges, days, from, to, lock),
        `Added ${span({ start: from, end: to })} to ${listDays(days, WEEKDAYS_SHORT)}. Not saved yet.`,
      )
    ) {
      setDays([]);
      setSheet(false);
    }
  };
  const preset = (d: number[], s: number, e: number, label: string) =>
    apply(addToDays(ranges, d, s, e, lock), `Added ${label}. Not saved yet.`);
  const saveEdit = () => {
    if (!editing) return;
    const next = { weekday: editing.weekday, start: from, end: to };
    if (apply(replaceRange(ranges, editing, next, lock), `Changed to ${named(next)}. Not saved yet.`)) {
      setEditing(null);
      setSheet(false);
    }
  };
  const copy = () => {
    if (
      apply(
        addToDays(ranges, copyDays, from, to, lock),
        `Copied ${span({ start: from, end: to })} to ${listDays(copyDays, WEEKDAYS_SHORT)}. Not saved yet.`,
      )
    ) {
      setCopyDays([]);
    }
  };
  const remove = (r: UsualTime) => {
    if (apply(removeRange(ranges, r, lock), `Removed ${named(r)}. Not saved yet.`) && same(editing, r)) {
      setEditing(null);
      setSheet(false);
    }
  };

  const adderProps: AdderProps = {
    error: msg?.tone === 'error' ? msg.text : undefined,
    ranges,
    editing,
    lock,
    days,
    setDays,
    copyDays,
    setCopyDays,
    from,
    to,
    setFrom,
    setTo,
    add,
    preset,
    saveEdit,
    copy,
    remove,
    cancel: () => {
      setEditing(null);
      setSheet(false);
    },
  };

  return (
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-4" noValidate>
      {ranges.map((r) => (
        <span key={`${r.weekday}:${r.start}`} hidden>
          <input type="hidden" name="weekday" value={r.weekday} />
          <input type="hidden" name="start" value={r.start} />
          <input type="hidden" name="end" value={r.end} />
        </span>
      ))}
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice && !changes ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <div aria-live="polite" className="contents">
        {msg?.tone === 'success' ? <FormMessage tone="success">{msg.text}</FormMessage> : null}
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 min-[1440px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="hidden min-w-0 flex-col gap-3 lg:flex">
          <WeekCalendar
            ranges={ranges}
            lock={lock}
            chosen={editing ? [editing.weekday] : days}
            editing={editing}
            onAdd={(d, s, e) =>
              apply(
                addToDays(ranges, [d], s, e, lock),
                `Added ${WEEKDAYS[d - 1]} ${span({ start: s, end: e })}. Not saved yet.`,
              )
            }
            onResize={(old, next) =>
              apply(replaceRange(ranges, old, next, lock), `Changed to ${named(next)}. Not saved yet.`)
            }
            onEdit={startEditing}
            onRemove={remove}
          />
          <Legend />
          <p className="m-0 text-[13px] leading-5 text-on-surface-variant">
            Drag down a day to add a time (30-minute steps). Drag a time&apos;s bottom edge to change its end; click it
            to change or copy it. Scroll the calendar for earlier or later hours.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:max-[1439px]:grid lg:max-[1439px]:grid-cols-2 lg:max-[1439px]:items-start">
          <div className="hidden lg:block">
            <Adder idPrefix="side" {...adderProps} />
          </div>
          <WeekList
            ranges={ranges}
            lock={lock}
            timeZoneLabel={timeZoneLabel}
            editing={editing}
            onAddDay={(d) => startAdding([d])}
            onAddMany={() => startAdding()}
            onEdit={startEditing}
            onRemove={remove}
          />
        </div>
      </div>

      {sheet ? <Sheet onClose={() => setSheet(false)} {...adderProps} /> : null}

      <div
        className={cx(
          'flex flex-wrap items-center justify-between gap-3',
          changes
            ? 'sticky bottom-3 z-30 rounded-[18px] bg-inverse-surface px-4 py-3 text-inverse-on-surface shadow-[0_16px_40px_-12px_rgba(19,27,46,.5)]'
            : 'border-t border-card-border pt-4',
        )}
      >
        <p className={cx('m-0 text-[14px] leading-5', changes ? 'font-bold' : 'text-on-surface-variant')}>
          {changes
            ? `${changes === 1 ? '1 change' : `${changes} changes`} not saved yet`
            : 'Changes are saved together. Times that overlap on the same day are joined into one.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {changes ? (
            <Button
              type="button"
              variant="secondary"

              onClick={() => {
                setRanges(saved);
                setEditing(null);
                setMsg(null);
              }}
            >
              Undo changes
            </Button>
          ) : null}
          <Button type="submit" inactive={pending}>
            {pending ? 'Saving…' : 'Save times'}
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Add / change panel (desktop side column; phone bottom sheet)
 * -------------------------------------------------------------------------------------------- */

interface AdderProps {
  /** A refused change, shown next to the controls that made it. */
  error?: string;
  ranges: UsualTime[];
  editing: UsualTime | null;
  lock: PackageLock | null;
  days: number[];
  setDays: (d: number[]) => void;
  copyDays: number[];
  setCopyDays: (d: number[]) => void;
  from: number;
  to: number;
  setFrom: (m: number) => void;
  setTo: (m: number) => void;
  add: () => void;
  preset: (days: number[], start: number, end: number, label: string) => void;
  saveEdit: () => void;
  copy: () => void;
  remove: (r: UsualTime) => void;
  cancel: () => void;
}

function DayChips({
  label,
  value,
  onChange,
  skip,
}: {
  label: string;
  value: number[];
  onChange: (d: number[]) => void;
  skip?: number;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-7 gap-1.5">
      {DAYS.map((d) => {
        const on = value.includes(d);
        const off = d === skip;
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={WEEKDAYS[d - 1]}
            disabled={off}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            className={cx(
              'flex h-11 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[14px] border px-1 text-[14px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40',
              on
                ? 'border-primary bg-primary text-on-primary shadow-[0_6px_14px_-8px_rgba(0,97,148,.8)]'
                : 'border-card-border bg-surface-container-lowest text-on-surface hover:border-outline',
            )}
          >
            {on ? <Icon name="check" size={14} className="max-sm:hidden" /> : null}
            {WEEKDAYS_SHORT[d - 1]}
          </button>
        );
      })}
    </div>
  );
}

function Nudge({
  label,
  onClick,
  icon,
  disabled,
}: {
  label: string;
  onClick: () => void;
  icon: 'add' | 'remove';
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-card-border bg-surface-container-lowest text-on-surface hover:border-outline disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

const THUMB =
  'pointer-events-none absolute inset-x-0 top-0 m-0 h-10 w-full appearance-none bg-transparent outline-none ' +
  '[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-surface-container-lowest [&::-webkit-slider-thumb]:shadow-[0_4px_10px_-4px_rgba(19,27,46,.5)] ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-surface-container-lowest ' +
  'focus-visible:[&::-webkit-slider-thumb]:outline focus-visible:[&::-webkit-slider-thumb]:outline-[3px] focus-visible:[&::-webkit-slider-thumb]:outline-offset-2 focus-visible:[&::-webkit-slider-thumb]:outline-primary focus-visible:[&::-moz-range-thumb]:outline focus-visible:[&::-moz-range-thumb]:outline-[3px] focus-visible:[&::-moz-range-thumb]:outline-primary';

/** One track, two knobs ("From" and "To"); arrow keys move 30 minutes. */
function TimeRange({ from, to, setFrom, setTo }: Pick<AdderProps, 'from' | 'to' | 'setFrom' | 'setTo'>) {
  const pct = (m: number) => `${(m / 1440) * 100}%`;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-headline text-[24px] font-bold leading-8 sm:text-[26px]">
        <span>{formatMinute(from)}</span>
        <span aria-hidden="true" className="text-[20px] text-on-surface-variant">
          →
        </span>
        <span>{end(to)}</span>
        <span className="ml-auto font-body text-[13px] font-semibold text-on-surface-variant">
          {formatDuration(to - from)}
        </span>
      </p>
      <div className="relative mx-3.5 h-10">
        <span className="absolute inset-x-0 top-[15px] h-2.5 rounded-full bg-surface-container-high" />
        <span
          className="absolute top-[15px] h-2.5 rounded-full bg-primary"
          style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }}
        />
        <input
          type="range"
          aria-label="From"
          aria-valuetext={formatMinute(from)}
          min={0}
          max={1440}
          step={30}
          value={from}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), 1410);
            setFrom(v);
            if (v >= to) setTo(v + 30);
          }}
          className={THUMB}
        />
        <input
          type="range"
          aria-label="To"
          aria-valuetext={end(to)}
          min={0}
          max={1440}
          step={30}
          value={to}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), 30);
            setTo(v);
            if (v <= from) setFrom(v - 30);
          }}
          className={THUMB}
        />
        <div aria-hidden="true" className="absolute inset-x-0 top-[34px] text-[11px] text-on-surface-variant">
          {[0, 360, 720, 1080, 1440].map((m) => (
            <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(m) }}>
              {m === 720 ? 'noon' : m % 1440 === 0 ? '12 am' : `${(m / 60) % 12} ${m < 720 ? 'am' : 'pm'}`}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] text-on-surface-variant">
          From
          <Nudge
            label="Start 30 minutes earlier"
            icon="remove"
            disabled={from <= 0}
            onClick={() => setFrom(from - 30)}
          />
          <Nudge
            label="Start 30 minutes later"
            icon="add"
            disabled={from >= 1410}
            onClick={() => {
              setFrom(from + 30);
              if (from + 30 >= to) setTo(from + 60);
            }}
          />
          <span className="ml-2">To</span>
          <Nudge
            label="End 30 minutes earlier"
            icon="remove"
            disabled={to <= 30}
            onClick={() => {
              setTo(to - 30);
              if (to - 30 <= from) setFrom(to - 60);
            }}
          />
          <Nudge label="End 30 minutes later" icon="add" disabled={to >= 1440} onClick={() => setTo(to + 30)} />
        </span>
        <span className="text-[12px] text-on-surface-variant">30-minute steps</span>
      </div>
    </div>
  );
}

const PRESET =
  'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-outline bg-surface-container-lowest px-3.5 text-[13px] font-extrabold text-on-surface-variant hover:border-primary hover:text-primary';

function Adder(p: AdderProps & { idPrefix: string; titleId?: string; bare?: boolean }) {
  const id = useId();
  const titleId = p.titleId ?? `${p.idPrefix}-${id}`;
  const r = p.editing;
  const locked = r ? isLocked(r, p.lock) : false;
  return (
    <section
      aria-labelledby={titleId}
      className={cx(TILE, 'gap-4 bg-surface-container-lowest p-4 sm:p-5', p.bare && 'border-0 p-0 sm:p-0')}
    >
      <h3 id={titleId} className={cx(TILE_KEY, 'm-0')}>
        {r ? `Change ${named(r)}` : 'Add times · choose one or more days'}
      </h3>
      {p.error ? <FormMessage tone="error">{p.error}</FormMessage> : null}
      {r ? null : <DayChips label="Days" value={p.days} onChange={p.setDays} />}
      <TimeRange from={p.from} to={p.to} setFrom={p.setFrom} setTo={p.setTo} />
      {r ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={p.saveEdit} className="flex-1">
              Save this change
            </Button>
            {locked ? null : (
              <Button type="button" variant="secondary" onClick={() => p.remove(r)}>
                Remove
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={p.cancel}>
              Cancel
            </Button>
          </div>
          {locked ? (
            <p className="m-0 flex gap-2 text-[13px] leading-5 text-on-surface-variant">
              <Icon name="lock" size={16} />
              Your learning package has a class in this time, so it can&apos;t be removed or shortened past the class.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 border-t border-card-border pt-4">
            <span className={TILE_KEY}>Copy this time to other days</span>
            <DayChips label="Copy to" value={p.copyDays} onChange={p.setCopyDays} skip={r.weekday} />
            <Button type="button" variant="secondary" inactive={!p.copyDays.length} onClick={p.copy}>
              {p.copyDays.length ? `Copy to ${listDays(p.copyDays, WEEKDAYS_SHORT)}` : 'Choose days to copy to'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Button type="button" onClick={p.add} inactive={!p.days.length} className="w-full">
            <Icon name="add" size={18} />
            {p.days.length ? `Add to ${listDays(p.days, WEEKDAYS_SHORT)}` : 'Choose days first'}
          </Button>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-on-surface-variant">Quick start</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={PRESET}
                onClick={() => p.preset([1, 2, 3, 4, 5], 960, 1080, 'weekday afternoons 4:00–6:00 pm')}
              >
                Weekday afternoons 4–6 pm
              </button>
              <button
                type="button"
                className={PRESET}
                onClick={() => p.preset([6, 7], 600, 720, 'weekend mornings 10:00 am–12:00 pm')}
              >
                Weekend mornings 10 am–12 pm
              </button>
            </div>
            <span className="text-[12px] leading-4 text-on-surface-variant">
              To copy a day, choose one of its times, then &quot;Copy this time to other days&quot;.
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Sheet(p: AdderProps & { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const { onClose } = p;
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(19,27,46,.45)]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-surface-container-lowest px-4 pb-6 pt-2 shadow-[0_-12px_40px_-8px_rgba(19,27,46,.35)]"
      >
        <div className="flex justify-center py-1">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-outline-variant" />
        </div>
        <div className="flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 cursor-pointer items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <Adder idPrefix="sheet" titleId={titleId} bare {...p} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Week list: the summary beside the calendar (desktop) and the day list (phone). This is also
 * how screen reader and keyboard users read and change the week.
 * -------------------------------------------------------------------------------------------- */

function WeekList({
  ranges,
  lock,
  timeZoneLabel,
  editing,
  onAddDay,
  onAddMany,
  onEdit,
  onRemove,
}: {
  ranges: UsualTime[];
  lock: PackageLock | null;
  timeZoneLabel: string;
  editing: UsualTime | null;
  onAddDay: (d: number) => void;
  onAddMany: () => void;
  onEdit: (r: UsualTime) => void;
  onRemove: (r: UsualTime) => void;
}) {
  return (
    <section
      aria-labelledby="your-week"
      className={cx(TILE, 'gap-3 bg-surface-container-lowest p-4 sm:p-5 max-lg:border-0 max-lg:p-0 max-lg:sm:p-0')}
    >
      <div className="flex flex-col gap-0.5">
        <h3 id="your-week" className={cx(TILE_KEY, 'm-0')}>
          Your week · {ranges.length} of {USUAL_TIMES_MAX} times · {formatDuration(totalMinutes(ranges))}
        </h3>
        <span className="text-[13px] text-on-surface-variant">In your time zone ({timeZoneLabel})</span>
      </div>
      <div className="lg:hidden">
        <Button type="button" onClick={onAddMany} inactive={ranges.length >= USUAL_TIMES_MAX} className="w-full">
          <Icon name="add" size={18} />
          Add times to several days
        </Button>
      </div>
      {ranges.length === 0 ? (
        <p className="m-0 hidden rounded-[16px] border border-dashed border-card-border p-4 text-center text-[14px] text-on-surface-variant lg:block">
          <b className="block text-on-surface">No usual times yet</b>
          Add the times you are usually free. Families see them as a guide.
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {DAYS.map((d) => {
          const mine = ranges.filter((r) => r.weekday === d);
          return (
            <li
              key={d}
              className={cx(
                'flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-3',
                'max-lg:rounded-[18px] max-lg:border max-lg:border-card-border max-lg:bg-surface-container-lowest max-lg:p-3',
                mine.length ? '' : 'max-lg:border-dashed max-lg:bg-surface-container-low/60 lg:hidden',
              )}
            >
              <div className="flex items-center justify-between gap-2 lg:w-11 lg:pt-1.5">
                <b className="text-[15px]">
                  <span className="lg:hidden">{WEEKDAYS[d - 1]}</span>
                  <span className="max-lg:hidden">{WEEKDAYS_SHORT[d - 1]}</span>
                </b>
                <button
                  type="button"
                  onClick={() => onAddDay(d)}
                  aria-label={`Add a time on ${WEEKDAYS[d - 1]}`}
                  className={cx(PRESET, 'min-h-9 lg:hidden')}
                >
                  <Icon name="add" size={14} />
                  Add
                </button>
              </div>
              {mine.length ? (
                <div className="flex flex-wrap gap-2">
                  {mine.map((r) => {
                    const locked = isLocked(r, lock);
                    const on = same(editing, r);
                    return (
                      <span
                        key={r.start}
                        className={cx(
                          'inline-flex min-h-9 items-center rounded-full border text-[13px] font-extrabold',
                          locked
                            ? 'border-success-border bg-success-container text-on-success-container'
                            : 'border-primary-fixed-dim bg-primary-fixed/50 text-on-primary-fixed',
                          on && 'outline outline-[3px] outline-offset-1 outline-primary',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onEdit(r)}
                          aria-label={`Change ${named(r)}${locked ? ' (used by your learning package)' : ''}`}
                          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-transparent pl-3 pr-2 font-extrabold text-inherit"
                        >
                          {locked ? <Icon name="lock" size={14} /> : null}
                          {span(r)}
                        </button>
                        {locked ? (
                          <span className="pr-3 text-[12px] font-semibold max-sm:hidden">Package</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRemove(r)}
                            aria-label={`Remove ${named(r)}`}
                            className="mr-1 flex size-7 cursor-pointer items-center justify-center rounded-full bg-transparent text-inherit hover:bg-surface-container-lowest/70"
                          >
                            <Icon name="close" size={14} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span className="text-[13px] text-on-surface-variant lg:hidden">Not usually free</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Week calendar (desktop). Pointer only: the week list above does the same for keyboard and
 * screen reader users, so the calendar is hidden from them to avoid saying everything twice.
 * -------------------------------------------------------------------------------------------- */

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-on-surface-variant">
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block size-3.5 rounded bg-primary" />
        Usually free
      </span>
      {/* GREEN (#13774a) matches the package colour used on the listing page. */}
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block size-3.5 rounded bg-[#13774a]" />
        Used by your learning package (can&apos;t remove)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block size-3.5 rounded border border-dashed border-primary bg-primary/15" />
        Being added
      </span>
    </div>
  );
}

type Drag = { day: number; anchor: number; start: number; end: number };
type Resize = { range: UsualTime; end: number };

function WeekCalendar({
  ranges,
  lock,
  chosen,
  editing,
  onAdd,
  onResize,
  onEdit,
  onRemove,
}: {
  ranges: UsualTime[];
  lock: PackageLock | null;
  chosen: number[];
  editing: UsualTime | null;
  onAdd: (day: number, start: number, end: number) => void;
  onResize: (old: UsualTime, next: UsualTime) => void;
  onEdit: (r: UsualTime) => void;
  onRemove: (r: UsualTime) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = FIRST_HOUR_SHOWN * 2 * ROW - ROW;
  }, []);

  const minuteAt = (e: ReactPointerEvent, col: Element, round: 'floor' | 'ceil') => {
    const y = e.clientY - col.getBoundingClientRect().top;
    const steps = Math[round](y / ROW);
    return Math.max(0, Math.min(1440, steps * 30));
  };

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-[22px] border border-card-border bg-surface-container-lowest"
    >
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-card-border bg-surface-container-low/50">
        <span />
        {DAYS.map((d) => {
          const total = totalMinutes(ranges.filter((r) => r.weekday === d));
          return (
            <span
              key={d}
              className={cx(
                'flex h-[54px] flex-col items-center justify-center border-l border-card-border/60 text-[12px] font-extrabold uppercase tracking-[.06em]',
                chosen.includes(d) ? 'bg-primary-fixed/60 text-on-primary-fixed' : 'text-on-surface-variant',
              )}
            >
              {WEEKDAYS_SHORT[d - 1]}
              {total ? (
                <b className="text-[11px] normal-case tracking-normal text-on-success-container">
                  {formatDuration(total)}
                </b>
              ) : null}
            </span>
          );
        })}
      </div>
      <div ref={scroller} className="max-h-[594px] overflow-y-auto">
        <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: DAY_PX }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-on-surface-variant"
                style={{ top: h * 2 * ROW }}
              >
                {h === 12 ? 'noon' : `${h % 12} ${h < 12 ? 'am' : 'pm'}`}
              </span>
            ))}
          </div>
          {DAYS.map((d) => (
            <div
              key={d}
              data-day={d}
              className="relative cursor-crosshair touch-none select-none border-l border-card-border/60"
              style={{
                backgroundImage: 'linear-gradient(var(--color-card-border) 1px, transparent 1px)',
                backgroundSize: `100% ${2 * ROW}px`,
              }}
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget || e.button !== 0) return;
                const m = Math.min(1410, minuteAt(e, e.currentTarget, 'floor'));
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ day: d, anchor: m, start: m, end: m + 30 });
              }}
              onPointerMove={(e) => {
                if (drag?.day === d) {
                  const lo = Math.min(1410, minuteAt(e, e.currentTarget, 'floor'));
                  const hi = Math.max(30, minuteAt(e, e.currentTarget, 'ceil'));
                  setDrag({ ...drag, start: Math.min(drag.anchor, lo), end: Math.max(drag.anchor + 30, hi) });
                } else if (resize?.range.weekday === d) {
                  const m = Math.round((e.clientY - e.currentTarget.getBoundingClientRect().top) / ROW) * 30;
                  setResize({ ...resize, end: Math.max(resize.range.start + 30, Math.min(1440, m)) });
                }
              }}
              onPointerUp={() => {
                if (drag?.day === d) {
                  onAdd(d, drag.start, drag.end);
                  setDrag(null);
                } else if (resize?.range.weekday === d) {
                  if (resize.end !== resize.range.end) onResize(resize.range, { ...resize.range, end: resize.end });
                  setResize(null);
                }
              }}
              onPointerCancel={() => {
                setDrag(null);
                setResize(null);
              }}
            >
              {ranges
                .filter((r) => r.weekday === d)
                .map((r) => {
                  const locked = isLocked(r, lock);
                  const shownEnd = resize && same(resize.range, r) ? resize.end : r.end;
                  const short = shownEnd - r.start <= 30;
                  const tall = shownEnd - r.start >= 90;
                  return (
                    <div
                      key={r.start}
                      className={cx(
                        'group absolute inset-x-1.5 flex flex-col overflow-hidden rounded-[12px] px-2 text-white shadow-[0_8px_18px_-10px_rgba(0,97,148,.9)]',
                        locked ? 'bg-[#13774a]' : 'bg-[#006194]',
                        short ? 'justify-center py-0' : 'py-1.5',
                        same(editing, r) && 'outline outline-[3px] outline-offset-1 outline-on-surface',
                      )}
                      style={{ top: (r.start / 30) * ROW + 2, height: ((shownEnd - r.start) / 30) * ROW - 4 }}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => onEdit(r)}
                        className="absolute inset-0 cursor-pointer bg-transparent"
                      />
                      <span className="pointer-events-none relative text-[12px] font-extrabold leading-[15px]">
                        {compact({ start: r.start, end: shownEnd })}
                      </span>
                      {tall ? (
                        <span className="pointer-events-none relative text-[11px] font-semibold leading-[14px] opacity-90">
                          {locked ? 'Package class' : formatDuration(shownEnd - r.start)}
                        </span>
                      ) : null}
                      {locked ? (
                        <span className="pointer-events-none absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-white/20">
                          <Icon name="lock" size={12} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => onRemove(r)}
                          className="absolute right-1 top-1 flex size-5 cursor-pointer items-center justify-center rounded-full bg-[#004b73] text-white opacity-0 hover:bg-[#003354] group-hover:opacity-100"
                        >
                          <Icon name="close" size={12} />
                        </button>
                      )}
                      <span
                        className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center pb-[3px]"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const col = e.currentTarget.closest('[data-day]');
                          if (!col) return;
                          (col as HTMLElement).setPointerCapture(e.pointerId);
                          setResize({ range: r, end: r.end });
                        }}
                      >
                        <span className="h-1 w-6 rounded-full bg-white/60" />
                      </span>
                    </div>
                  );
                })}
              {drag?.day === d ? (
                <div
                  className="pointer-events-none absolute inset-x-1.5 rounded-[12px] border-2 border-dashed border-primary bg-primary/15 px-2 py-1 text-[12px] font-extrabold text-on-primary-fixed"
                  style={{ top: (drag.start / 30) * ROW + 2, height: ((drag.end - drag.start) / 30) * ROW - 4 }}
                >
                  {compact(drag)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
