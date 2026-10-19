import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { backupAffectedRecords } from '@/server/pricingMigration';
import { getRealSession } from '@/server/session';

export const dynamic = 'force-dynamic';

/**
 * OC-106 (1): download a backup of every record the pricing conversion could touch, before
 * applying it. Super Admin only (with the security check); audited. Nothing is changed.
 */
export async function GET(): Promise<Response> {
  if (isDemoMode()) return new Response('Not available in the sample preview.', { status: 404 });
  const real = await getRealSession();
  if (!real || real.session.role !== 'superadmin' || !real.session.mfaVerifiedAt) {
    return new Response('Not found', { status: 404 });
  }
  const backup = await backupAffectedRecords(db(), real.session.accountId);
  if (!backup) return new Response('Not found', { status: 404 });
  const day = backup.takenAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="aa-pro-pricing-backup-${day}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
