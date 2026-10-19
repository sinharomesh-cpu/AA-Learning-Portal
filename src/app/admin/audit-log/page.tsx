import type { Metadata } from 'next';
import { PillSelect } from '@/components/ui/PillSelect';
import { auditLabel } from '@/lib/auditLabels';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { AUDIT_PAGE_SIZE, auditEventTypes, listAuditEvents } from '@/server/admin';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

const OUTCOME_KIND = { success: 'success', failure: 'warning', denied: 'error' } as const;

function parseDay(v: string | undefined): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** M-30 read-only audit log (OC-21). Never shows passwords, tokens, codes or child names. */
export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireAdmin('audit_log');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Audit log"
        body="The audit log records real accounts only. The sample preview has none."
        homeHref="/admin"
        homeLabel="Go to admin home"
      />
    );
  }
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
  const type = one(p.type);
  const fromRaw = one(p.from);
  const toRaw = one(p.to);
  const page = Math.max(0, Number(one(p.page) ?? 0) || 0);
  const to = parseDay(toRaw);
  const sql = db();
  const [rows, types] = await Promise.all([
    listAuditEvents(sql, access.viewer.id, {
      type,
      from: parseDay(fromRaw),
      to: to ? new Date(to.getTime() + 86_400_000) : undefined,
      page,
    }),
    auditEventTypes(sql, access.viewer.id),
  ]);
  const events = rows ?? [];
  const when = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  const query = (next: number) =>
    `?${new URLSearchParams({ ...(type ? { type } : {}), ...(fromRaw ? { from: fromRaw } : {}), ...(toRaw ? { to: toRaw } : {}), page: String(next) })}`;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Audit log</h1>
      <form
        method="get"
        className="flex flex-wrap items-center gap-2 rounded-[24px] border border-card-border bg-surface-container-lowest p-3 shadow-[0_1px_2px_rgba(19,27,46,.04),0_12px_32px_-16px_rgba(19,27,46,.18)]"
        role="search"
        aria-label="Filter the audit log"
      >
        <PillSelect
          name="type"
          label="Type of event"
          defaultValue={type ?? ''}
          options={[['', 'All'] as const, ...types.map((t) => [t, auditLabel(t)] as const)]}
          wide
        />
        <label className="flex items-center gap-2 text-sm font-bold text-on-surface-variant">
          From
          <input
            type="date"
            name="from"
            defaultValue={fromRaw}
            className="h-[52px] rounded-full border border-card-border bg-surface-container-lowest px-4 text-[15px] font-bold text-on-surface outline-none hover:border-outline focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-on-surface-variant">
          To
          <input
            type="date"
            name="to"
            defaultValue={toRaw}
            className="h-[52px] rounded-full border border-card-border bg-surface-container-lowest px-4 text-[15px] font-bold text-on-surface outline-none hover:border-outline focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </label>
        <button
          type="submit"
          className="h-[52px] cursor-pointer rounded-full border-0 bg-primary px-6 text-[15px] font-bold text-on-primary ml-auto"
        >
          Show
        </button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] border-collapse text-left text-body-sm">
          <caption className="sr-only">Audit events, newest first</caption>
          <thead>
            <tr className="border-b-2 border-card-border text-on-surface-variant">
              {['Time (UTC)', 'Who', 'Event', 'Record', 'Reference'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-surface-container align-top" data-testid="audit-row">
                <td className="whitespace-nowrap px-4 py-3">{when(e.at)}</td>
                <td className="px-4 py-3">{e.who}</td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    {auditLabel(e.type)}
                    <StatusChip kind={OUTCOME_KIND[e.outcome as keyof typeof OUTCOME_KIND] ?? 'neutral'}>
                      {e.outcome}
                    </StatusChip>
                  </span>
                </td>
                <td className="px-4 py-3">{e.record}</td>
                <td className="px-4 py-3 font-mono text-[13px]">#{e.id}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-on-surface-variant">
                  No events match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
      <nav aria-label="Pages" className="flex flex-wrap gap-4">
        {page > 0 ? (
          <Link href={query(page - 1)} className="font-bold">
            ← Newer
          </Link>
        ) : null}
        {events.length === AUDIT_PAGE_SIZE ? (
          <Link href={query(page + 1)} className="font-bold">
            Older →
          </Link>
        ) : null}
      </nav>
      <p className="text-body-sm text-on-surface-variant">
        Read-only. Entries never contain passwords, tokens, security codes, meeting links or AI conversation content.
        Children appear only as an account number. Export needs your approval before it is offered.
      </p>
    </div>
  );
}
