'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';
import { decideVerification, NOTE_MAX, revokeVerification } from '@/server/teacherVerification';

/**
 * CR-15 §5.1 (OC-106 (2)): the Super Admin's verification decisions. The actor comes from the
 * server-side session after the security-code step; the server functions check again in the
 * database that they are the active Super Admin.
 */
export interface VerificationFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function superAdmin(): Promise<string> {
  const real = await getRealSession();
  if (!real || (real.session.role !== 'superadmin' && real.session.role !== 'admin')) redirect('/sign-in');
  if (!real.session.mfaVerifiedAt) redirect('/security-check');
  return real.session.accountId;
}

const NOT_ALLOWED: VerificationFormState = { error: 'Only the Super Admin can decide verification.' };
const NOTE: Record<string, string> = {
  note_required: 'Write a short note (required).',
  note_too_long: `Keep the note under ${NOTE_MAX} characters.`,
  note_has_number: 'Remove the long number. Do not type ID numbers.',
};

export async function decideVerificationAction(
  _prev: VerificationFormState,
  fd: FormData,
): Promise<VerificationFormState> {
  const actorId = await superAdmin();
  const outcome = String(fd.get('outcome') ?? '');
  const r = await decideVerification(db(), actorId, String(fd.get('teacherId') ?? ''), {
    outcome,
    profileReviewed: fd.get('profileReviewed') === 'yes',
    identityChecked: fd.get('identityChecked') === 'yes',
    note: String(fd.get('note') ?? ''),
  });
  if (r.ok) {
    revalidatePath('/admin/verification');
    redirect(`/admin/verification?done=${r.outcome}`);
  }
  switch (r.reason) {
    case 'note_required':
    case 'note_too_long':
    case 'note_has_number':
      return { fieldErrors: { note: NOTE[r.reason]! } };
    case 'checks_required':
      return { error: 'Tick both checks you did before marking the teacher verified.' };
    case 'email_unconfirmed':
      return { error: 'This teacher’s email address is not confirmed, so they cannot be marked verified.' };
    case 'not_eligible':
      return { error: 'Only approved, active teachers can be marked verified.' };
    case 'not_found':
      return { error: 'This request has already been decided or was withdrawn.' };
    case 'invalid_outcome':
      return { error: 'Choose a decision.' };
    default:
      return NOT_ALLOWED;
  }
}

export async function revokeVerificationAction(
  _prev: VerificationFormState,
  fd: FormData,
): Promise<VerificationFormState> {
  const actorId = await superAdmin();
  const r = await revokeVerification(db(), actorId, String(fd.get('teacherId') ?? ''), {
    reason: String(fd.get('reason') ?? ''),
  });
  if (r.ok) {
    revalidatePath('/admin/verification');
    redirect('/admin/verification?done=revoked');
  }
  switch (r.reason) {
    case 'reason_required':
      return { fieldErrors: { reason: 'Write the reason (required).' } };
    case 'note_too_long':
    case 'note_has_number':
      return { fieldErrors: { reason: NOTE[r.reason]! } };
    case 'not_found':
      return { error: 'This teacher is no longer verified.' };
    default:
      return NOT_ALLOWED;
  }
}
