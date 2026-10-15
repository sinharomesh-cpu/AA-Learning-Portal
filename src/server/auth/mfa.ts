import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { brand } from '@/config/brand';
import type { Db, Sql } from '@/server/db/client';
import { writeAudit } from './audit';
import { hashToken, keyedHash } from './tokens';

/**
 * Second factor for the Super Admin (and, from WP2-5b, Admins): OC-21, OC-50, board M-26/66.
 *
 * - Time-based 6-digit codes from an authenticator app (RFC 6238, otplib). The secret is
 *   encrypted at rest (AES-256-GCM, key derived from AUTH_SECRET) and shown only at enrolment.
 * - A code can be used once (the last accepted time step is stored).
 * - Ten one-time recovery codes, stored only as keyed hashes and shown once.
 * - Five wrong codes in a session sign the person out. Every outcome is audited.
 */
export const RECOVERY_CODE_COUNT = 10;
export const MFA_MAX_FAILURES = 5;
/** How recent a code check must be for security changes (new codes, new authenticator). */
export const MFA_RECENT_MINUTES = 10;
// Letters and digits without look-alikes (no I, O, 0, 1). Not a secret.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // pragma: allowlist secret

function secretKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('AUTH_SECRET must be set to at least 32 characters.');
  return Buffer.from(hkdfSync('sha256', secret, 'aa-pro', 'mfa-secret-v1', 32));
}

export function encryptSecret(plain: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptSecret(stored: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), stored.subarray(0, 12));
  decipher.setAuthTag(stored.subarray(12, 28));
  return Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]).toString('utf8');
}

// ------------------------------------------------------------------ recovery codes

export function newRecoveryCode(): string {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function recoveryHash(code: string): Buffer {
  return keyedHash('recovery-code', normaliseRecoveryCode(code));
}

/** Replaces every recovery code with a fresh set and returns them once. */
export async function replaceRecoveryCodes(sql: Db, accountId: string, now: Date = new Date()): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await sql`DELETE FROM recovery_codes WHERE account_id = ${accountId}`;
  for (const code of codes) {
    await sql`INSERT INTO recovery_codes (account_id, code_hash, created_at)
              VALUES (${accountId}, ${recoveryHash(code)}, ${now})`;
  }
  await writeAudit(
    sql,
    { type: 'RECOVERY_CODES_CREATED', outcome: 'success', actorId: accountId, subjectId: accountId },
    now,
  );
  return codes;
}

