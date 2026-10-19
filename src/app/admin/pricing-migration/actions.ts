'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { applyPricingMigration, rollbackPricingMigration } from '@/server/pricingMigration';
import { setPricingV2 } from '@/server/pricingModel';
import { getRealSession } from '@/server/session';

export interface MigrationFormState {
  error?: string;
  notice?: string;
}

async function superAdmin(): Promise<string> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'superadmin') redirect('/sign-in');
  if (!real.session.mfaVerifiedAt) redirect('/security-check');
  return real.session.accountId;
}

/**
 * CR-15 A5 (FR-044) and OC-107 (3): convert and turn the new pricing model on together, so
 * listings are never left converted while the model is off. If any listing fails, the model
 * stays off and the report says so (nothing is half switched).
 */
export async function applyMigrationAction(_prev: MigrationFormState, fd: FormData): Promise<MigrationFormState> {
  const id = await superAdmin();
  if (fd.get('confirm') !== 'CONVERT') return { error: 'Type CONVERT to confirm.' };
  const r = await applyPricingMigration(db(), id);
  if (!r.ok) return { error: 'Only the Super Admin can do this.' };
  const skipped = r.skipped ? ` ${r.skipped} listing(s) of teachers no longer approved were left unchanged.` : '';
  if (r.failed) {
    revalidatePath('/admin/pricing-migration');
    return {
      notice: `Converted ${r.converted} listing${r.converted === 1 ? '' : 's'}.${skipped}`,
      error: `${r.failed} listing(s) could not be converted and were left unchanged, so the new pricing model was NOT turned on. Roll back, or fix and convert again.`,
    };
  }
  await setPricingV2(db(), id, true);
  revalidatePath('/admin/pricing-migration');
  revalidatePath('/admin/rate-proposals');
  return {
    notice: `Converted ${r.converted} listing${r.converted === 1 ? '' : 's'} and turned the new pricing model on. Earlier prices are kept.${skipped}`,
  };
}

/** OC-107 (3): turn the model off first, then restore the converted listings, in one step. */
export async function rollbackMigrationAction(_prev: MigrationFormState, fd: FormData): Promise<MigrationFormState> {
  const id = await superAdmin();
  if (fd.get('confirm') !== 'ROLL BACK') return { error: 'Type ROLL BACK to confirm.' };
  const off = await setPricingV2(db(), id, false);
  if (!off.ok) return { error: 'Only the Super Admin can do this.' };
  const r = await rollbackPricingMigration(db(), id);
  revalidatePath('/admin/pricing-migration');
  revalidatePath('/admin/rate-proposals');
  if (!r.ok) return { error: 'Only the Super Admin can do this.' };
  return {
    notice: `Turned the new pricing model off and restored ${r.restored} listing${r.restored === 1 ? '' : 's'}.${r.packagesKept ? ` ${r.packagesKept} package(s) the teacher had completed were kept.` : ''}`,
  };
}
