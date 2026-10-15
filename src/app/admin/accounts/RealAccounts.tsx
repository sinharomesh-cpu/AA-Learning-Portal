import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { StatusChip, type ChipKind } from '@/components/StatusChip';
import { type AccountFilter, listAccounts } from '@/server/admin';
import { db } from '@/server/db/client';

/** M-27 with real accounts (WP2-5b): parent and teacher accounts only, children as a count. */
export const STATUS_LABEL: Record<string, [string, ChipKind]> = {
  active: ['Active', 'success'],
  pending_email: ['Email not confirmed', 'warning'],
  pending_approval: ['Pending approval', 'warning'],
  suspended: ['Suspended', 'error'],
  deactivated: ['Deactivated', 'neutral'],
};

const day = (d: Date | null, tz: string) =>
  d
    ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d)
    : '—';

const SELECT = 'min-h-12 w-full rounded-[16px] border-2 border-outline bg-white px-3.5 text-[15px]';

export async function RealAccounts({
  actorId,
  timeZone,
  filter,
}: {
  actorId: string;
  timeZone: string;
  filter: AccountFilter;
}) {
  const rows = (await listAccounts(db(), actorId, filter)) ?? [];
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Accounts</h1>
        <LinkButton href="/admin/accounts/new">Create account</LinkButton>
      </div>
      <form method="get" className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end" role="search">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="acc-q" className="text-sm font-bold">
            Search name or email
          </label>
          <input id="acc-q" name="q" defaultValue={filter.q} className={SELECT} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="acc-role" className="text-sm font-bold">
            Role
          </label>
          <select id="acc-role" name="role" defaultValue={filter.role ?? ''} className={SELECT}>
            <option value="">Parents and teachers</option>
            <option value="parent">Parents</option>
            <option value="teacher">Teachers</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="acc-status" className="text-sm font-bold">
            Status
          </label>
          <select id="acc-status" name="status" defaultValue={filter.status ?? ''} className={SELECT}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, [label]]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-12 rounded-full border-2 border-outline bg-white px-5 text-[15px] font-bold hover:bg-surface-container-low"
        >
          Show
        </button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <p className="text-on-surface-variant">No accounts match.</p>
        </Card>
      ) : (
        <>
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
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const [label, kind] = STATUS_LABEL[a.status] ?? [a.status, 'neutral'];
                  return (
                    <tr key={a.id} className="border-b border-surface-container align-top">
                      <th scope="row" className="px-4 py-3 font-bold">
                        {a.name}
                        <br />
                        <span className="font-medium text-on-surface-variant">{a.detail}</span>
                      </th>
                      <td className="px-4 py-3">{a.email}</td>
                      <td className="px-4 py-3">
                        <StatusChip kind={a.role === 'parent' ? 'human' : 'neutral'}>
                          {a.role === 'parent' ? 'Parent' : 'Teacher'}
                        </StatusChip>
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip kind={kind}>{label}</StatusChip>
                      </td>
                      <td className="px-4 py-3">{day(a.createdAt, timeZone)}</td>
                      <td className="px-4 py-3">{day(a.lastSignIn, timeZone)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/accounts/${a.id}`} className="font-bold" aria-label={`Edit ${a.name}`}>
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 lg:hidden">
            {rows.map((a) => {
              const [label, kind] = STATUS_LABEL[a.status] ?? [a.status, 'neutral'];
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-1.5 rounded-[20px] border border-card-border bg-white p-3.5"
                >
                  <span className="flex items-start justify-between gap-2">
                    <strong>{a.name}</strong>
                    <StatusChip kind={kind}>{label}</StatusChip>
                  </span>
                  <span className="text-body-sm text-on-surface-variant">
                    {a.role === 'parent' ? 'Parent' : 'Teacher'} · {a.detail}
                  </span>
                  <span className="break-all text-body-sm text-on-surface-variant">{a.email}</span>
                  <Link href={`/admin/accounts/${a.id}`} className="self-start font-bold" aria-label={`Edit ${a.name}`}>
                    Edit
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="text-body-sm text-on-surface-variant">
        Children are shown only as a count under their parent. There is no &quot;sign in as user&quot; feature.
      </p>
    </div>
  );
}
