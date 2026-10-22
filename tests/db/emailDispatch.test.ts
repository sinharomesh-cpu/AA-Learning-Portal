import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { EmailConfig } from '@/server/email/config';
import { dispatchPendingEmails } from '@/server/email/dispatch';
import type { OutgoingEmail, SendResult } from '@/server/email/resend';
import { testDb } from './helpers';

/**
 * OC-133: sending queued emails through Resend's free plan, with a fake Resend (nothing leaves
 * the machine). Synthetic addresses only: Resend's test inboxes and made-up ones. Each test uses
 * its own day, so pauses and daily counts never mix between tests (the database is shared).
 */
const sql = testDb();
afterAll(() => sql.end());

// Past years, so no pause written here is still active for tests that use the real clock.
let year = 1991;
function day() {
  year += 1;
  return new Date(`${year}-03-10T06:00:00Z`);
}

const TEST_LIST = ['delivered@example.org', 'bounced@example.org'];
const config = (over: Partial<Extract<EmailConfig, { mode: 'resend' }>> = {}): EmailConfig => ({
  mode: 'resend',
  apiKey: 're_test_000000000000', // pragma: allowlist secret (fake key)
  from: 'AA Pro <no-reply@example.org>',
  allowedRecipients: new Set(TEST_LIST),
  perDay: 90,
  perMonth: 2900,
  ...over,
});

