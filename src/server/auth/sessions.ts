import 'server-only';
import type { Db, Sql } from '@/server/db/client';
import { hashToken, newToken } from './tokens';

/**
 * Server-side sessions (G1-08 §3.2, migration 0001 `sessions`). The cookie holds a random
 * token; the database stores only its SHA-256. Sessions can be revoked at once, and a session
 * stops working when the account's credential version changes (password reset) or the account
 * is no longer active.
 */
export const SESSION_COOKIE = 'aa_session';

/** Idle and absolute lifetimes in minutes. Children: as approved in OC-35 (G1-08 §3.2). */
export const SESSION_POLICY: Record<string, { idleMinutes: number; absoluteMinutes: number }> = {
  student: { idleMinutes: 60, absoluteMinutes: 12 * 60 },
  parent: { idleMinutes: 120, absoluteMinutes: 12 * 60 },
  teacher: { idleMinutes: 120, absoluteMinutes: 12 * 60 },
  admin: { idleMinutes: 30, absoluteMinutes: 8 * 60 },
  superadmin: { idleMinutes: 30, absoluteMinutes: 8 * 60 },
};

/** Activity extends the idle expiry at most once a minute, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60_000;

const minutes = (n: number) => n * 60_000;

export interface SessionAccount {
  id: string;
  role: string;
  credential_version: number;
}

export interface ActiveSession {
  accountId: string;
  role: string;
  /** 'active', or 'pending_approval' for a teacher who may see only their status page (OC-38). */
  status: 'active' | 'pending_approval';
  displayName: string;
  timeZone: string;
  createdAt: Date;
  reauthenticatedAt: Date;
  mfaVerifiedAt: Date | null;
}

function policyFor(role: string) {
  const policy = SESSION_POLICY[role];
  if (!policy) throw new Error(`No session policy for role ${role}`);
  return policy;
}

/** Starts a session and returns the token for the cookie. Call only after a successful sign-in. */
export async function createSession(
  sql: Sql,
  account: SessionAccount,
  now: Date = new Date(),
): Promise<{ token: string; absoluteExpiresAt: Date }> {
  const policy = policyFor(account.role);
  const token = newToken();
  const absoluteExpiresAt = new Date(now.getTime() + minutes(policy.absoluteMinutes));
  const idleExpiresAt = new Date(Math.min(now.getTime() + minutes(policy.idleMinutes), absoluteExpiresAt.getTime()));
  await sql`
    INSERT INTO sessions (id_hash, account_id, credential_version, created_at, last_seen_at,
                          idle_expires_at, absolute_expires_at, reauthenticated_at)
    VALUES (${hashToken(token)}, ${account.id}, ${account.credential_version}, ${now}, ${now},
            ${idleExpiresAt}, ${absoluteExpiresAt}, ${now})`;
  return { token, absoluteExpiresAt };
}

/**
 * Returns the active session for a cookie token, or null. Expired, revoked or stale sessions
 * (password changed, account no longer active) are never returned.
 */
export async function loadSession(
  sql: Sql,
  token: string | undefined,
  now: Date = new Date(),
): Promise<ActiveSession | null> {
  if (!token || token.length > 200) return null;
  const idHash = hashToken(token);
  const rows = await sql<
    Array<{
      account_id: string;
      role: string;
      status: 'active' | 'pending_approval';
      display_name: string;
      time_zone: string;
      created_at: Date;
      last_seen_at: Date;
      absolute_expires_at: Date;
      reauthenticated_at: Date;
      mfa_verified_at: Date | null;
    }>
  >`
    SELECT s.account_id, a.role, a.status, a.display_name, a.time_zone, s.created_at, s.last_seen_at,
           s.absolute_expires_at, s.reauthenticated_at, s.mfa_verified_at
    FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.id_hash = ${idHash}
      AND s.revoked_at IS NULL
      AND s.idle_expires_at > ${now}
      AND s.absolute_expires_at > ${now}
      AND s.credential_version = a.credential_version
      AND (a.status = 'active' OR (a.status = 'pending_approval' AND a.role = 'teacher'))`;
  const row = rows[0];
  if (!row) return null;

  if (now.getTime() - row.last_seen_at.getTime() >= TOUCH_INTERVAL_MS) {
    const policy = policyFor(row.role);
    const idleExpiresAt = new Date(
      Math.min(now.getTime() + minutes(policy.idleMinutes), row.absolute_expires_at.getTime()),
    );
    await sql`UPDATE sessions SET last_seen_at = ${now}, idle_expires_at = ${idleExpiresAt} WHERE id_hash = ${idHash}`;
  }
  return {
    accountId: row.account_id,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    timeZone: row.time_zone,
    createdAt: row.created_at,
    reauthenticatedAt: row.reauthenticated_at,
    mfaVerifiedAt: row.mfa_verified_at,
  };
}

/** Signs out one session (the cookie's). */
export async function revokeSession(sql: Sql, token: string, now: Date = new Date()): Promise<void> {
  await sql`UPDATE sessions SET revoked_at = ${now} WHERE id_hash = ${hashToken(token)} AND revoked_at IS NULL`;
}

/** Signs an account out everywhere, e.g. after a password reset (G1-08 §3.4 step 6). */
export async function revokeAllSessions(sql: Db, accountId: string, now: Date = new Date()): Promise<number> {
  const result =
    await sql`UPDATE sessions SET revoked_at = ${now} WHERE account_id = ${accountId} AND revoked_at IS NULL`;
  return result.count;
}

/** Records a successful password re-entry, for step-up checks (G1-08 §3.4 step 3). */
export async function markReauthenticated(sql: Sql, token: string, now: Date = new Date()): Promise<void> {
  await sql`UPDATE sessions SET reauthenticated_at = ${now} WHERE id_hash = ${hashToken(token)} AND revoked_at IS NULL`;
}

/** Wrong password entries allowed at a step-up prompt before the session is signed out (§3.4 step 3). */
export const REAUTH_MAX_FAILURES = 5;

/**
 * Counts a wrong password at a step-up prompt. Returns true when this was the last allowed
 * try, in which case the session has been revoked.
 */
export async function recordReauthFailure(sql: Sql, token: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await sql<Array<{ reauth_failures: number }>>`
    UPDATE sessions SET reauth_failures = reauth_failures + 1,
                        revoked_at = CASE WHEN reauth_failures + 1 >= ${REAUTH_MAX_FAILURES} THEN ${now} ELSE revoked_at END
    WHERE id_hash = ${hashToken(token)} AND revoked_at IS NULL
    RETURNING reauth_failures`;
  return !row || row.reauth_failures >= REAUTH_MAX_FAILURES;
}

/** Records a correct step-up password and resets the counter. */
export async function recordReauthSuccess(sql: Sql, token: string, now: Date = new Date()): Promise<void> {
  await sql`UPDATE sessions SET reauthenticated_at = ${now}, reauth_failures = 0
            WHERE id_hash = ${hashToken(token)} AND revoked_at IS NULL`;
}

/** True when the session confirmed the password within the last `withinMinutes` (default 5). */
export function recentlyReauthenticated(session: ActiveSession, now: Date = new Date(), withinMinutes = 5): boolean {
  return now.getTime() - session.reauthenticatedAt.getTime() <= minutes(withinMinutes);
}
