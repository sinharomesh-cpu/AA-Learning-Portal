// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EmailConfig, readEmailConfig } from '@/server/email/config';
import { dispatchPendingEmails } from '@/server/email/dispatch';
import { type OutgoingEmail, type SendResult, sendWithResend } from '@/server/email/resend';
import { testDb } from './helpers';

/**
 * Owner verification checklist (OC-133, 22 Oct 2026). Tests only: settings are passed in as plain
 * values (process.env is never changed) and Resend is always a fake, so nothing leaves the
 * machine. Each test uses its own past day so pauses and counts never mix.
 */
const sql = testDb();
afterAll(() => sql.end());
let year = 1961;
const day = () => new Date(`${(year += 1)}-05-10T06:00:00Z`);
const KEY = 're_verifyKEY_0000000000'; // pragma: allowlist secret (fake key)
const LIST = ['tester@example.org'];
const config = (over: Partial<Extract<EmailConfig, { mode: 'resend' }>> = {}): EmailConfig => ({
  mode: 'resend',
  apiKey: KEY,
  from: 'AA Pro <no-reply@example.org>',
  allowedRecipients: new Set(LIST),
  perDay: 90,
  perMonth: 2900,
  ...over,
});
async function queue(to: string, at: Date, template = 'password_reset') {
  const link = `https://example.org/reset-password?token=${randomUUID()}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO email_outbox (to_address, template, payload, dedupe_key, created_at)
    VALUES (${to}, ${template}, ${sql.json({ name: 'Sample', link })}, ${randomUUID()}, ${at}) RETURNING id`;
  return { id: row!.id, link };
}
const row = async (id: string) =>
  (
    await sql<{ status: string; payload: Record<string, string>; sent_at: Date | null }[]>`
    SELECT status, payload, sent_at FROM email_outbox WHERE id = ${id}`
  )[0]!;
function fake(results: SendResult[] = []) {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    send: async (_k: string, e: OutgoingEmail): Promise<SendResult> => {
      sent.push(e);
      return results.shift() ?? { ok: true, providerId: `id_${sent.length}` };
    },
  };
}

// Any console output during these tests is captured and checked for secrets/personal data.
const logged: string[] = [];
beforeEach(() => {
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' ')));
  }
});
afterEach(() => vi.restoreAllMocks());

const BASE = {
  EMAIL_PROVIDER: 'resend',
  EMAIL_SENDING: 'on',
  EMAIL_PROVIDER_API_KEY: KEY,
  EMAIL_FROM_ADDRESS: 'AA Pro <no-reply@example.org>',
  EMAIL_ALLOWED_RECIPIENTS: 'tester@example.org',
};

