'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { UsualTime } from '@/lib/usualTimes';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';
import { saveUsualTimes } from '@/server/teacherUsualTimes';

export interface UsualTimesFormState {
  error?: string;
  notice?: string;
  rows?: Array<{ weekday: string; start: string; end: string }>;
  at?: number;
}

const list = (fd: FormData, key: string) => fd.getAll(key).map((v) => (typeof v === 'string' ? v : ''));

/** PR-D1c: the teacher saves their usual weekly times (the teacher comes from the session only). */
export async function saveUsualTimesAction(_prev: UsualTimesFormState, fd: FormData): Promise<UsualTimesFormState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  const days = list(fd, 'weekday');
  const starts = list(fd, 'start');
  const ends = list(fd, 'end');
  const rows = days.map((weekday, i) => ({ weekday, start: starts[i] ?? '', end: ends[i] ?? '' }));
  const filled = rows.filter((r) => r.weekday !== '');
  const ranges: UsualTime[] = filled.map((r) => ({
    weekday: Number(r.weekday),
    start: /^\d{1,4}$/.test(r.start) ? Number(r.start) : NaN,
    end: /^\d{1,4}$/.test(r.end) ? Number(r.end) : NaN,
  }));
  const r = await saveUsualTimes(db(), real.session.accountId, ranges);
  if (!r.ok) {
    if (r.reason === 'not_allowed') redirect('/teacher/status');
    const error = {
      count: 'You can add up to 14 times.',
      invalid: 'Each time needs a day, and the end must be after the start.',
      overlap: 'Two times on the same day overlap. Please join them into one or change one of them.',
    }[r.reason];
    return { error, rows: filled, at: Date.now() };
  }
  revalidatePath('/teacher/availability');
  return {
    notice: r.count
      ? 'Saved. Families will see these times, in their own time zone, on your listing.'
      : 'Saved. You have no usual times now.',
    at: Date.now(),
  };
}
