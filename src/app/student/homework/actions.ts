'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { saveAnswers, submitExercise } from '@/server/assignments';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getRealSession } from '@/server/session';

/** Board HW6: the student's own homework only; the student comes from the session. */
async function studentId(): Promise<string> {
  if (isDemoMode()) redirect('/student/homework');
  const real = await getRealSession();
  if (!real || real.session.role !== 'student') redirect('/sign-in/child');
  return real.session.accountId;
}

export type SaveAnswersResult = { ok: true } | { ok: false; message: string };

export async function saveAnswersAction(targetId: string, answers: unknown[]): Promise<SaveAnswersResult> {
  const id = await studentId();
  const r = await saveAnswers(db(), id, targetId, answers);
  if (r.ok) return { ok: true };
  if (r.reason === 'closed') return { ok: false, message: 'This homework is already handed in.' };
  if (r.reason === 'invalid') return { ok: false, message: 'Something went wrong. Please reload the page.' };
  return { ok: false, message: 'This homework is no longer available.' };
}

export interface SubmitState {
  error?: string;
  missing?: number[];
}

export async function submitAction(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const id = await studentId();
  const targetId = String(fd.get('targetId') ?? '');
  const r = await submitExercise(db(), id, targetId);
  if (r.ok) {
    revalidatePath('/student/homework');
    redirect(`/student/homework/${targetId}?handed=1`);
  }
  if (r.reason === 'incomplete') {
    const n = r.missing?.map((i) => i + 1) ?? [];
    return {
      error: `Answer every question first. Still to do: question${n.length === 1 ? '' : 's'} ${n.join(', ')}.`,
      missing: r.missing,
    };
  }
  if (r.reason === 'closed') return { error: 'This homework is already handed in.' };
  return { error: 'This homework is no longer available.' };
}
