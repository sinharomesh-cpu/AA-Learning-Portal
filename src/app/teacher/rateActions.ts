'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { setRateNegotiation } from '@/server/rateNegotiations';
import { getRealSession } from '@/server/session';

/** RN4: the teacher's global "Accept rate proposals" control. The teacher comes from the session only. */
export async function setRateNegotiationAction(_prev: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  const r = await setRateNegotiation(db(), real.session.accountId, fd.get('on') === 'yes');
  if (!r.ok) return { error: 'Your account cannot change this right now.' };
  revalidatePath('/teacher');
  revalidatePath('/teacher/listing');
  return {};
}
