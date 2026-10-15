import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { PendingNote } from '@/components/PendingNote';
import { AccessDenied } from '@/components/states/AccessDenied';
import { adminCounts, RECENT_ADMIN_ACTIONS } from '@/fixtures/admin';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
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
  const access = await requireRole('superadmin');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  const counts = demo ? adminCounts() : await realCounts();
  const tiles = [
    { label: 'Active parent accounts', value: counts.activeParents },
    { label: 'Active teacher accounts', value: counts.activeTeachers },
    { label: 'Teachers waiting for approval', value: counts.teachersAwaitingApproval },
  ];
  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Overview</h1>
      {demo ? (
        <PendingNote decision="D-11b">
          How Super Admin accounts are created. Demo data only; the second-factor step (M-26) arrives with real sign-in
          in Phase 2.
        </PendingNote>
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
      {demo ? (
        <Card aria-labelledby="recent" className="flex flex-col gap-2">
          <h2 id="recent" className="text-headline-sm">
            Your recent actions
          </h2>
          <ul className="m-0 list-none p-0">
            {RECENT_ADMIN_ACTIONS.map((a, i) => (
              <li
                key={a.when}
                className={`flex flex-wrap justify-between gap-2 py-3 ${i < RECENT_ADMIN_ACTIONS.length - 1 ? 'border-b border-surface-container' : ''}`}
              >
                <span>
                  {a.action} <strong>{a.subject}</strong>
                </span>
                <span className="text-body-sm text-on-surface-variant">{a.when}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/audit-log" className="font-bold">
            Open audit log
          </Link>
        </Card>
      ) : null}
      <p className="text-body-sm text-on-surface-variant">
        The home page shows counts only. No child names or learning content appear in the Super Admin portal.
      </p>
    </div>
  );
}
