'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { applyPricingMigration, rollbackPricingMigration } from '@/server/pricingMigration';
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

/** CR-15 A5 (FR-044): apply the conversion, only after the owner has seen the dry run. */
export async function applyMigrationAction(_prev: MigrationFormState, fd: FormData): Promise<MigrationFormState> {
  const id = await superAdmin();
  if (fd.get('confirm') !== 'CONVERT') return { error: 'Type CONVERT to confirm.' };
  const r = await applyPricingMigration(db(), id);
  revalidatePath('/admin/pricing-migration');
  if (!r.ok) return { error: 'Only the Super Admin can do this.' };
  return {
    notice: `Converted ${r.converted} listing${r.converted === 1 ? '' : 's'}. Earlier prices are kept.${r.skipped ? ` ${r.skipped} listing(s) of teachers no longer approved were left unchanged.` : ''}`,
    ...(r.failed
      ? { error: `${r.failed} listing(s) could not be converted and were left unchanged. See the dry run.` }
      : {}),
  };
}

export async function rollbackMigrationAction(_prev: MigrationFormState, fd: FormData): Promise<MigrationFormState> {
  const id = await superAdmin();
  if (fd.get('confirm') !== 'ROLL BACK') return { error: 'Type ROLL BACK to confirm.' };
  const r = await rollbackPricingMigration(db(), id);
  revalidatePath('/admin/pricing-migration');
  if (!r.ok) return { error: 'Only the Super Admin can do this.' };
  return {
    notice: `Restored ${r.restored} listing${r.restored === 1 ? '' : 's'}.${r.packagesKept ? ` ${r.packagesKept} package(s) the teacher had completed were kept.` : ''}`,
  };
}
