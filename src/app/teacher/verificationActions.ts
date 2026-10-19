'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';
import { requestVerification } from '@/server/teacherVerification';

export interface VerificationRequestState {
  error?: string;
  notice?: string;
}

const REFUSED: Record<string, string> = {
  not_found: 'Your account cannot ask for this.',
  not_eligible: 'Only approved, active teachers can ask to be verified.',
  email_unconfirmed: 'Confirm your email address first, then ask again.',
  already_pending: 'You have already asked. AA Pro will review it.',
  already_verified: 'You are already verified.',
};

/**
 * CR-15 §5.1: the teacher asks to be checked. The teacher comes from the session only
 * (useActionState also passes the previous state and the form data; neither is needed).
 */
export async function requestVerificationAction(): Promise<VerificationRequestState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  const r = await requestVerification(db(), real.session.accountId);
  revalidatePath('/teacher');
  if (r.ok)
    return { notice: 'Request sent. AA Pro will review your profile and check your identity on a short video call.' };
  return { error: REFUSED[r.reason] ?? REFUSED.not_found };
}