describe('V1 configuration: off in demo mode and on anything missing or invalid', () => {
  const cases: Array<[string, Record<string, string | undefined>]> = [
    ['demo mode with every setting present', { ...BASE, AA_DEMO_MODE: 'true' }],
    ['no provider', { ...BASE, EMAIL_PROVIDER: undefined }],
    ['other provider', { ...BASE, EMAIL_PROVIDER: 'sendgrid' }],
    ['switch missing', { ...BASE, EMAIL_SENDING: undefined }],
    ['switch "true" instead of "on"', { ...BASE, EMAIL_SENDING: 'true' }],
    ['switch "ON"', { ...BASE, EMAIL_SENDING: 'ON' }],
    ['no key', { ...BASE, EMAIL_PROVIDER_API_KEY: undefined }],
    ['non-Resend key', { ...BASE, EMAIL_PROVIDER_API_KEY: 'SG.abcdefghijk' }], // pragma: allowlist secret
    ['short key', { ...BASE, EMAIL_PROVIDER_API_KEY: 're_abc' }], // pragma: allowlist secret
    ['no sender', { ...BASE, EMAIL_FROM_ADDRESS: undefined }],
    ['sender with a line break', { ...BASE, EMAIL_FROM_ADDRESS: 'AA Pro <a@example.org>\nBcc: x@example.org' }],
    ['no recipient list', { ...BASE, EMAIL_ALLOWED_RECIPIENTS: undefined }],
    ['empty recipient list', { ...BASE, EMAIL_ALLOWED_RECIPIENTS: ' , ' }],
    ['invalid entry in list', { ...BASE, EMAIL_ALLOWED_RECIPIENTS: 'tester@example.org, everyone' }],
    [
      'allow-all "TRUE" (not exactly true) and no list',
      { ...BASE, EMAIL_ALLOWED_RECIPIENTS: undefined, EMAIL_ALLOW_ALL_RECIPIENTS: 'TRUE' },
    ],
    ['allow-all "1" and no list', { ...BASE, EMAIL_ALLOWED_RECIPIENTS: undefined, EMAIL_ALLOW_ALL_RECIPIENTS: '1' }],
    [
      'allow-all "yes" and no list',
      { ...BASE, EMAIL_ALLOWED_RECIPIENTS: undefined, EMAIL_ALLOW_ALL_RECIPIENTS: 'yes' },
    ],
    [
      'allow-all with the resend.dev test sender',
      { ...BASE, EMAIL_FROM_ADDRESS: 'onboarding@resend.dev', EMAIL_ALLOW_ALL_RECIPIENTS: 'true' },
    ],
    ['daily limit above free plan', { ...BASE, EMAIL_DAILY_LIMIT: '101' }],
    ['monthly limit above free plan', { ...BASE, EMAIL_MONTHLY_LIMIT: '3001' }],
    ['limit zero', { ...BASE, EMAIL_DAILY_LIMIT: '0' }],
    ['limit not a number', { ...BASE, EMAIL_DAILY_LIMIT: 'lots' }],
  ];
  it.each(cases)('%s → off', (_name, env) => {
    const c = readEmailConfig(env);
    expect(c.mode).toBe('off');
    expect(JSON.stringify(c)).not.toContain(KEY);
  });
  it('allow-all values other than exactly "true" keep the list in force', () => {
    for (const v of ['TRUE', '1', 'yes', ' true', 'false', '']) {
      const c = readEmailConfig({ ...BASE, EMAIL_ALLOW_ALL_RECIPIENTS: v });
      expect(c.mode === 'resend' && c.allowedRecipients !== null).toBe(true);
    }
  });
  it('a wildcard-looking entry is a literal address, never a pattern', () => {
    const c = readEmailConfig({ ...BASE, EMAIL_ALLOWED_RECIPIENTS: '*@example.org' });
    expect(c.mode === 'resend' && [...c.allowedRecipients!]).toEqual(['*@example.org']);
  });
});

describe('V2 recipient list cannot be bypassed', () => {
  it('look-alike and combined addresses stay queued, untouched, across repeated runs', async () => {
    const at = day();
    const listed = await queue('tester@example.org', at);
    const tricks = [
      'real.parent@example.com',
      'tester@example.org, real.parent@example.com',
      'tester@example.org;real.parent@example.com',
      'tester@example.org\nreal.parent@example.com',
      'Tester <real.parent@example.com>',
      'tester@example.com', // same name, different domain
      'tester@example.org>',
      'tеster@example.org', // Cyrillic "е"
      'tester@example.org​', // zero-width space
      '*@example.org',
    ];
    const queued = await Promise.all(tricks.map((t, i) => queue(t, new Date(at.getTime() + i + 1))));
    const before = await Promise.all(queued.map((q) => row(q.id)));
    const r = fake();
    for (let i = 0; i < 20; i++) await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send });
    expect(r.sent.map((e) => e.to)).toEqual(['tester@example.org']);
    expect((await row(listed.id)).status).toBe('sent');
    const after = await Promise.all(queued.map((q) => row(q.id)));
    expect(after).toEqual(before); // same status (pending), same payload with link, no sent time
    for (const a of after) expect(a.status).toBe('pending');
  });
  it('case and surrounding spaces only match the same listed person', async () => {
    const at = day();
    const q = await queue('  TESTER@Example.org ', at);
    const r = fake();
    await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send });
    expect(r.sent).toHaveLength(1);
    expect((await row(q.id)).status).toBe('sent');
  });
  it('an unlisted email is not sent even when it is the only one queued, and nothing is audited for it', async () => {
    const at = day();
    const q = await queue('someone.real@example.com', at);
    const r = fake();
    expect(await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send })).toMatchObject({ sent: 0 });
    expect(r.sent).toEqual([]);
    const audits = await sql`SELECT 1 FROM audit_events WHERE details->>'outboxId' = ${q.id}`;
    expect(audits).toHaveLength(0);
  });
});

