import { randomBytes } from 'node:crypto';
import { generate } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setPasswordWithToken, signInWithEmail } from '@/server/auth/accounts';
import {
  confirmEnrolment,
  decryptSecret,
  mfaRecent,
  mfaState,
  recoveryCodesLeft,
  redeemRecoveryCode,
  replaceRecoveryCodes,
  resetAuthenticator,
  startEnrolment,
  verifyMfaCode,
} from '@/server/auth/mfa';
import { ownerSetupOpen, requestOwnerSetup } from '@/server/auth/owner';
import { createSession, loadSession } from '@/server/auth/sessions';
import { testDb } from './helpers';

/** WP2-5a: owner set-up, security codes and recovery codes (OC-50, M-26, board 66). */
const sql = testDb();
const T0 = new Date('2026-10-16T05:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const BASE = 'http://aa.test';
const OWNER = 'owner@example.com';
// Sample phrase for tests only (not a real secret).
const PHRASE = ['owner', 'keeps', 'the', 'keys'].join(' ');

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());
beforeEach(async () => {
  process.env.AA_SUPERADMIN_EMAIL = OWNER;
  // Test-only reset: audit rows keep their references, so the previous Super Admin is turned
  // into an ordinary account instead of being deleted (there can only be one Super Admin).
  await sql`UPDATE accounts SET role = 'parent', email = ${`old-owner-${randomBytes(4).toString('hex')}@example.com`}
            WHERE role = 'superadmin'`;
});

const codeAt = (secret: string, when: Date) => generate({ secret, epoch: Math.floor(when.getTime() / 1000) });

async function ownerWithPassword() {
  await requestOwnerSetup(sql, { email: 'Owner@Example.com ', name: 'Owner', baseUrl: BASE }, T0);
  const [mail] = await sql<Array<{ payload: { link: string } }>>`
    SELECT payload FROM email_outbox WHERE to_address = ${OWNER} AND template = 'owner_set_password'
    ORDER BY created_at DESC, id DESC LIMIT 1`;
  const token = new URL(mail!.payload.link).searchParams.get('token')!;
  const set = await setPasswordWithToken(sql, { token, purpose: 'set_password', password: PHRASE }, T0);
  expect(set.ok).toBe(true);
  const signIn = await signInWithEmail(sql, { email: OWNER, password: PHRASE }, T0);
  if (!signIn.ok) throw new Error(signIn.reason);
  const session = await createSession(sql, signIn.account, T0);
  return { accountId: signIn.account.id, token: session.token };
}

async function enrolled() {
  const owner = await ownerWithPassword();
  const enrolment = await startEnrolment(sql, { id: owner.accountId, email: OWNER }, T0);
  const r = await confirmEnrolment(
    sql,
    { accountId: owner.accountId, sessionToken: owner.token, code: await codeAt(enrolment!.secret, T0) },
    T0,
  );
  if (!r.ok) throw new Error(r.reason);
  return { ...owner, secret: enrolment!.secret, codes: r.recoveryCodes };
}

describe('owner set-up (OC-50)', () => {
  it('sends a link only to the configured owner email, and answers the same otherwise', async () => {
    expect(await requestOwnerSetup(sql, { email: 'someone@example.com', name: 'X', baseUrl: BASE }, T0)).toEqual({
      ok: true,
    });
    expect(await sql`SELECT 1 FROM accounts WHERE role = 'superadmin'`).toHaveLength(0);
    expect(await requestOwnerSetup(sql, { email: OWNER, name: 'Owner', baseUrl: BASE }, T0)).toEqual({ ok: true });
    const [row] = await sql`SELECT status, password_hash FROM accounts WHERE role = 'superadmin'`;
    expect(row).toMatchObject({ status: 'active', password_hash: null });
  });

  it('closes once the owner has a password; there is only ever one Super Admin', async () => {
    await ownerWithPassword();
    expect(await ownerSetupOpen(sql)).toBe(false);
    expect(await requestOwnerSetup(sql, { email: OWNER, name: 'Owner', baseUrl: BASE }, T0)).toEqual({
      ok: false,
      reason: 'closed',
    });
    await expect(
      sql`INSERT INTO accounts (role, status, email, display_name) VALUES ('superadmin', 'active', 'second@example.com', 'Two')`,
    ).rejects.toThrow(/accounts_one_superadmin/);
  });

  it('is closed when no owner email is configured', async () => {
    delete process.env.AA_SUPERADMIN_EMAIL;
    expect(await ownerSetupOpen(sql)).toBe(false);
  });

  it('a new Super Admin session starts without the security-code check', async () => {
    const { token } = await ownerWithPassword();
    expect((await loadSession(sql, token, at(1)))?.mfaVerifiedAt).toBeNull();
  });
});

