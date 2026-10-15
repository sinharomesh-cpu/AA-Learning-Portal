import 'server-only';
import type { Db, Sql } from '@/server/db/client';
import { writeAudit } from './audit';
import { queueEmail, windowBucket } from './outbox';
import { checkNewPassword, type CredentialProblem, hashPassword, verifyPassword } from './password';
import { revokeAllSessions } from './sessions';
import { checkThrottle, normaliseIdentifier, recordFailure, recordSuccess } from './throttle';
import { hashToken, keyedHash, newToken } from './tokens';

/**
 * Adult accounts: sign-up with email confirmation, sign-in, password reset and change
 * (WP2-3; boards 62, M-01, M-03, M-34; OC-35, OC-38, OC-54).
 *
 * Privacy rules applied throughout:
 * - Sign-up and "forgot password" answer the same way whether or not the email has an account.
 * - Sign-in failures never say whether the email exists.
 * - Tokens are stored only as hashes, are single-use and expire.
 */
export const EMAIL_CONFIRM_HOURS = 24; // OC-54
export const PASSWORD_RESET_MINUTES = 30; // G1-08 §3.4
export const SET_PASSWORD_HOURS = 72; // OC-54
export const PRIVACY_VERSION = '2026-10-draft';

/** Per-address limit for requests that send email. */
export const REQUEST_LIMIT = { max: 10, windowMinutes: 60 };

export type AdultRole = 'parent' | 'teacher';
const ADULT_ROLES = ['parent', 'teacher', 'admin', 'superadmin'];

const hours = (n: number) => n * 3_600_000;
const minutes = (n: number) => n * 60_000;

export function normaliseEmail(email: string): string {
  return normaliseIdentifier(email);
}

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/** Masks an email for display, e.g. "p•••@example.com" (board 62). */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** Counts one email-sending request from an address; false when over the limit. */
export async function allowRequest(sql: Sql, action: string, ip: string | undefined, now: Date): Promise<boolean> {
  if (!ip) return true;
  const key = keyedHash(`request:${action}`, ip);
  return sql.begin(async (tx) => {
    await tx`INSERT INTO sign_in_throttle (kind, key_hash, failures, window_started_at)
             VALUES ('request', ${key}, 0, ${now}) ON CONFLICT DO NOTHING`;
    const [row] = await tx<Array<{ failures: number; window_started_at: Date }>>`
      SELECT failures, window_started_at FROM sign_in_throttle WHERE kind = 'request' AND key_hash = ${key} FOR UPDATE`;
    const over = !row || now.getTime() - row.window_started_at.getTime() >= minutes(REQUEST_LIMIT.windowMinutes);
    const count = (over ? 0 : (row?.failures ?? 0)) + 1;
    await tx`UPDATE sign_in_throttle SET failures = ${count}, window_started_at = ${over ? now : row!.window_started_at}
             WHERE kind = 'request' AND key_hash = ${key}`;
    return count <= REQUEST_LIMIT.max;
  });
}

async function issueToken(
  sql: Db,
  accountId: string,
  purpose: 'email_verify' | 'password_reset' | 'set_password',
  lifetimeMs: number,
  now: Date,
): Promise<string> {
  const token = newToken();
  await sql`
    INSERT INTO one_time_tokens (account_id, purpose, token_hash, expires_at, created_at)
    VALUES (${accountId}, ${purpose}, ${hashToken(token)}, ${new Date(now.getTime() + lifetimeMs)}, ${now})`;
  return token;
}

export type TokenCheck = { ok: true; accountId: string } | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/** Looks up a one-time token without using it. */
export async function peekToken(
  sql: Sql,
  token: string,
  purpose: 'email_verify' | 'password_reset' | 'set_password',
  now: Date = new Date(),
): Promise<TokenCheck> {
  if (!token || token.length > 200) return { ok: false, reason: 'invalid' };
  const [row] = await sql<Array<{ account_id: string; expires_at: Date; used_at: Date | null }>>`
    SELECT account_id, expires_at, used_at FROM one_time_tokens
    WHERE token_hash = ${hashToken(token)} AND purpose = ${purpose}`;
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.used_at) return { ok: false, reason: 'used' };
  if (row.expires_at <= now) return { ok: false, reason: 'expired' };
  return { ok: true, accountId: row.account_id };
}

/** Marks a token used, atomically. Only one of two simultaneous requests can succeed. */
async function consumeToken(sql: Db, token: string, purpose: string, now: Date): Promise<string | null> {
  const [row] = await sql<Array<{ account_id: string }>>`
    UPDATE one_time_tokens SET used_at = ${now}
    WHERE token_hash = ${hashToken(token)} AND purpose = ${purpose} AND used_at IS NULL AND expires_at > ${now}
    RETURNING account_id`;
  return row?.account_id ?? null;
}