describe('V3 expired links', () => {
  it.each([
    ['password_reset', 31 * 60_000, 'cancelled'],
    ['password_reset', 29 * 60_000, 'sent'],
    ['confirm_email', 25 * 3_600_000, 'cancelled'],
    ['confirm_email', 23 * 3_600_000, 'sent'],
    ['enquiry_accepted', 71 * 3_600_000, 'sent'],
  ])('%s queued %d ms ago → %s', async (template, age, expected) => {
    const at = day();
    const q = await queue('tester@example.org', new Date(at.getTime() - age), template);
    const r = fake();
    await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send });
    expect((await row(q.id)).status).toBe(expected);
    expect(r.sent).toHaveLength(expected === 'sent' ? 1 : 0);
    expect(JSON.stringify((await row(q.id)).payload)).not.toContain('token=');
  });
  it('older than 72 hours: never picked up or sent', async () => {
    const at = day();
    const q = await queue('tester@example.org', new Date(at.getTime() - 73 * 3_600_000), 'enquiry_accepted');
    const r = fake();
    await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send });
    expect(r.sent).toEqual([]);
    expect((await row(q.id)).status).toBe('pending');
  });
});

describe('V4 duplicate-send prevention', () => {
  it('a sent email is never sent again by later runs; same idempotency key on a retry', async () => {
    const at = day();
    const q = await queue('tester@example.org', at);
    const r = fake([{ ok: false, kind: 'retry', retryAfterSeconds: null }]);
    await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send }); // outage
    await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send }); // succeeds
    for (let i = 0; i < 5; i++) await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send });
    expect(r.sent.map((e) => e.idempotencyKey)).toEqual([`aa-pro-outbox-${q.id}`, `aa-pro-outbox-${q.id}`]);
    expect((await row(q.id)).status).toBe('sent');
  });
  it('five senders at once: each email exactly once', async () => {
    const at = day();
    const qs = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((i) => queue('tester@example.org', new Date(at.getTime() + i))),
    );
    const r = fake();
    await Promise.all([0, 1, 2, 3, 4].map(() => dispatchPendingEmails(sql, config(), { now: () => at, send: r.send })));
    expect(r.sent.map((e) => e.idempotencyKey).sort()).toEqual(qs.map((q) => `aa-pro-outbox-${q.id}`).sort());
  });
  it('the same notice queued twice (same dedupe key) is stored once', async () => {
    const key = randomUUID();
    for (let i = 0; i < 2; i++) {
      await sql`INSERT INTO email_outbox (to_address, template, payload, dedupe_key)
                VALUES ('tester@example.org', 'password_reset', ${sql.json({})}, ${key}) ON CONFLICT (dedupe_key) DO NOTHING`;
    }
    expect(await sql`SELECT 1 FROM email_outbox WHERE dedupe_key = ${key}`).toHaveLength(1);
    await sql`UPDATE email_outbox SET status = 'cancelled' WHERE dedupe_key = ${key}`;
  });
});

