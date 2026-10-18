import type { Metadata } from 'next';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { cx } from '@/lib/cx';
import { formatMb } from '@/lib/storage';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { SETTING_KEYS, SETTING_RANGES, storageStatus } from '@/server/files/limits';
import { StorageForm } from './StorageForm';

export const metadata: Metadata = { title: 'Storage' };
export const dynamic = 'force-dynamic';

/**
 * Admin → Storage (OC-96), the Super Admin's alone: how much of the free database allowance is
 * used, and the storage safety limits, changeable without a code change.
 */
export default async function AdminStoragePage() {
  const access = await requireAdmin('superadmin');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Storage"
        body="Storage use and limits work with the real database. The sample preview stores no files."
        homeHref="/admin"
        homeLabel="Back to home"
      />
    );
  }
  const s = await storageStatus(db());
  const share = s.databaseBytes / s.allowanceBytes;
  const pct = Math.round(share * 100);
  const fields = SETTING_KEYS.map((key) => ({ key, ...SETTING_RANGES[key], value: s.settings[key] }));
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Storage</h1>
      {s.level === 'stopped' ? (
        <FormMessage tone="error">
          <strong>New uploads are stopped.</strong> The database has reached {s.settings.storage_stop_percent}% of the
          free allowance. Files already stored are safe. Nothing has been upgraded or bought: remove files, or raise the
          stop level only if the provider&apos;s free allowance really allows it.
        </FormMessage>
      ) : s.level === 'warning' ? (
        <FormMessage tone="warning">
          <strong>Storage warning.</strong> The database has reached {s.settings.storage_warn_percent}% of the free
          allowance. Uploads stop at {s.settings.storage_stop_percent}%.
        </FormMessage>
      ) : null}

      <Card aria-labelledby="st-use" className="flex flex-col gap-3">
        <h2 id="st-use" className="text-[20px] font-bold leading-7">
          Free database allowance
        </h2>
        <p className="m-0 text-[15px] leading-6" data-testid="db-used">
          <strong>
            {formatMb(s.databaseBytes)} of {formatMb(s.allowanceBytes)} used ({pct}%)
          </strong>
        </p>
        <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className={cx(
              'h-full rounded-full',
              s.level === 'stopped' ? 'bg-error' : s.level === 'warning' ? 'bg-secondary' : 'bg-primary',
            )}
            style={{ width: `${Math.min(100, Math.max(1, share * 100))}%` }}
          />
        </div>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-6">
          <li>
            Uploaded files: {formatMb(s.fileBytes)} in {s.fileCount} {s.fileCount === 1 ? 'file' : 'files'} (included in
            the total above)
          </li>
          <li>
            Warning at {formatMb(s.warnBytes)} ({s.settings.storage_warn_percent}%) · new uploads stop at{' '}
            {formatMb(s.stopBytes)} ({s.settings.storage_stop_percent}%)
          </li>
        </ul>
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          Files are kept inside AA Pro&apos;s own database, so their contents count towards the free allowance. The
          total is the database&apos;s own measure of everything stored, which can be a little higher than the
          provider&apos;s figure. AA Pro never upgrades, buys storage or switches to a paid service by itself (OC-91).
        </p>
      </Card>

      <Card aria-labelledby="st-limits" className="flex flex-col gap-4">
        <h2 id="st-limits" className="text-[20px] font-bold leading-7">
          Safety limits for testing
        </h2>
        <p className="m-0 text-[15px] leading-6">
          Temporary technical limits while AA Pro is being developed and tested, not business rules. Changes apply to
          the next upload and are recorded in the audit log.
        </p>
        <StorageForm fields={fields} />
      </Card>
    </div>
  );
}