// ------------------------------------------------------------------ sign-up (board 62)

export interface SignUpInput {
  role: AdultRole;
  name: string;
  email: string;
  password: string;
  timeZone: string;
  acceptedPrivacy: boolean;
  ip?: string;
  baseUrl: string;
}

export type SignUpResult =
  | { ok: true; maskedEmail: string }
  | { ok: false; reason: 'invalid_name' | 'invalid_email' | 'consent_required' | 'rate_limited' }
  | { ok: false; reason: 'password'; problem: CredentialProblem };

/**
 * Creates an adult account waiting for email confirmation. If the email already has an account,
 * nothing is created and that address is told instead ("You already have an account"); the
 * person on screen sees the same answer either way (board 62).
 */
export async function signUp(sql: Sql, input: SignUpInput, now: Date = new Date()): Promise<SignUpResult> {
  const name = input.name.normalize('NFC').trim().replace(/\s+/g, ' ');
  const email = normaliseEmail(input.email);
  if (name.length < 1 || name.length > 80) return { ok: false, reason: 'invalid_name' };
  if (!looksLikeEmail(email)) return { ok: false, reason: 'invalid_email' };
  if (!input.acceptedPrivacy) return { ok: false, reason: 'consent_required' };
  const problem = checkNewPassword(input.password, 'adult');
  if (problem) return { ok: false, reason: 'password', problem };
  if (!(await allowRequest(sql, 'sign_up', input.ip, now))) return { ok: false, reason: 'rate_limited' };

  // Hash before looking the email up, so both paths take the same time.
  const passwordHash = await hashPassword(input.password);
  const result = await sql.begin(async (tx) => {
    const [existing] = await tx<Array<{ id: string }>>`SELECT id FROM accounts WHERE email = ${email}`;
    if (existing) {
      await queueEmail(tx, {
        to: email,
        template: 'account_exists',
        payload: { signInUrl: `${input.baseUrl}/sign-in`, resetUrl: `${input.baseUrl}/forgot-password` },
        dedupeKey: `account_exists:${existing.id}:${windowBucket(now, 60)}`,
      });
      return { existed: true as const, accountId: existing.id };
    }
    const [account] = await tx<Array<{ id: string }>>`
      INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone, created_at, updated_at)
      VALUES (${input.role}, 'pending_email', ${email}, ${name}, ${passwordHash}, ${input.timeZone}, ${now}, ${now})
      RETURNING id`;
    const accountId = account!.id;
    await tx`INSERT INTO consents (account_id, kind, version, accepted_at)
             VALUES (${accountId}, 'privacy_and_terms', ${PRIVACY_VERSION}, ${now})`;
    if (input.role === 'teacher') {
      await tx`INSERT INTO teacher_profiles (account_id, origin, approval_status) VALUES (${accountId}, 'self_registered', 'draft')`;
    }
    const token = await issueToken(tx, accountId, 'email_verify', hours(EMAIL_CONFIRM_HOURS), now);
    await queueEmail(tx, {
      to: email,
      template: 'confirm_email',
      payload: { name, link: `${input.baseUrl}/confirm-email?token=${token}` },
      dedupeKey: `confirm_email:${accountId}`,
    });
    return { existed: false as const, accountId };
  });
  await writeAudit(
    sql,
    {
      type: result.existed ? 'SIGN_UP_EXISTING_EMAIL' : 'SIGN_UP',
      outcome: 'success',
      subjectId: result.accountId,
      details: { role: input.role },
    },
    now,
  );
  return { ok: true, maskedEmail: maskEmail(email) };
}

export type ConfirmResult =
  { ok: true; accountId: string; role: AdultRole } | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/** Confirms an email. Parents become active; teachers continue to their profile (M-20). */
export async function confirmEmail(sql: Sql, token: string, now: Date = new Date()): Promise<ConfirmResult> {
  const peek = await peekToken(sql, token, 'email_verify', now);
  if (!peek.ok) return peek;
  return sql.begin(async (tx) => {
    const accountId = await consumeToken(tx, token, 'email_verify', now);
    if (!accountId) return { ok: false as const, reason: 'used' as const };
    const [row] = await tx<Array<{ role: AdultRole }>>`
      UPDATE accounts
      SET email_verified_at = ${now},
          status = CASE WHEN role = 'teacher' THEN 'pending_approval' ELSE 'active' END
      WHERE id = ${accountId} AND status = 'pending_email'
      RETURNING role`;
    if (!row) return { ok: false as const, reason: 'used' as const };
    await writeAudit(tx, { type: 'EMAIL_CONFIRMED', outcome: 'success', subjectId: accountId }, now);
    return { ok: true as const, accountId, role: row.role };
  });
}