describe('V5 quotas and caps', () => {
  it("Resend's monthly quota pauses until the 1st of next month (UTC)", async () => {
    const at = day();
    const q = await queue('tester@example.org', at);
    const r = fake([{ ok: false, kind: 'quota_monthly' }]);
    const out = await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send });
    expect(out).toMatchObject({ status: 'paused', reason: 'provider_monthly_quota' });
    expect((out as { until: Date }).until.toISOString()).toBe(`${year}-06-01T00:00:00.000Z`);
    expect((await row(q.id)).status).toBe('pending');
    const r2 = fake();
    await dispatchPendingEmails(sql, config(), { now: () => new Date(`${year}-05-31T23:00:00Z`), send: r2.send });
    expect(r2.sent).toEqual([]);
  });
  it("AA Pro's own monthly cap stops before Resend's limit", async () => {
    const at = day();
    await queue('tester@example.org', at);
    const b = await queue('tester@example.org', new Date(at.getTime() + 1));
    const r = fake();
    const out = await dispatchPendingEmails(sql, config({ perMonth: 1 }), { now: () => at, send: r.send });
    expect(out).toMatchObject({ sent: 1, stoppedBecause: 'own_monthly_limit' });
    expect((await row(b.id)).status).toBe('pending');
  });
});

describe('V6 Resend outages and errors through the real client (fake network)', () => {
  const resp = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });
  const email: OutgoingEmail = {
    from: 'AA Pro <no-reply@example.org>',
    to: 'tester@example.org',
    subject: 's',
    text: 'https://example.org/reset-password?token=SECRET',
    html: '',
    idempotencyKey: 'aa-pro-outbox-x',
  };
  it.each([
    ['500 outage', () => resp(500, { name: 'internal_server_error' }), 'retry'],
    ['503', () => resp(503, {}), 'retry'],
    ['429 rate limit', () => resp(429, { name: 'rate_limit_exceeded' }, { 'retry-after': '2' }), 'retry'],
    ['429 daily quota', () => resp(429, { name: 'daily_quota_exceeded' }), 'quota_daily'],
    ['429 monthly quota', () => resp(429, { name: 'monthly_quota_exceeded' }), 'quota_monthly'],
    ['401 bad key', () => resp(401, { name: 'missing_api_key' }), 'auth'],
    [
      '403 unverified domain',
      () => resp(403, { name: 'validation_error', message: 'tester@example.org not allowed' }),
      'auth',
    ],
    [
      '422 invalid recipient',
      () => resp(422, { name: 'validation_error', message: 'Invalid `to` field: tester@example.org' }),
      'rejected',
    ],
    [
      'network failure',
      () => {
        throw new TypeError('fetch failed');
      },
      'retry',
    ],
    ['not JSON', () => new Response('<html>', { status: 502 }), 'retry'],
  ])('%s → %s, with no address, key or link in the result', async (_n, make, kind) => {
    const res = await sendWithResend(KEY, email, async () => make());
    expect(res).toMatchObject({ ok: false, kind });
    expect(JSON.stringify(res)).not.toMatch(/@|SECRET|re_verify/);
  });
});

describe('V7 audit log and console output stay free of addresses, links, tokens and keys', () => {
  it('every email audit event written by these tests is clean', async () => {
    const at = day();
    await queue('tester@example.org', at);
    await queue('tester@example.org', new Date(at.getTime() + 1));
    const r = fake([
      { ok: false, kind: 'rejected', error: 'validation_error' },
      { ok: false, kind: 'auth', error: 'validation_error' },
    ]);
    await dispatchPendingEmails(sql, config(), { now: () => at, send: r.send });
    const rows = await sql<
      Record<string, unknown>[]
    >`SELECT * FROM audit_events WHERE event_type IN ('EMAIL_SENT', 'EMAIL_FAILED', 'EMAIL_NOT_SENT', 'EMAIL_SENDING_PAUSED')`;
    expect(rows.length).toBeGreaterThan(10);
    for (const a of rows) {
      expect(JSON.stringify(a)).not.toMatch(/@|token|re_verify|https?:/i);
    }
    expect(new Set(rows.map((a) => a.event_type))).toEqual(
      new Set(['EMAIL_SENT', 'EMAIL_FAILED', 'EMAIL_NOT_SENT', 'EMAIL_SENDING_PAUSED']),
    );
  });
  it('nothing was written to the console during any of these tests', () => {
    expect(logged).toEqual([]);
  });
});
