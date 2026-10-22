import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { requestPasswordReset } from '@/server/auth/accounts';
import { createAdult, testDb } from './helpers';

/**
 * OC-133 end to end inside AA Pro: the existing "forgot password" flow queues the email as it
 * always did; with sending switched on, it goes to Resend once the request has finished. Next's
 * after() and the network are replaced by fakes, so nothing leaves the machine.
 */
const pending: Array<() => Promise<void>> = [];
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => pending.push(fn) }));

const sql = testDb();
const calls: Array<{ url: string; headers: Record<string, string>; body: { to: string[]; text: string } }> = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
  process.env.DATABASE_URL = inject('databaseUrl');
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ id: 'email_fake_1' }), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  for (const k of [
    'EMAIL_PROVIDER',
    'EMAIL_SENDING',
    'EMAIL_PROVIDER_API_KEY',
    'EMAIL_FROM_ADDRESS',
    'EMAIL_ALLOWED_RECIPIENTS',
  ]) {
    delete process.env[k];
  }
  pending.length = 0;
  calls.length = 0;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  await sql.end();
});

async function parentWithEmail(email: string) {
  const id = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET email = ${email} WHERE id = ${id}`;
  return id;
}

describe('the existing password-reset flow with Resend switched on', () => {
  it('switched off (the default): the email is queued and nothing is scheduled or sent', async () => {
    const email = `off-${Date.now()}@example.org`;
    await parentWithEmail(email);
    expect(await requestPasswordReset(sql, { email, baseUrl: 'https://example.org' })).toMatchObject({ ok: true });
    const [row] = await sql<{ status: string }[]>`SELECT status FROM email_outbox WHERE to_address = ${email}`;
    expect(row!.status).toBe('pending');
    expect(pending).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('switched on: the reset email goes to Resend after the response, once, with the link', async () => {
    const email = `delivered+reset${Date.now()}@example.org`;
    await parentWithEmail(email);
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'resend',
      EMAIL_SENDING: 'on',
      EMAIL_PROVIDER_API_KEY: 're_test_000000000000', // pragma: allowlist secret (fake key)
      EMAIL_FROM_ADDRESS: 'AA Pro <no-reply@example.org>',
      EMAIL_ALLOWED_RECIPIENTS: email,
    });
    expect(await requestPasswordReset(sql, { email, baseUrl: 'https://example.org' })).toMatchObject({ ok: true });
    expect(calls).toHaveLength(0); // nothing during the request itself
    expect(pending.length).toBeGreaterThan(0);
    for (const run of pending.splice(0)) await run();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.body.to).toEqual([email]);
    expect(calls[0]!.body.text).toMatch(/https:\/\/example\.org\/reset-password\?token=[A-Za-z0-9_-]+/);
    const [row] = await sql<{ status: string; payload: Record<string, string> }[]>`
      SELECT status, payload FROM email_outbox WHERE to_address = ${email}`;
    expect(row!.status).toBe('sent');
    expect(row!.payload.link).toBe('(link removed after sending)');
  });
});
