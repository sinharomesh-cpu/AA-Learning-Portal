'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { keepValuesOnSubmit } from '@/lib/keepValuesOnSubmit';
import { formatMinute, USUAL_TIMES_MAX, WEEKDAYS } from '@/lib/usualTimes';
import { saveUsualTimesAction, type UsualTimesFormState } from './actions';

type Row = { key: number; weekday: string; start: string; end: string };

const SELECT = 'min-h-12 w-full rounded-[14px] border-2 border-outline bg-surface-container-lowest px-3 text-base';
const STARTS = Array.from({ length: 48 }, (_, i) => i * 30);
const ENDS = Array.from({ length: 48 }, (_, i) => (i + 1) * 30);

let nextKey = 1000;

/**
 * PR-D1c: usual weekly times (boards D5/D9 "Usually free"). Works without JavaScript too: rows
 * the page sends are saved, and rows without a day are ignored.
 */
export function UsualTimesForm({
  initial,
  timeZoneLabel,
}: {
  initial: Array<{ weekday: number; start: number; end: number }>;
  timeZoneLabel: string;
}) {
  const [state, action, pending] = useActionState<UsualTimesFormState, FormData>(saveUsualTimesAction, {});
  const fromServer = initial.map((r, i) => ({
    key: i,
    weekday: String(r.weekday),
    start: String(r.start),
    end: String(r.end),
  }));
  const blank = (): Row => ({ key: nextKey++, weekday: '', start: '960', end: '1080' });
  const [rows, setRows] = useState<Row[]>(() => (fromServer.length ? fromServer : [blank()]));
  const [seenAt, setSeenAt] = useState<number | undefined>(undefined);
  // After a refused save, show what the teacher sent (adjusting state during render, not in an effect).
  if (state.at !== seenAt) {
    setSeenAt(state.at);
    if (state.rows) setRows(state.rows.map((r) => ({ key: nextKey++, ...r })));
  }

  const update = (key: number, field: 'weekday' | 'start' | 'end', value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  return (
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <p className="text-[15px] leading-[22px] text-on-surface-variant">
        Times are in your time zone ({timeZoneLabel}). Families see them in their own time zone.
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Your usual times">
        {rows.map((r, i) => (
          <li
            key={r.key}
            className="grid gap-3 rounded-[18px] border border-card-border bg-surface-container-low p-3 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`ut-${r.key}-day`} className="text-sm font-bold">
                Day {i + 1}
              </label>
              <select
                id={`ut-${r.key}-day`}
                name="weekday"
                value={r.weekday}
                onChange={(e) => update(r.key, 'weekday', e.target.value)}
                className={SELECT}
              >
                <option value="">Choose a day</option>
                {WEEKDAYS.map((d, n) => (
                  <option key={d} value={n + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`ut-${r.key}-from`} className="text-sm font-bold">
                From (time {i + 1})
              </label>
              <select
                id={`ut-${r.key}-from`}
                name="start"
                value={r.start}
                onChange={(e) => update(r.key, 'start', e.target.value)}
                className={SELECT}
              >
                {STARTS.map((m) => (
                  <option key={m} value={m}>
                    {formatMinute(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`ut-${r.key}-to`} className="text-sm font-bold">
                To (time {i + 1})
              </label>
              <select
                id={`ut-${r.key}-to`}
                name="end"
                value={r.end}
                onChange={(e) => update(r.key, 'end', e.target.value)}
                className={SELECT}
              >
                {ENDS.map((m) => (
                  <option key={m} value={m}>
                    {m === 1440 ? '12:00 am (midnight)' : formatMinute(m)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              aria-label={`Remove time ${i + 1}`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="text-[15px] text-on-surface-variant">No usual times. Saving now clears them.</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          inactive={rows.length >= USUAL_TIMES_MAX}
          onClick={() => setRows((rs) => (rs.length >= USUAL_TIMES_MAX ? rs : [...rs, blank()]))}
        >
          Add a time
        </Button>
        <Button type="submit" inactive={pending}>
          {pending ? 'Saving…' : 'Save times'}
        </Button>
      </div>
    </form>
  );
}
