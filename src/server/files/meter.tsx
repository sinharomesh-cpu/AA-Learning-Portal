import 'server-only';
import { StorageMeter } from '@/components/StorageMeter';
import { MB } from '@/lib/storage';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { ownUsage } from './limits';

/** The viewer's own storage meter (OC-96). The demo shows sample numbers, clearly labelled. */
export async function OwnStorageMeter({ accountId }: { accountId: string }) {
  if (isDemoMode()) {
    return (
      <StorageMeter
        usedBytes={85 * MB}
        limitBytes={200 * MB}
        uploadsToday={3}
        uploadsPerDay={100}
        note="Sample numbers. These limits apply while AA Pro is being tested."
      />
    );
  }
  const u = await ownUsage(db(), accountId);
  return (
    <StorageMeter
      usedBytes={u.usedBytes}
      limitBytes={u.limitBytes}
      uploadsToday={u.uploadsToday}
      uploadsPerDay={u.uploadsPerDay}
    />
  );
}
