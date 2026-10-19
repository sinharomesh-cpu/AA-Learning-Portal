'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/icons/Icon';
import { TileKey } from '@/components/ui/Panel';
import { PillSelect } from '@/components/ui/PillSelect';
import { TILE } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { FormMessage } from '@/components/forms/FormMessage';
import { keepValuesOnSubmit } from '@/lib/keepValuesOnSubmit';
import { formatMinute, USUAL_TIMES_MAX, WEEKDAYS } from '@/lib/usualTimes';
import { saveUsualTimesAction, type UsualTimesFormState } from './actions';

type Row = { key: number; weekday: string; start: string; end: string };

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
          <li key={r.key} className={cx(TILE, 'gap-3')}>
            <input type="hidden" name="weekday" value={r.weekday} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TileKey>Time {i + 1}</TileKey>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                aria-label={`Remove time ${i + 1}`}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-card-border bg-surface-container-lowest px-3 text-[13px] font-bold text-on-surface-variant hover:border-outline"
              >
                <Icon name="close" size={16} />
                Remove
              </button>
            </div>
            <div role="group" aria-label={`Day ${i + 1}`} className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d, n) => {
                const on = r.weekday === String(n + 1);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${d}, time ${i + 1}`}
                    onClick={() => update(r.key, 'weekday', String(n + 1))}
                    className={cx(
                      'flex h-11 min-w-[52px] cursor-pointer items-center justify-center rounded-[14px] border px-3 text-[15px] font-extrabold',
                      on
                        ? 'border-primary bg-primary text-on-primary shadow-[0_6px_14px_-8px_rgba(0,97,148,.8)]'
                        : 'border-card-border bg-surface-container-lowest text-on-surface hover:border-outline',
                    )}
                  >
                    {d.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PillSelect
                name="start"
                label={`From (time ${i + 1})`}
                value={r.start}
                onChange={(v) => update(r.key, 'start', v)}
                options={STARTS.map((m) => [String(m), formatMinute(m)] as const)}
              />
              <span aria-hidden="true" className="text-on-surface-variant">
                →
              </span>
              <PillSelect
                name="end"
                label={`To (time ${i + 1})`}
                value={r.end}
                onChange={(v) => update(r.key, 'end', v)}
                options={ENDS.map((m) => [String(m), m === 1440 ? '12:00 am (midnight)' : formatMinute(m)] as const)}
              />
            </div>
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