export async function recoveryCodesLeft(sql: Db, accountId: string): Promise<number> {
  const [row] = await sql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM recovery_codes WHERE account_id = ${accountId} AND used_at IS NULL`;
  return row?.n ?? 0;
}

// ------------------------------------------------------------------ state

export interface MfaState {
  enrolled: boolean;
}

export async function mfaState(sql: Db, accountId: string): Promise<MfaState> {
  const [row] = await sql<Array<{ confirmed_at: Date | null }>>`
    SELECT confirmed_at FROM mfa_factors WHERE account_id = ${accountId}`;
  return { enrolled: Boolean(row?.confirmed_at) };
}

// ------------------------------------------------------------------ enrolment

export interface Enrolment {
  /** Base32 secret for typing into the app by hand. */
  secret: string;
  uri: string;
  qrSvg: string;
}

/**
 * Starts (or restarts) enrolment for an account without a confirmed factor. A new secret
 * replaces any unconfirmed one.
 */
export async function startEnrolment(
  sql: Db,
  account: { id: string; email: string },
  now: Date = new Date(),
): Promise<Enrolment | null> {
  if ((await mfaState(sql, account.id)).enrolled) return null;
  const secret = generateSecret();
  await sql`
    INSERT INTO mfa_factors (account_id, secret_enc, created_at) VALUES (${account.id}, ${encryptSecret(secret)}, ${now})
    ON CONFLICT (account_id) DO UPDATE
      SET secret_enc = EXCLUDED.secret_enc, created_at = EXCLUDED.created_at, last_time_step = NULL
      WHERE mfa_factors.confirmed_at IS NULL`;
  const uri = generateURI({ issuer: brand.productName, label: account.email, secret });
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { secret, uri, qrSvg };
}

/** Re-shows the pending enrolment (after a wrong code) without changing the secret. */
export async function pendingEnrolment(sql: Db, account: { id: string; email: string }): Promise<Enrolment | null> {
  const [row] = await sql<Array<{ secret_enc: Buffer; confirmed_at: Date | null }>>`
    SELECT secret_enc, confirmed_at FROM mfa_factors WHERE account_id = ${account.id}`;
  if (!row || row.confirmed_at) return null;
  const secret = decryptSecret(row.secret_enc);
  const uri = generateURI({ issuer: brand.productName, label: account.email, secret });
  return { secret, uri, qrSvg: await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) };
}

function cleanCode(code: string): string {
  return code.replace(/\s+/g, '');
}

async function checkCode(
  sql: Db,
  accountId: string,
  code: string,
  now: Date,
  requireConfirmed: boolean,
): Promise<{ ok: true; timeStep: number } | { ok: false }> {
  const token = cleanCode(code);
  if (!/^\d{6}$/.test(token)) return { ok: false };
  const [row] = await sql<Array<{ secret_enc: Buffer; confirmed_at: Date | null; last_time_step: string | null }>>`
    SELECT secret_enc, confirmed_at, last_time_step FROM mfa_factors WHERE account_id = ${accountId} FOR UPDATE`;
  if (!row || Boolean(row.confirmed_at) !== requireConfirmed) return { ok: false };
  const result = await verify({
    secret: decryptSecret(row.secret_enc),
    token,
    epoch: Math.floor(now.getTime() / 1000),
    // Up to two 30-second steps either side, for phones whose clock is a little off.
    epochTolerance: 60,
    ...(row.last_time_step !== null ? { afterTimeStep: Number(row.last_time_step) } : {}),
  }).catch(() => ({ valid: false as const }));
  return result.valid && 'timeStep' in result ? { ok: true, timeStep: result.timeStep } : { ok: false };
}

export type CodeResult = { ok: true } | { ok: false; reason: 'wrong_code' } | { ok: false; reason: 'signed_out' };

/** Counts a wrong code against the session; five sign it out. */
type CodeFailure = Exclude<CodeResult, { ok: true }>;

async function failure(sql: Db, accountId: string, token: string, type: string, now: Date): Promise<CodeFailure> {
  const [row] = await sql<Array<{ mfa_failures: number }>>`
    UPDATE sessions SET mfa_failures = mfa_failures + 1,
                        revoked_at = CASE WHEN mfa_failures + 1 >= ${MFA_MAX_FAILURES} THEN ${now} ELSE revoked_at END
    WHERE id_hash = ${hashToken(token)} AND revoked_at IS NULL
    RETURNING mfa_failures`;
  const signedOut = !row || row.mfa_failures >= MFA_MAX_FAILURES;
  await writeAudit(
    sql,
    { type, outcome: 'failure', actorId: accountId, subjectId: accountId, details: { signedOut } },
    now,
  );
  return signedOut ? { ok: false, reason: 'signed_out' } : { ok: false, reason: 'wrong_code' };
}

async function markVerified(sql: Db, token: string, now: Date): Promise<void> {
  await sql`UPDATE sessions SET mfa_verified_at = ${now}, mfa_failures = 0
            WHERE id_hash = ${hashToken(token)} AND revoked_at IS NULL`;
}

/** Confirms enrolment with the first code; returns the recovery codes once. */
export async function confirmEnrolment(
  sql: Sql,
  input: { accountId: string; sessionToken: string; code: string },
  now: Date = new Date(),
): Promise<{ ok: true; recoveryCodes: string[] } | CodeFailure> {
  return sql.begin(async (tx) => {
    const check = await checkCode(tx, input.accountId, input.code, now, false);
    if (!check.ok) return failure(tx, input.accountId, input.sessionToken, 'MFA_ENROL_FAILED', now);
    await tx`UPDATE mfa_factors SET confirmed_at = ${now}, last_time_step = ${check.timeStep}
             WHERE account_id = ${input.accountId}`;
    await markVerified(tx, input.sessionToken, now);
    await writeAudit(
      tx,
      { type: 'MFA_ENROLLED', outcome: 'success', actorId: input.accountId, subjectId: input.accountId },
      now,
    );
    const recoveryCodes = await replaceRecoveryCodes(tx, input.accountId, now);
    return { ok: true as const, recoveryCodes };
  });
}

/** M-26: checks the code after the password. */
export async function verifyMfaCode(
  sql: Sql,
  input: { accountId: string; sessionToken: string; code: string },
  now: Date = new Date(),
): Promise<CodeResult> {
  return sql.begin(async (tx) => {
    const check = await checkCode(tx, input.accountId, input.code, now, true);
    if (!check.ok) return failure(tx, input.accountId, input.sessionToken, 'MFA_FAILED', now);
    await tx`UPDATE mfa_factors SET last_time_step = ${check.timeStep} WHERE account_id = ${input.accountId}`;
    await markVerified(tx, input.sessionToken, now);
    await writeAudit(
      tx,
      { type: 'MFA_SUCCEEDED', outcome: 'success', actorId: input.accountId, subjectId: input.accountId },
      now,
    );
    return { ok: true as const };
  });
}

/** Signs in with a one-time recovery code instead of the app (OC-50). */
export async function redeemRecoveryCode(
  sql: Sql,
  input: { accountId: string; sessionToken: string; code: string },
  now: Date = new Date(),
): Promise<{ ok: true; remaining: number } | CodeFailure> {
  return sql.begin(async (tx) => {
    const [used] = await tx<Array<{ id: string }>>`
      UPDATE recovery_codes SET used_at = ${now}
      WHERE account_id = ${input.accountId} AND code_hash = ${recoveryHash(input.code)} AND used_at IS NULL
      RETURNING id`;
    if (!used || !(await mfaState(tx, input.accountId)).enrolled) {
      return failure(tx, input.accountId, input.sessionToken, 'RECOVERY_CODE_FAILED', now);
    }
    await markVerified(tx, input.sessionToken, now);
    const remaining = await recoveryCodesLeft(tx, input.accountId);
    await writeAudit(
      tx,
      {
        type: 'RECOVERY_CODE_USED',
        outcome: 'success',
        actorId: input.accountId,
        subjectId: input.accountId,
        details: { remaining },
      },
      now,
    );
    return { ok: true as const, remaining };
  });
}

/** True when this session passed a code check within the last MFA_RECENT_MINUTES. */
export function mfaRecent(mfaVerifiedAt: Date | null, now: Date = new Date()): boolean {
  return Boolean(mfaVerifiedAt && now.getTime() - mfaVerifiedAt.getTime() <= MFA_RECENT_MINUTES * 60_000);
}

/**
 * Removes the authenticator so a new one can be set up (for example after a lost phone and a
 * recovery-code sign-in). The caller checks `mfaRecent` first. Every session of the account
 * must pass the new set-up before using the admin pages again.
 */
export async function resetAuthenticator(sql: Sql, accountId: string, now: Date = new Date()): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM mfa_factors WHERE account_id = ${accountId}`;
    await tx`UPDATE sessions SET mfa_verified_at = NULL WHERE account_id = ${accountId} AND revoked_at IS NULL`;
    await writeAudit(tx, { type: 'MFA_RESET', outcome: 'success', actorId: accountId, subjectId: accountId }, now);
  });
}