describe('authenticator app (M-26)', () => {
  it('stores the secret encrypted and confirms enrolment with a code', async () => {
    const owner = await ownerWithPassword();
    const enrolment = await startEnrolment(sql, { id: owner.accountId, email: OWNER }, T0);
    expect(enrolment?.uri).toMatch(/^otpauth:\/\/totp\/AA%20Pro:owner%40example\.com\?/);
    expect(enrolment?.qrSvg).toContain('<svg');
    const [row] = await sql<
      Array<{ secret_enc: Buffer }>
    >`SELECT secret_enc FROM mfa_factors WHERE account_id = ${owner.accountId}`;
    expect(row!.secret_enc.toString('latin1')).not.toContain(enrolment!.secret);
    expect(decryptSecret(row!.secret_enc)).toBe(enrolment!.secret);

    const wrong = await confirmEnrolment(
      sql,
      { accountId: owner.accountId, sessionToken: owner.token, code: '000000' },
      T0,
    );
    expect(wrong).toEqual({ ok: false, reason: 'wrong_code' });
    const r = await confirmEnrolment(
      sql,
      { accountId: owner.accountId, sessionToken: owner.token, code: await codeAt(enrolment!.secret, T0) },
      T0,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recoveryCodes).toHaveLength(10);
      for (const c of r.recoveryCodes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
    expect((await mfaState(sql, owner.accountId)).enrolled).toBe(true);
    expect((await loadSession(sql, owner.token, at(1)))?.mfaVerifiedAt).not.toBeNull();
    expect(await startEnrolment(sql, { id: owner.accountId, email: OWNER }, T0)).toBeNull();
  });

  it('accepts a fresh code, refuses the same code twice and allows 30 seconds of clock drift', async () => {
    const { accountId, secret } = await enrolled();
    const s2 = await createSession(sql, { id: accountId, role: 'superadmin', credential_version: 2 }, at(60));
    const code = await codeAt(secret, at(60));
    expect(await verifyMfaCode(sql, { accountId, sessionToken: s2.token, code }, at(60))).toEqual({ ok: true });
    const s3 = await createSession(sql, { id: accountId, role: 'superadmin', credential_version: 2 }, at(61));
    expect(await verifyMfaCode(sql, { accountId, sessionToken: s3.token, code }, at(61))).toEqual({
      ok: false,
      reason: 'wrong_code',
    });
    // A code from the next 30-second window is still accepted (phone clock slightly ahead).
    expect(
      await verifyMfaCode(sql, { accountId, sessionToken: s3.token, code: await codeAt(secret, at(120)) }, at(95)),
    ).toEqual({ ok: true });
  });

  it('five wrong codes sign the session out', async () => {
    const { accountId } = await enrolled();
    const s = await createSession(sql, { id: accountId, role: 'superadmin', credential_version: 2 }, at(60));
    for (let i = 0; i < 4; i++) {
      expect(await verifyMfaCode(sql, { accountId, sessionToken: s.token, code: '123456' }, at(60))).toEqual({
        ok: false,
        reason: 'wrong_code',
      });
    }
    expect(await verifyMfaCode(sql, { accountId, sessionToken: s.token, code: '123456' }, at(60))).toEqual({
      ok: false,
      reason: 'signed_out',
    });
    expect(await loadSession(sql, s.token, at(61))).toBeNull();
    const failures =
      await sql`SELECT 1 FROM audit_events WHERE subject_id = ${accountId} AND event_type = 'MFA_FAILED'`;
    expect(failures).toHaveLength(5);
  });
});

describe('recovery codes (OC-50)', () => {
  it('each code works once, with or without the dash', async () => {
    const { accountId, codes } = await enrolled();
    const s = await createSession(sql, { id: accountId, role: 'superadmin', credential_version: 2 }, at(60));
    const code = codes[0]!;
    expect(
      await redeemRecoveryCode(
        sql,
        { accountId, sessionToken: s.token, code: code.replace('-', '').toLowerCase() },
        at(60),
      ),
    ).toEqual({ ok: true, remaining: 9 });
    const s2 = await createSession(sql, { id: accountId, role: 'superadmin', credential_version: 2 }, at(61));
    expect(await redeemRecoveryCode(sql, { accountId, sessionToken: s2.token, code }, at(61))).toEqual({
      ok: false,
      reason: 'wrong_code',
    });
    expect(await recoveryCodesLeft(sql, accountId)).toBe(9);
  });

  it('a new set cancels the old one; only hashes are stored', async () => {
    const { accountId, codes } = await enrolled();
    const fresh = await replaceRecoveryCodes(sql, accountId, at(60));
    const s = await createSession(sql, { id: accountId, role: 'superadmin', credential_version: 2 }, at(61));
    expect((await redeemRecoveryCode(sql, { accountId, sessionToken: s.token, code: codes[1]! }, at(61))).ok).toBe(
      false,
    );
    expect((await redeemRecoveryCode(sql, { accountId, sessionToken: s.token, code: fresh[0]! }, at(62))).ok).toBe(
      true,
    );
    const stored = JSON.stringify(await sql`SELECT * FROM recovery_codes WHERE account_id = ${accountId}`);
    for (const c of fresh) expect(stored).not.toContain(c.replace('-', ''));
  });

  it('resetting the authenticator asks every session to set up again', async () => {
    const { accountId, token } = await enrolled();
    await resetAuthenticator(sql, accountId, at(60));
    expect((await mfaState(sql, accountId)).enrolled).toBe(false);
    expect((await loadSession(sql, token, at(61)))?.mfaVerifiedAt).toBeNull();
  });

  it('security changes need a recent code check', () => {
    expect(mfaRecent(null, T0)).toBe(false);
    expect(mfaRecent(at(-9 * 60), T0)).toBe(true);
    expect(mfaRecent(at(-11 * 60), T0)).toBe(false);
  });

  it('audit records never hold codes', async () => {
    const { accountId, codes, secret } = await enrolled();
    const text = JSON.stringify(await sql`SELECT details FROM audit_events WHERE subject_id = ${accountId}`);
    expect(text).not.toContain(secret);
    for (const c of codes) expect(text).not.toContain(c);
  });
});
