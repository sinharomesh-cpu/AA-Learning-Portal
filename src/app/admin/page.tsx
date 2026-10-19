import type { Metadata } from 'next';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import { auditLabel } from '@/lib/auditLabels';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { AccessDenied } from '@/components/states/AccessDenied';
import { adminCounts, RECENT_ADMIN_ACTIONS } from '@/fixtures/admin';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { recentActionsBy } from '@/server/admin';
import { formatMb } from '@/lib/storage';
import { storageStatus } from '@/server/files/limits';

import { isDemoMode } from '@/server/demo';

/** Real counts for M-35: numbers only, never names (OC-21). */
async function realCounts() {
  const [row] = await db()<
    Array<{ activeParents: number; activeTeachers: number; teachersAwaitingApproval: number }>
  >`SELECT
      count(*) FILTER (WHERE role = 'parent' AND status = 'active')::int AS "activeParents",
      count(*) FILTER (WHERE role = 'teacher' AND status = 'active')::int AS "activeTeachers",
      count(*) FILTER (WHERE role = 'teacher' AND status = 'pending_approval')::int AS "teachersAwaitingApproval"
    FROM accounts`;
  return row!;
}

export const metadata: Metadata = { title: 'Admin home' };

/** M-35 Super Admin home (board 37): counts only, no child names or learning content (OC-21). */
export default async function AdminHomePage() {
  const access = await requireAdmin();
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  const counts = demo ? adminCounts() : await realCounts();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: access.viewer.timeZone,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const recent = demo
    ? RECENT_ADMIN_ACTIONS
    : (await recentActionsBy(db(), access.viewer.id)).map((r) => ({
        action: auditLabel(r.type),
        subject: r.record === '—' ? '' : r.record,
        when: fmt.format(r.at),
      }));
  // OC-96: warn the Super Admin before the free database allowance is reached.
  const storage = !demo && access.viewer.role === 'superadmin' ? await storageStatus(db()) : null;
  const tiles = [
    { label: 'Active parent accounts', value: counts.activeParents },
    { label: 'Active teacher accounts', value: counts.activeTeachers },
    { label: 'Teachers waiting for approval', value: counts.teachersAwaitingApproval },
  ];
  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Overview</h1>
      {demo ? (
        <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
          <strong>Demo:</strong> sample data only. Real Super Admin sign-in uses the owner set-up and a security code
          (OC-37, OC-50).
        </p>
      ) : null}
      {storage && storage.level !== 'ok' ? (
        <p
          role="status"
          data-testid="storage-banner"
          className={`rounded-[16px] border px-4 py-3 text-[15px] leading-[22px] ${
            storage.level === 'stopped'
              ? 'border-error-border bg-error-container text-on-error-container'
              : 'border-warning-border bg-warning-container text-on-warning-container'
          }`}
        >
          <strong>{storage.level === 'stopped' ? 'New uploads are stopped.' : 'Storage warning.'}</strong> The database
          uses {formatMb(storage.databaseBytes)} of the {formatMb(storage.allowanceBytes)} free allowance. Nothing has
          been upgraded or bought. <Link href="/admin/storage">Open Storage</Link>
        </p>
      ) : null}
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label}>
            <Card className="flex h-full flex-col gap-2">
              <span className="text-body-sm text-on-surface-variant">{t.label}</span>
              <span className="font-headline text-[40px] font-extrabold leading-[48px]">{t.value}</span>
            </Card>
          </li>
        ))}
      </ul>
      {demo || recent.length ? (
        <section aria-labelledby="recent" className={SHELL}>
          <PanelHead id="recent" title="Your recent actions" />
          <div className="flex flex-col gap-2 px-5 py-5 sm:px-6">
            <ul className="m-0 list-none p-0">
              {recent.map((a, i) => (
                <li
                  key={`${a.when}-${i}`}
                  className={`flex flex-wrap justify-between gap-2 py-3 ${i < recent.length - 1 ? 'border-b border-surface-container' : ''}`}
                >
                  <span>
                    {a.action} <strong>{a.subject}</strong>
                  </span>
                  <span className="text-body-sm text-on-surface-variant">{a.when}</span>
                </li>
              ))}
            </ul>
            {access.viewer.role === 'superadmin' || access.viewer.permissions?.includes('audit_log') ? (
              <Link href="/admin/audit-log" className="font-bold">
                Open audit log
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
      <p className="text-body-sm text-on-surface-variant">
        The home page shows counts only. No child names or learning content appear in the Super Admin portal.
      </p>
    </div>
  );
}
