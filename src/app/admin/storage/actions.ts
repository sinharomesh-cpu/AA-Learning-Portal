'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { SETTING_KEYS, updateStorageSettings } from '@/server/files/limits';
import { getRealSession } from '@/server/session';

export interface StorageFormState {
  error?: string;
  notice?: string;
}

const ERRORS = {
  not_allowed: 'Only the Super Admin can change storage limits.',
  invalid: 'Please enter whole numbers inside the ranges shown.',
  warn_not_below_stop: 'The warning level must be lower than the level at which uploads stop.',
} as const;

/** Admin → Storage: the Super Admin changes the storage safety limits (OC-96). */
export async function saveStorageSettingsAction(_prev: StorageFormState, fd: FormData): Promise<StorageFormState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'superadmin') redirect('/sign-in');
  if (!real.session.mfaVerifiedAt) redirect('/security-check');
  const input: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const v = fd.get(key);
    if (typeof v === 'string') input[key] = v;
  }
  const r = await updateStorageSettings(db(), real.session.accountId, input);
  if (!r.ok) return { error: ERRORS[r.reason] };
  revalidatePath('/admin/storage');
  revalidatePath('/admin');
  return { notice: 'Saved. The new limits apply to the next upload.' };
}