async function queue(to: string, at: Date, template = 'password_reset', payload?: Record<string, string>) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO email_outbox (to_address, template, payload, dedupe_key, created_at)
    VALUES (${to}, ${template},
            ${sql.json(payload ?? { name: 'Sample', link: `https://example.org/reset-password?token=${randomUUID()}` })},
            ${randomUUID()}, ${at})
    RETURNING id`;
  return row!.id;
}

const statusOf = async (id: string) =>
  (
    await sql<{ status: string; sent_at: Date | null; payload: Record<string, string> }[]>`
    SELECT status, sent_at, payload FROM email_outbox WHERE id = ${id}`
  )[0]!;

function fakeResend(results: SendResult[] = []) {
  const sent: OutgoingEmail[] = [];
  const send = async (_key: string, e: OutgoingEmail): Promise<SendResult> => {
    sent.push(e);
    return results.shift() ?? { ok: true, providerId: `email_${sent.length}` };
  };
  return { sent, send };
}

describe('sending queued emails (OC-133)', () => {
  it('is off without a configuration: nothing is touched', async () => {
    const at = day();
    const id = await queue('delivered@example.org', at);
    expect(await dispatchPendingEmails(sql, { mode: 'off', reason: 'x' })).toMatchObject({ status: 'off' });
    expect((await statusOf(id)).status).toBe('pending');
  });

  it('sends to listed test recipients only, with the outbox id as idempotency key, then removes the link', async () => {
    const at = day();
    const ok = await queue('Delivered@example.org', at);
    const other = await queue('real.person@example.org', at);
    const r = fakeResend();
    expect(await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send })).toMatchObject({
      status: 'done',
      sent: 1,
    });
    expect(r.sent.map((e) => [e.to, e.idempotencyKey])).toEqual([['Delivered@example.org', `aa-pro-outbox-${ok}`]]);
    expect(r.sent[0]!.text).toContain('reset-password?token=');
    const done = await statusOf(ok);
    expect(done.status).toBe('sent');
    expect(done.sent_at).toEqual(at);
    expect(JSON.stringify(done.payload)).not.toContain('token=');
    // Someone not on the test list: left exactly as it was, never sent.
    expect((await statusOf(other)).status).toBe('pending');
    const [audit] = await sql<{ details: Record<string, string> }[]>`
      SELECT details FROM audit_events WHERE event_type = 'EMAIL_SENT' AND details->>'outboxId' = ${ok}`;
    expect(audit!.details).toEqual({ outboxId: ok, template: 'password_reset', providerId: 'email_1' });
    expect(JSON.stringify(audit)).not.toMatch(/@|token/);
  });

  it('a reset link older than 30 minutes is not sent late', async () => {
    const at = day();
    const id = await queue('delivered@example.org', new Date(at.getTime() - 31 * 60_000));
    const r = fakeResend();
    expect(await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send })).toMatchObject({
      cancelled: 1,
      sent: 0,
    });
    expect(r.sent).toEqual([]);
    expect((await statusOf(id)).status).toBe('cancelled');
    expect(JSON.stringify((await statusOf(id)).payload)).not.toContain('token=');
  });

  it('a bad address is given up; the rest still go', async () => {
    const at = day();
    const bad = await queue('bounced@example.org', at);
    const good = await queue('delivered@example.org', new Date(at.getTime() + 1000));
    const r = fakeResend([{ ok: false, kind: 'rejected', error: 'validation_error' }]);
    expect(await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send })).toMatchObject({
      sent: 1,
      failed: 1,
    });
    expect((await statusOf(bad)).status).toBe('failed');
    expect((await statusOf(good)).status).toBe('sent');
  });

  it("AA Pro's own daily cap pauses sending until midnight UTC; the email stays queued", async () => {
    const at = day();
    const a = await queue('delivered@example.org', at);
    const b = await queue('delivered@example.org', new Date(at.getTime() + 1000));
    const r = fakeResend();
    const out = await dispatchPendingEmails(sql, config({ perDay: 1 }), { now: () => at, send: r.send });
    expect(out).toMatchObject({ status: 'done', sent: 1, stoppedBecause: 'own_daily_limit' });
    expect((await statusOf(a)).status).toBe('sent');
    expect((await statusOf(b)).status).toBe('pending');
    // Still paused later that day, even with a higher cap: no further calls to Resend.
    const later = new Date(at.getTime() + 60 * 60_000);
    expect(await dispatchPendingEmails(sql, config(), { now: () => later, send: r.send })).toMatchObject({
      status: 'paused',
      reason: 'own_daily_limit',
    });
    expect(r.sent).toHaveLength(1);
  });

  it("Resend's daily or monthly quota pauses sending; nothing switches to another service", async () => {
    const at = day();
    const id = await queue('delivered@example.org', at);
    const r = fakeResend([{ ok: false, kind: 'quota_daily' }]);
    expect(await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send })).toMatchObject({
      status: 'paused',
      reason: 'provider_daily_quota',
    });
    expect((await statusOf(id)).status).toBe('pending');
    const nextDay = new Date(at.getTime() + 24 * 60 * 60_000);
    expect(await dispatchPendingEmails(sql, config(), { now: () => nextDay, send: r.send })).toMatchObject({ sent: 0 });
  });

  it('a wrong key or unverified sender pauses for an hour; a busy Resend leaves the email for next time', async () => {
    const at = day();
    const id = await queue('delivered@example.org', at, 'enquiry_accepted', {
      name: 'Sample',
      teacher: 'Teacher S.',
      link: 'https://example.org/parent/enquiries',
    });
    const busy = fakeResend([{ ok: false, kind: 'retry', retryAfterSeconds: 1 }]);
    expect(await dispatchPendingEmails(sql, config(), { now: () => at, send: busy.send })).toMatchObject({
      status: 'done',
      stoppedBecause: 'provider_busy',
    });
    expect((await statusOf(id)).status).toBe('pending');
    const auth = fakeResend([{ ok: false, kind: 'auth', error: 'validation_error' }]);
    expect(await dispatchPendingEmails(sql, config(), { now: () => at, send: auth.send })).toMatchObject({
      status: 'paused',
      reason: 'provider_setup:validation_error',
    });
    const r = fakeResend();
    expect(
      await dispatchPendingEmails(sql, config(), { now: () => new Date(at.getTime() + 30 * 60_000), send: r.send }),
    ).toMatchObject({
      status: 'paused',
    });
    expect(
      await dispatchPendingEmails(sql, config(), { now: () => new Date(at.getTime() + 61 * 60_000), send: r.send }),
    ).toMatchObject({
      sent: 1,
    });
  });

  it('two senders running at once send each email exactly once', async () => {
    const at = day();
    const ids = await Promise.all([0, 1, 2, 3].map((i) => queue('delivered@example.org', new Date(at.getTime() + i))));
    const r = fakeResend();
    await Promise.all([
      dispatchPendingEmails(sql, config(), { now: () => at, send: r.send }),
      dispatchPendingEmails(sql, config(), { now: () => at, send: r.send }),
    ]);
    expect(r.sent.map((e) => e.idempotencyKey).sort()).toEqual(ids.map((id) => `aa-pro-outbox-${id}`).sort());
  });
});