/**
 * Sends a fresh confirmation link to an account still waiting for confirmation (for example
 * after the 24-hour link expired). Always answers the same way.
 */
export async function resendConfirmation(
  sql: Sql,
  input: { email: string; ip?: string; baseUrl: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'rate_limited' }> {
  if (!(await allowRequest(sql, 'resend_confirmation', input.ip, now))) return { ok: false, reason: 'rate_limited' };
  const email = normaliseEmail(input.email);
  const [account] = await sql<Array<{ id: string; display_name: string }>>`
    SELECT id, display_name FROM accounts WHERE email = ${email} AND status = 'pending_email'`;
  if (!account) return { ok: true };
  await sql.begin(async (tx) => {
    const token = newToken();
    const queued = await queueEmail(tx, {
      to: email,
      template: 'confirm_email',
      payload: { name: account.display_name, link: `${input.baseUrl}/confirm-email?token=${token}` },
      dedupeKey: `confirm_email:${account.id}:${windowBucket(now, 15)}`,
    });
    if (queued) {
      await tx`INSERT INTO one_time_tokens (account_id, purpose, token_hash, expires_at, created_at)
               VALUES (${account.id}, 'email_verify', ${hashToken(token)},
                       ${new Date(now.getTime() + hours(EMAIL_CONFIRM_HOURS))}, ${now})`;
    }
  });
  return { ok: true };
}

// ------------------------------------------------------------------ sign-in (M-01)

export type SignInResult =
  | { ok: true; account: { id: string; role: string; status: string; credential_version: number } }
  | {
      ok: false;
      reason: 'invalid' | 'locked' | 'ip_limited' | 'not_confirmed' | 'inactive';
      retryAfterSeconds?: number;
    };

/** Adult sign-in with email and password (G1-08 §3.2 identical failures). */
export async function signInWithEmail(
  sql: Sql,
  input: { email: string; password: string; ip?: string },
  now: Date = new Date(),
): Promise<SignInResult> {
  const email = normaliseEmail(input.email);
  const keys = { kind: 'email' as const, identifier: email, ip: input.ip };
  const throttle = await checkThrottle(sql, keys, now);
  if (throttle.blocked) {
    return {
      ok: false,
      reason: throttle.reason === 'ip' ? 'ip_limited' : 'locked',
      retryAfterSeconds: throttle.retryAfterSeconds,
    };
  }
  const [account] = await sql<
    Array<{ id: string; role: string; status: string; credential_version: number; password_hash: string | null }>
  >`SELECT id, role, status, credential_version, password_hash FROM accounts
    WHERE email = ${email} AND role = ANY(${ADULT_ROLES})`;
  const valid = await verifyPassword(account?.password_hash, input.password.slice(0, 256));
  if (!account || !valid) {
    const locked = await recordFailure(sql, keys, now);
    await writeAudit(
      sql,
      { type: 'SIGN_IN', outcome: 'failure', details: { method: 'email', lockStarted: locked } },
      now,
    );
    return locked ? { ok: false, reason: 'locked', retryAfterSeconds: 15 * 60 } : { ok: false, reason: 'invalid' };
  }
  await recordSuccess(sql, keys);
  if (account.status === 'pending_email') return { ok: false, reason: 'not_confirmed' };
  if (account.status === 'suspended' || account.status === 'deactivated') {
    await writeAudit(
      sql,
      { type: 'SIGN_IN', outcome: 'denied', subjectId: account.id, details: { status: account.status } },
      now,
    );
    return { ok: false, reason: 'inactive' };
  }
  // Super Admin (and later Admins) continue to the second-factor step (M-26) before any admin
  // page opens: their session starts without `mfa_verified_at` (OC-50, server/authz.ts).
  await writeAudit(
    sql,
    { type: 'SIGN_IN', outcome: 'success', subjectId: account.id, actorId: account.id, details: { method: 'email' } },
    now,
  );
  return {
    ok: true,
    account: {
      id: account.id,
      role: account.role,
      status: account.status,
      credential_version: account.credential_version,
    },
  };
}

// ------------------------------------------------------------------ password reset (M-03)

/**
 * Starts a password reset. The answer is always the same; an email is queued only for an
 * existing adult account, at most once per 15 minutes.
 */
export async function requestPasswordReset(
  sql: Sql,
  input: { email: string; ip?: string; baseUrl: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'rate_limited' }> {
  if (!(await allowRequest(sql, 'password_reset', input.ip, now))) return { ok: false, reason: 'rate_limited' };
  const email = normaliseEmail(input.email);
  if (!looksLikeEmail(email)) return { ok: true };
  const [account] = await sql<Array<{ id: string; display_name: string }>>`
    SELECT id, display_name FROM accounts
    WHERE email = ${email} AND role = ANY(${ADULT_ROLES}) AND status IN ('active', 'pending_approval')`;
  if (!account) return { ok: true };
  await sql.begin(async (tx) => {
    const token = newToken();
    const queued = await queueEmail(tx, {
      to: email,
      template: 'password_reset',
      payload: { name: account.display_name, link: `${input.baseUrl}/reset-password?token=${token}` },
      dedupeKey: `password_reset:${account.id}:${windowBucket(now, 15)}`,
    });
    if (queued) {
      await tx`INSERT INTO one_time_tokens (account_id, purpose, token_hash, expires_at, created_at)
               VALUES (${account.id}, 'password_reset', ${hashToken(token)},
                       ${new Date(now.getTime() + minutes(PASSWORD_RESET_MINUTES))}, ${now})`;
    }
  });
  await writeAudit(sql, { type: 'PASSWORD_RESET_REQUESTED', outcome: 'success', subjectId: account.id }, now);
  return { ok: true };
}

export type SetPasswordResult =
  | { ok: true; accountId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' }
  | { ok: false; reason: 'password'; problem: CredentialProblem };

/**
 * Sets a new password from a reset or set-password link. In one transaction: stores the new
 * hash, bumps the credential version, signs the account out everywhere and uses up the link
 * (G1-08 §3.4 step 6).
 */
export async function setPasswordWithToken(
  sql: Sql,
  input: { token: string; purpose: 'password_reset' | 'set_password'; password: string },
  now: Date = new Date(),
): Promise<SetPasswordResult> {
  const peek = await peekToken(sql, input.token, input.purpose, now);
  if (!peek.ok) return peek;
  const problem = checkNewPassword(input.password, 'adult');
  if (problem) return { ok: false, reason: 'password', problem };
  const passwordHash = await hashPassword(input.password);
  const result = await sql.begin(async (tx) => {
    const accountId = await consumeToken(tx, input.token, input.purpose, now);
    if (!accountId) return null;
    const [row] = await tx<Array<{ email: string; display_name: string }>>`
      UPDATE accounts SET password_hash = ${passwordHash}, credential_version = credential_version + 1,
             email_verified_at = COALESCE(email_verified_at, ${now})
      WHERE id = ${accountId} RETURNING email, display_name`;
    await revokeAllSessions(tx, accountId, now);
    // Other unused reset links for this account stop working too.
    await tx`UPDATE one_time_tokens SET used_at = ${now}
             WHERE account_id = ${accountId} AND purpose = ${input.purpose} AND used_at IS NULL`;
    if (row?.email) {
      await queueEmail(tx, {
        to: row.email,
        template: 'password_changed',
        payload: { name: row.display_name, when: now.toISOString() },
        dedupeKey: `password_changed:${accountId}:${now.getTime()}`,
      });
    }
    await writeAudit(
      tx,
      {
        type: 'PASSWORD_SET',
        outcome: 'success',
        subjectId: accountId,
        actorId: accountId,
        details: { via: input.purpose },
      },
      now,
    );
    return accountId;
  });
  return result ? { ok: true, accountId: result } : { ok: false, reason: 'used' };
}

/** Change password while signed in (M-34). Requires the current password. */
export async function changePassword(
  sql: Sql,
  input: { accountId: string; currentPassword: string; newPassword: string },
  now: Date = new Date(),
): Promise<
  { ok: true } | { ok: false; reason: 'wrong_current' } | { ok: false; reason: 'password'; problem: CredentialProblem }
> {
  const [account] = await sql<Array<{ password_hash: string | null; email: string; display_name: string }>>`
    SELECT password_hash, email, display_name FROM accounts WHERE id = ${input.accountId}`;
  if (!(await verifyPassword(account?.password_hash, input.currentPassword.slice(0, 256)))) {
    await writeAudit(
      sql,
      { type: 'PASSWORD_CHANGE', outcome: 'failure', actorId: input.accountId, subjectId: input.accountId },
      now,
    );
    return { ok: false, reason: 'wrong_current' };
  }
  const problem = checkNewPassword(input.newPassword, 'adult');
  if (problem) return { ok: false, reason: 'password', problem };
  const passwordHash = await hashPassword(input.newPassword);
  await sql.begin(async (tx) => {
    await tx`UPDATE accounts SET password_hash = ${passwordHash}, credential_version = credential_version + 1 WHERE id = ${input.accountId}`;
    await revokeAllSessions(tx, input.accountId, now);
    await queueEmail(tx, {
      to: account!.email,
      template: 'password_changed',
      payload: { name: account!.display_name, when: now.toISOString() },
      dedupeKey: `password_changed:${input.accountId}:${now.getTime()}`,
    });
    await writeAudit(
      tx,
      { type: 'PASSWORD_CHANGE', outcome: 'success', actorId: input.accountId, subjectId: input.accountId },
      now,
    );
  });
  return { ok: true };
}
