import type { Metadata } from 'next';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StatusChip, type ChipKind } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { ACCOUNTS, type AccountStatus } from '@/fixtures/admin';
import { requireAdmin } from '@/server/authz';
import { isDemoMode } from '@/server/demo';
import { RealAccounts } from './RealAccounts';

export const metadata: Metadata = { title: 'Accounts' };

const STATUS_KIND: Record<AccountStatus, ChipKind> = {
  Active: 'success',
  'Pending approval': 'warning',
  Deactivated: 'neutral',
  Suspended: 'error',
};

/** M-27 accounts list (boards 38, 52): Parent and Teacher accounts only, read-only in Phase 1. */
export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireAdmin('accounts');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (!isDemoMode()) {
    const p = await searchParams;
    const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
    return (
      <RealAccounts
        actorId={access.viewer.id}
        timeZone={access.viewer.timeZone}
        filter={{ q: one(p.q), role: one(p.role), status: one(p.status) }}
      />
    );
  }
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Accounts</h1>
        <Button inactive aria-describedby="phase-note">
          Create account
        </Button>
      </div>
      <p id="phase-note" className="text-body-sm text-on-surface-variant">
        Demo data, read-only. Creating, editing and deactivating accounts (with a recorded reason) arrive with real
        accounts in a later phase.
      </p>

      {/* Desktop table */}
      <Card className="hidden overflow-x-auto p-0 lg:block">
        <table className="w-full border-collapse text-left text-body-sm">
          <caption className="sr-only">Parent and teacher accounts</caption>
          <thead>
            <tr className="border-b-2 border-card-border text-on-surface-variant">
              {['Name', 'Email', 'Role', 'Status', 'Created', 'Last sign-in'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACCOUNTS.map((a) => (
              <tr key={a.email} className="border-b border-surface-container align-top">
                <th scope="row" className="px-4 py-3 font-bold">
                  {a.name}
                  <br />
                  <span className="font-medium text-on-surface-variant">{a.detail}</span>
                </th>
                <td className="px-4 py-3">{a.email}</td>
                <td className="px-4 py-3">
                  <StatusChip kind={a.role === 'Parent' ? 'human' : 'neutral'}>{a.role}</StatusChip>
                </td>
                <td className="px-4 py-3">
                  <StatusChip kind={STATUS_KIND[a.status]}>{a.status}</StatusChip>
                </td>
                <td className="px-4 py-3">{a.created}</td>
                <td className="px-4 py-3">{a.lastSignIn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Phone list */}
      <ul className="m-0 flex list-none flex-col gap-3 p-0 lg:hidden">
        {ACCOUNTS.map((a) => (
          <li key={a.email} className="flex flex-col gap-1.5 rounded-[20px] border border-card-border bg-white p-3.5">
            <span className="flex items-start justify-between gap-2">
              <strong>{a.name}</strong>
              <StatusChip kind={STATUS_KIND[a.status]}>{a.status}</StatusChip>
            </span>
            <span className="text-body-sm text-on-surface-variant">
              {a.role} · {a.email}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-body-sm text-on-surface-variant">
        Children are shown only as a count under their parent. There is no &quot;sign in as user&quot; feature.
      </p>
    </div>
  );
}
