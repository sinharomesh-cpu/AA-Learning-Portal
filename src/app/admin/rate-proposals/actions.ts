'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { updateRateLimits } from '@/server/rateNegotiations';
import { getRealSession } from '@/server/session';

export interface RateLimitFormState {
  error?: string;
  notice?: string;
}

/** Admin → Rate proposals: the Super Admin changes the limits (CR-13 FR-040.16, OC-99 (7)). */
export async function saveRateLimitsAction(_prev: RateLimitFormState, fd: FormData): Promise<RateLimitFormState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'superadmin') redirect('/sign-in');
  if (!real.session.mfaVerifiedAt) redirect('/security-check');
  const r = await updateRateLimits(db(), real.session.accountId, {
    activePerParent: fd.get('activePerParent'),
    newPerDay: fd.get('newPerDay'),
  });
  if (!r.ok) {
    return {
      error:
        r.reason === 'not_allowed'
          ? 'Only the Super Admin can change these limits.'
          : 'Please enter whole numbers inside the ranges shown.',
    };
  }
  revalidatePath('/admin/rate-proposals');
  return { notice: 'Saved. The new limits apply to the next proposal.' };
}
