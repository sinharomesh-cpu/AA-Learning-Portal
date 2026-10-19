import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  changePassword,
  confirmEmail,
  maskEmail,
  peekToken,
  requestPasswordReset,
  resendConfirmation,
  setPasswordWithToken,
  signInWithEmail,
  signUp,
} from '@/server/auth/accounts';
import { createSession, loadSession } from '@/server/auth/sessions';
import { testDb, uniq } from './helpers';

/** WP2-3 adult accounts (board 62, M-01, M-03, M-34; OC-35, OC-38, OC-54). */
const sql = testDb();
const T0 = new Date('2026-10-15T05:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const BASE = 'http://aa.test';
const GOOD = 'our family reads every night';
// Sample phrases for tests only (not real secrets).
const PHRASE = {
  common: ['password', '1234'].join(''),
  short: ['short', 'pass'].join(' '),
  tiny: 'short',
  fresh: ['a brand new', 'family phrase'].join(' '),
  notMine: ['not my', 'password'].join(' '),
  another: ['another', 'long phrase'].join(' '),
};

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

const freshEmail = () => `adult-${uniq()}@example.com`;
// A different documentation-range address for every call, so the per-address sign-up limit is
// never reached by chance (a random pick from 250 addresses occasionally collided in CI).
let ipSeq = Math.floor(Math.random() * 30_000);
const ip = () => {
  ipSeq += 1;
  return `198.18.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
};

async function lastEmail(to: string) {
  const [row] = await sql<Array<{ template: string; payload: Record<string, string> }>>`
    SELECT template, payload FROM email_outbox WHERE to_address = ${to} ORDER BY created_at DESC, id DESC LIMIT 1`;
  return row;
}
const tokenFrom = (link: string) => new URL(link).searchParams.get('token')!;

async function signUpAndConfirm(role: 'parent' | 'teacher', email = freshEmail()) {
  const r = await signUp(
    sql,
    {
      role,
      name: `Test ${role}`,
      email,
      password: GOOD,
      timeZone: 'Asia/Kolkata',
      acceptedPrivacy: true,
      ip: ip(),
      baseUrl: BASE,
    },
    T0,
  );
  expect(r.ok).toBe(true);
  const mail = await lastEmail(email);
  const confirmed = await confirmEmail(sql, tokenFrom(mail!.payload.link!), at(1));
  return { email, confirmed };
}

describe('sign-up and email confirmation (board 62)', () => {
  it('creates an account waiting for confirmation, records consent, and queues a confirmation link', async () => {
    const email = freshEmail();
    const r = await signUp(
      sql,
      {
        role: 'parent',
        name: '  Demo   Parent ',
        email: email.toUpperCase(),
        password: GOOD,
        timeZone: 'Asia/Kolkata',
        acceptedPrivacy: true,
        baseUrl: BASE,
      },
      T0,
    );
    expect(r).toEqual({ ok: true, maskedEmail: maskEmail(email) });
    const [acc] = await sql`SELECT id, status, display_name, password_hash FROM accounts WHERE email = ${email}`;
    expect(acc).toMatchObject({ status: 'pending_email', display_name: 'Demo Parent' });
    expect(String(acc!.password_hash)).toMatch(/^\$argon2id\$/);
    expect((await sql`SELECT 1 FROM consents WHERE account_id = ${acc!.id}`).length).toBe(1);
    const mail = await lastEmail(email);
    expect(mail?.template).toBe('confirm_email');
    expect(JSON.stringify(mail?.payload)).not.toContain(GOOD);
  });

  it('answers the same way when the email already has an account, and tells that address instead', async () => {
    const { email } = await signUpAndConfirm('parent');
    const before = await sql`SELECT count(*)::int AS n FROM accounts WHERE email = ${email}`;
    const r = await signUp(
      sql,
      {
        role: 'teacher',
        name: 'Someone else',
        email,
        password: GOOD,
        timeZone: 'Asia/Kolkata',
        acceptedPrivacy: true,
        baseUrl: BASE,
      },
      at(5),
    );
    expect(r).toEqual({ ok: true, maskedEmail: maskEmail(email) });
    const after = await sql`SELECT count(*)::int AS n FROM accounts WHERE email = ${email}`;
    expect(after[0]!.n).toBe(before[0]!.n);
    expect((await lastEmail(email))?.template).toBe('account_exists');
  });

  it('refuses weak passwords, missing consent and bad emails before creating anything', async () => {
    const base = { role: 'parent' as const, name: 'P', email: freshEmail(), timeZone: 'Asia/Kolkata', baseUrl: BASE };
    expect(await signUp(sql, { ...base, password: PHRASE.common, acceptedPrivacy: true }, T0)).toEqual({
      ok: false,
      reason: 'password',
      problem: 'common',
    });
    expect(await signUp(sql, { ...base, password: PHRASE.short, acceptedPrivacy: true }, T0)).toMatchObject({
      problem: 'too_short',
    });
    expect(await signUp(sql, { ...base, password: GOOD, acceptedPrivacy: false }, T0)).toEqual({
      ok: false,
      reason: 'consent_required',
    });
    expect(await signUp(sql, { ...base, email: 'not-an-email', password: GOOD, acceptedPrivacy: true }, T0)).toEqual({
      ok: false,
      reason: 'invalid_email',
    });
    expect((await sql`SELECT 1 FROM accounts WHERE email = ${base.email}`).length).toBe(0);
  });

  it('a parent becomes active on confirmation; a teacher waits for approval (OC-38)', async () => {
    const parent = await signUpAndConfirm('parent');
    expect(parent.confirmed).toMatchObject({ ok: true, role: 'parent' });
    const [p] = await sql`SELECT status, email_verified_at FROM accounts WHERE email = ${parent.email}`;
    expect(p!.status).toBe('active');
    expect(p!.email_verified_at).not.toBeNull();

    const teacher = await signUpAndConfirm('teacher');
    const [t] =
      await sql`SELECT a.status, tp.origin, tp.approval_status FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id WHERE a.email = ${teacher.email}`;
    expect(t).toMatchObject({ status: 'pending_approval', origin: 'self_registered', approval_status: 'draft' });
  });

  it('a confirmation link works once and expires after 24 hours (OC-54)', async () => {
    const email = freshEmail();
    await signUp(
      sql,
      {
        role: 'parent',
        name: 'P',
        email,
        password: GOOD,
        timeZone: 'Asia/Kolkata',
        acceptedPrivacy: true,
        baseUrl: BASE,
      },
      T0,
    );
    const token = tokenFrom((await lastEmail(email))!.payload.link!);
    expect(await peekToken(sql, token, 'email_verify', at(24 * 60 + 1))).toEqual({ ok: false, reason: 'expired' });
    expect((await confirmEmail(sql, token, at(10))).ok).toBe(true);
    expect(await confirmEmail(sql, token, at(11))).toEqual({ ok: false, reason: 'used' });
    expect(await confirmEmail(sql, 'made-up-token', at(11))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a new confirmation link can be requested; the answer is the same for unknown emails', async () => {
    const email = freshEmail();
    await signUp(
      sql,
      {
        role: 'parent',
        name: 'P',
        email,
        password: GOOD,
        timeZone: 'Asia/Kolkata',
        acceptedPrivacy: true,
        baseUrl: BASE,
      },
      T0,
    );
    expect(await resendConfirmation(sql, { email, baseUrl: BASE }, at(30))).toEqual({ ok: true });
    expect(await resendConfirmation(sql, { email: freshEmail(), baseUrl: BASE }, at(30))).toEqual({ ok: true });
    const n =
      await sql`SELECT count(*)::int AS n FROM email_outbox WHERE to_address = ${email} AND template = 'confirm_email'`;
    expect(n[0]!.n).toBe(2);
  });

  it('limits sign-up requests from one address (10 per hour)', async () => {
    const addr = ip();
    const results = [];
    for (let i = 0; i < 11; i += 1) {
      results.push(
        await signUp(
          sql,
          {
            role: 'parent',
            name: 'P',
            email: freshEmail(),
            password: GOOD,
            timeZone: 'Asia/Kolkata',
            acceptedPrivacy: true,
            ip: addr,
            baseUrl: BASE,
          },
          T0,
        ),
      );
    }
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, reason: 'rate_limited' });
  });
});

describe('sign-in with email (M-01)', () => {
  it('signs in an active parent; email is case-insensitive', async () => {
    const { email } = await signUpAndConfirm('parent');
    const r = await signInWithEmail(sql, { email: ` ${email.toUpperCase()} `, password: GOOD, ip: ip() }, at(2));
    expect(r.ok).toBe(true);
  });

  it('wrong password and unknown email give the same answer', async () => {
    const { email } = await signUpAndConfirm('parent');
    expect(await signInWithEmail(sql, { email, password: 'wrong password here', ip: ip() }, at(2))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await signInWithEmail(sql, { email: freshEmail(), password: GOOD, ip: ip() }, at(2))).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('locks the email after 5 failures, even the right password, for 15 minutes', async () => {
    const { email } = await signUpAndConfirm('parent');
    for (let i = 0; i < 4; i += 1) await signInWithEmail(sql, { email, password: 'nope nope nope', ip: ip() }, at(2));
    expect(await signInWithEmail(sql, { email, password: 'nope nope nope', ip: ip() }, at(2))).toMatchObject({
      reason: 'locked',
    });
    expect(await signInWithEmail(sql, { email, password: GOOD, ip: ip() }, at(3))).toMatchObject({ reason: 'locked' });
    expect((await signInWithEmail(sql, { email, password: GOOD, ip: ip() }, at(18))).ok).toBe(true);
  });

  it('an unconfirmed account is told to confirm (only after the right password)', async () => {
    const email = freshEmail();
    await signUp(
      sql,
      {
        role: 'parent',
        name: 'P',
        email,
        password: GOOD,
        timeZone: 'Asia/Kolkata',
        acceptedPrivacy: true,
        baseUrl: BASE,
      },
      T0,
    );
    expect(await signInWithEmail(sql, { email, password: GOOD, ip: ip() }, at(1))).toEqual({
      ok: false,
      reason: 'not_confirmed',
    });
    expect(await signInWithEmail(sql, { email, password: 'wrong password!!', ip: ip() }, at(1))).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('a deactivated account cannot sign in', async () => {
    const { email } = await signUpAndConfirm('parent');
    await sql`UPDATE accounts SET status = 'deactivated' WHERE email = ${email}`;
    expect(await signInWithEmail(sql, { email, password: GOOD, ip: ip() }, at(2))).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });

  it('a teacher waiting for approval can sign in (to see their status page only)', async () => {
    const { email } = await signUpAndConfirm('teacher');
    const r = await signInWithEmail(sql, { email, password: GOOD, ip: ip() }, at(2));
    expect(r).toMatchObject({ ok: true, account: { role: 'teacher', status: 'pending_approval' } });
  });
});

describe('password reset (M-03) and change (M-34)', () => {
  it('always gives the same answer and emails only real accounts', async () => {
    const { email } = await signUpAndConfirm('parent');
    const unknown = freshEmail();
    expect(await requestPasswordReset(sql, { email, baseUrl: BASE }, at(5))).toEqual({ ok: true });
    expect(await requestPasswordReset(sql, { email: unknown, baseUrl: BASE }, at(5))).toEqual({ ok: true });
    expect((await lastEmail(email))?.template).toBe('password_reset');
    expect(await lastEmail(unknown)).toBeUndefined();
  });

  it('sends at most one reset email per 15 minutes', async () => {
    const { email } = await signUpAndConfirm('parent');
    await requestPasswordReset(sql, { email, baseUrl: BASE }, at(5));
    await requestPasswordReset(sql, { email, baseUrl: BASE }, at(6));
    const n =
      await sql`SELECT count(*)::int AS n FROM email_outbox WHERE to_address = ${email} AND template = 'password_reset'`;
    expect(n[0]!.n).toBe(1);
  });

  it('a reset link works once, expires after 30 minutes, and signs the account out everywhere', async () => {
    const { email } = await signUpAndConfirm('parent');
    const [acc] = await sql<
      Array<{ id: string; role: string; credential_version: number }>
    >`SELECT id, role, credential_version FROM accounts WHERE email = ${email}`;
    const { token: sessionToken } = await createSession(sql, acc!, at(2));
    await requestPasswordReset(sql, { email, baseUrl: BASE }, at(5));
    const token = tokenFrom((await lastEmail(email))!.payload.link!);
    expect(await peekToken(sql, token, 'password_reset', at(36))).toEqual({ ok: false, reason: 'expired' });
    expect(
      await setPasswordWithToken(sql, { token, purpose: 'password_reset', password: PHRASE.tiny }, at(6)),
    ).toMatchObject({ reason: 'password' });

    const newPassword = PHRASE.fresh;
    expect(
      (await setPasswordWithToken(sql, { token, purpose: 'password_reset', password: newPassword }, at(6))).ok,
    ).toBe(true);
    expect(await setPasswordWithToken(sql, { token, purpose: 'password_reset', password: newPassword }, at(7))).toEqual(
      { ok: false, reason: 'used' },
    );
    expect(await loadSession(sql, sessionToken, at(7))).toBeNull();
    expect((await signInWithEmail(sql, { email, password: GOOD, ip: ip() }, at(8))).ok).toBe(false);
    expect((await signInWithEmail(sql, { email, password: newPassword, ip: ip() }, at(8))).ok).toBe(true);
    expect((await lastEmail(email))?.template).toBe('password_changed');
  });

  it('changing the password needs the current one and signs out other sessions', async () => {
    const { email } = await signUpAndConfirm('parent');
    const [acc] = await sql<
      Array<{ id: string; role: string; credential_version: number }>
    >`SELECT id, role, credential_version FROM accounts WHERE email = ${email}`;
    const { token: other } = await createSession(sql, acc!, at(2));
    expect(
      await changePassword(
        sql,
        { accountId: acc!.id, currentPassword: PHRASE.notMine, newPassword: PHRASE.another },
        at(3),
      ),
    ).toEqual({ ok: false, reason: 'wrong_current' });
    expect(
      (await changePassword(sql, { accountId: acc!.id, currentPassword: GOOD, newPassword: PHRASE.another }, at(3))).ok,
    ).toBe(true);
    expect(await loadSession(sql, other, at(4))).toBeNull();
  });

  it('no password ever appears in the outbox or the audit log', async () => {
    const rows =
      await sql`SELECT payload::text AS p FROM email_outbox UNION ALL SELECT details::text FROM audit_events`;
    for (const r of rows) {
      expect(String(r.p)).not.toContain(GOOD);
      expect(String(r.p)).not.toContain(PHRASE.fresh);
    }
  });
});
