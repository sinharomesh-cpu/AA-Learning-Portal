import 'server-only';
import { writeAudit } from '@/server/auth/audit';
import type { Db, Sql } from '@/server/db/client';
import type { EmailConfig } from './config';
import { type OutgoingEmail, type SendResult, sendWithResend } from './resend';
import { renderEmail } from './templates';

/**
 * Sends queued emails from `email_outbox` (A-02, OC-133). Runs after the request that queued
 * them, one email at a time, and stops early on anything unusual:
 *
 * - Off unless the configuration is complete (see config.ts); then nothing is touched and the
 *   test mailbox keeps showing everything.
 * - Only listed test recipients get email until the owner approves real users; emails to anyone
 *   else stay in the outbox untouched and are never sent.
 * - AA Pro's own daily and monthly caps sit below Resend's free plan. Reaching a cap, or
 *   Resend reporting a quota, rate limit or set-up problem, pauses sending; emails stay queued.
 *   Nothing ever switches to another provider or a paid plan.
 * - A link that has expired is not sent late.
 * - After an email is sent or given up, its one-time link is removed from the outbox.
 * - The audit log records outcomes with the outbox id and template only: no address, no link.
 */

const DISPATCH_LOCK = 7_316_402_918; // one sender at a time across the environment
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** How long a queued email is still worth sending (a reset link is useless after 30 minutes). */
const LIFETIME_MS: Record<string, number> = {
  password_reset: 30 * MINUTE,
  confirm_email: 24 * HOUR,
};
const DEFAULT_LIFETIME_MS = 72 * HOUR;

export type DispatchOutcome =
  | { status: 'off'; reason: string }
  | { status: 'paused'; reason: string; until: Date }
  | { status: 'done'; sent: number; failed: number; cancelled: number; stoppedBecause?: string };

export interface DispatchOptions {
  now?: () => Date;
  /** At most this many emails in one run (the rest go in the next run). */
  limit?: number;
  send?: (apiKey: string, email: OutgoingEmail) => Promise<SendResult>;
}

type Row = { id: string; to_address: string; template: string; payload: Record<string, unknown>; created_at: Date };

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfUtcMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const nextUtcDay = (d: Date) => new Date(startOfUtcDay(d).getTime() + 24 * HOUR);
const nextUtcMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

/** One-time links (anything carrying a token) are removed once they are no longer needed. */
export function withoutLinks(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k] = typeof v === 'string' && /[?&]token=/.test(v) ? '(link removed after sending)' : v;
  }
  return out;
}

async function activePause(sql: Db, now: Date): Promise<{ reason: string; until: Date } | null> {
  const [row] = await sql<Array<{ reason: string; until: string }>>`
    SELECT details->>'reason' AS reason, details->>'until' AS until FROM audit_events
    WHERE event_type = 'EMAIL_SENDING_PAUSED' AND (details->>'until')::timestamptz > ${now}
    ORDER BY occurred_at DESC LIMIT 1`;
  return row ? { reason: row.reason, until: new Date(row.until) } : null;
}

async function pause(sql: Db, reason: string, until: Date, now: Date) {
  if (await activePause(sql, now)) return;
  await writeAudit(
    sql,
    { type: 'EMAIL_SENDING_PAUSED', outcome: 'failure', details: { reason, until: until.toISOString() } },
    now,
  );
}

async function close(
  sql: Db,
  row: Row,
  status: 'sent' | 'failed' | 'cancelled',
  now: Date,
  audit: { type: string; outcome: 'success' | 'failure'; details: Record<string, string> },
) {
  await sql`UPDATE email_outbox SET status = ${status}, sent_at = ${status === 'sent' ? now : null},
            payload = ${sql.json(withoutLinks(row.payload) as Record<string, string>)} WHERE id = ${row.id}`;
  await writeAudit(
    sql,
    {
      type: audit.type,
      outcome: audit.outcome,
      details: { outboxId: row.id, template: row.template, ...audit.details },
    },
    now,
  );
}

