import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { devMailboxEnabled } from '@/server/realAuth';

export const metadata: Metadata = { title: 'Test mailbox', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Development and test only (never in a production build): shows what the email outbox holds,
 * because nothing is really sent until an email provider is approved (A-02).
 */
export default async function DevMailboxPage() {
  if (!devMailboxEnabled()) notFound();
  const rows = await db()<
    Array<{ id: string; to_address: string; template: string; payload: Record<string, string>; created_at: Date }>
  >`SELECT id, to_address, template, payload, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 50`;
  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-8">
      <h1 className="text-headline-md">Test mailbox (development only)</h1>
      <p className="text-body-md text-on-surface-variant">Nothing here was sent. Newest first.</p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} data-testid="mail" className="rounded-md border border-card-border bg-white p-4">
            <p>
              <strong data-testid="mail-to">{r.to_address}</strong> ·{' '}
              <span data-testid="mail-template">{r.template}</span>
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {Object.entries(r.payload).map(([k, v]) => (
                <li key={k}>
                  {k}:{' '}
                  {/^https?:\/\//.test(v) ? (
                    <a href={v} data-testid={`mail-${k}`}>
                      {v}
                    </a>
                  ) : (
                    v
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </main>
  );
}