export async function dispatchPendingEmails(
  sql: Sql,
  config: EmailConfig,
  options: DispatchOptions = {},
): Promise<DispatchOutcome> {
  if (config.mode === 'off') return { status: 'off', reason: config.reason };
  const clock = options.now ?? (() => new Date());
  const send = options.send ?? sendWithResend;
  const limit = options.limit ?? 10;
  const result = { status: 'done' as const, sent: 0, failed: 0, cancelled: 0 } as Extract<
    DispatchOutcome,
    { status: 'done' }
  >;

  // Rows dated in the future (beyond a few minutes of clock difference with the database) are
  // ignored.
  // Only listed test recipients are ever picked up; emails to anyone else (and anything older
  // than the longest link lifetime) are left exactly as they are, never sent or changed.
  const allowed = config.allowedRecipients ? [...config.allowedRecipients] : null;

  for (let i = 0; i < limit; i++) {
    const step = await sql.begin(
      async (tx): Promise<'next' | 'empty' | { stop: string } | { paused: { reason: string; until: Date } }> => {
        await tx`SELECT pg_advisory_xact_lock(${DISPATCH_LOCK})`;
        const now = clock();
        const paused = await activePause(tx, now);
        if (paused) return { paused };
        const [row] = await tx<Row[]>`
        SELECT id, to_address, template, payload, created_at FROM email_outbox
        WHERE status = 'pending' AND created_at > ${new Date(now.getTime() - DEFAULT_LIFETIME_MS)} AND created_at <= ${new Date(now.getTime() + 5 * MINUTE)}
          AND (${allowed}::text[] IS NULL OR lower(trim(to_address)) = ANY (${allowed}::text[]))
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!row) return 'empty';
        const t = tx;

        if (now.getTime() - row.created_at.getTime() > (LIFETIME_MS[row.template] ?? DEFAULT_LIFETIME_MS)) {
          await close(t, row, 'cancelled', now, {
            type: 'EMAIL_NOT_SENT',
            outcome: 'failure',
            details: { reason: 'expired' },
          });
          result.cancelled += 1;
          return 'next';
        }
        const [counts] = await tx<Array<{ today: number; month: number }>>`
        SELECT count(*) FILTER (WHERE sent_at >= ${startOfUtcDay(now)} AND sent_at < ${nextUtcDay(now)})::int AS today,
               count(*)::int AS month
        FROM email_outbox
        WHERE status = 'sent' AND sent_at >= ${startOfUtcMonth(now)} AND sent_at < ${nextUtcMonth(now)}`;
        if (counts!.today >= config.perDay) {
          const p = { reason: 'own_daily_limit', until: nextUtcDay(now) };
          await pause(t, p.reason, p.until, now);
          return { paused: p };
        }
        if (counts!.month >= config.perMonth) {
          const p = { reason: 'own_monthly_limit', until: nextUtcMonth(now) };
          await pause(t, p.reason, p.until, now);
          return { paused: p };
        }
        const rendered = renderEmail(row.template, row.payload);
        if (!rendered) {
          await close(t, row, 'failed', now, {
            type: 'EMAIL_FAILED',
            outcome: 'failure',
            details: { reason: 'unknown_template' },
          });
          result.failed += 1;
          return 'next';
        }
        const r = await send(config.apiKey, {
          from: config.from,
          to: row.to_address,
          ...rendered,
          idempotencyKey: `aa-pro-outbox-${row.id}`,
        });
        const after = clock();
        if (r.ok) {
          await close(t, row, 'sent', after, {
            type: 'EMAIL_SENT',
            outcome: 'success',
            details: { providerId: r.providerId },
          });
          result.sent += 1;
          return 'next';
        }
        switch (r.kind) {
          case 'rejected':
            await close(t, row, 'failed', after, {
              type: 'EMAIL_FAILED',
              outcome: 'failure',
              details: { reason: r.error },
            });
            result.failed += 1;
            return 'next';
          case 'quota_daily': {
            const p = { reason: 'provider_daily_quota', until: nextUtcDay(after) };
            await pause(t, p.reason, p.until, after);
            return { paused: p };
          }
          case 'quota_monthly': {
            const p = { reason: 'provider_monthly_quota', until: nextUtcMonth(after) };
            await pause(t, p.reason, p.until, after);
            return { paused: p };
          }
          case 'auth': {
            // A wrong key or unverified sender won't fix itself: check again in an hour.
            const p = { reason: `provider_setup:${r.error}`, until: new Date(after.getTime() + HOUR) };
            await pause(t, p.reason, p.until, after);
            return { paused: p };
          }
          case 'retry':
            return { stop: 'provider_busy' };
        }
      },
    );
    if (step === 'empty') break;
    if (step === 'next') continue;
    if ('paused' in step) {
      return result.sent || result.failed || result.cancelled
        ? { ...result, stoppedBecause: step.paused.reason }
        : { status: 'paused', ...step.paused };
    }
    return { ...result, stoppedBecause: step.stop };
  }
  return result;
}
