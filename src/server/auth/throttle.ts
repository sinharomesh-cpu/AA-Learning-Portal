import 'server-only';
import type { Db, Sql } from '@/server/db/client';
import { keyedHash } from './tokens';

/**
 * Sign-in throttling (OC-35, G1-08 §3.2).
 *
 * - Per username or email: 5 consecutive failures lock it for 15 minutes. The key is a keyed
 *   hash of the submitted value, so an unknown username locks exactly like a real one.
 * - While locked, attempts are refused without checking the password and do not extend the
 *   lock, so nobody can keep another person locked out indefinitely.
 * - A successful sign-in clears the counter.
 * - Per client address: more than 20 failures within 15 minutes are refused for the rest of
 *   that window (HTTP 429), generous enough for a shared school network.
 */
export const ACCOUNT_MAX_FAILURES = 5;
export const ACCOUNT_LOCK_MINUTES = 15;
export const IP_MAX_FAILURES = 20;
export const IP_WINDOW_MINUTES = 15;

export type IdentifierKind = 'username' | 'email';

export interface ThrottleKeys {
  kind: IdentifierKind;
  /** The value the person typed, before any lookup. */
  identifier: string;
  /** Client address as seen by the server; omitted when unknown. */
  ip?: string;
}

export type ThrottleState = { blocked: false } | { blocked: true; reason: 'account' | 'ip'; retryAfterSeconds: number };

const minutes = (n: number) => n * 60_000;

/** Usernames and emails are compared case-insensitively and without surrounding spaces. */
export function normaliseIdentifier(value: string): string {
  return value.normalize('NFC').trim().toLowerCase();
}

function accountKey(keys: ThrottleKeys): Buffer {
  return keyedHash(`throttle:${keys.kind}`, normaliseIdentifier(keys.identifier));
}
function ipKey(ip: string): Buffer {
  return keyedHash('throttle:ip', ip);
}

/** Checks both locks before any password is verified. */
export async function checkThrottle(sql: Sql, keys: ThrottleKeys, now: Date = new Date()): Promise<ThrottleState> {
  const rows = await sql<Array<{ kind: string; locked_until: Date | null }>>`
    SELECT kind, locked_until FROM sign_in_throttle
    WHERE (kind = ${keys.kind} AND key_hash = ${accountKey(keys)})
       ${keys.ip ? sql`OR (kind = 'ip' AND key_hash = ${ipKey(keys.ip)})` : sql``}`;
  const ip = rows.find((r) => r.kind === 'ip' && r.locked_until && r.locked_until > now);
  if (ip?.locked_until) {
    return {
      blocked: true,
      reason: 'ip',
      retryAfterSeconds: Math.ceil((ip.locked_until.getTime() - now.getTime()) / 1000),
    };
  }
  const account = rows.find((r) => r.kind !== 'ip' && r.locked_until && r.locked_until > now);
  if (account?.locked_until) {
    return {
      blocked: true,
      reason: 'account',
      retryAfterSeconds: Math.ceil((account.locked_until.getTime() - now.getTime()) / 1000),
    };
  }
  return { blocked: false };
}

/** Counts one failed attempt. Returns true when this failure started a lock. */
export async function recordFailure(sql: Sql, keys: ThrottleKeys, now: Date = new Date()): Promise<boolean> {
  return sql.begin(async (tx) => {
    let lockedNow = false;
    const key = accountKey(keys);
    await tx`INSERT INTO sign_in_throttle (kind, key_hash, failures, window_started_at)
             VALUES (${keys.kind}, ${key}, 0, ${now}) ON CONFLICT DO NOTHING`;
    const [row] = await tx<Array<{ failures: number; locked_until: Date | null }>>`
      SELECT failures, locked_until FROM sign_in_throttle
      WHERE kind = ${keys.kind} AND key_hash = ${key} FOR UPDATE`;
    if (row && !(row.locked_until && row.locked_until > now)) {
      // An expired lock starts a fresh count; attempts during a lock are not counted.
      const failures = (row.locked_until ? 0 : row.failures) + 1;
      const lockedUntil =
        failures >= ACCOUNT_MAX_FAILURES ? new Date(now.getTime() + minutes(ACCOUNT_LOCK_MINUTES)) : null;
      lockedNow = lockedUntil !== null;
      await tx`UPDATE sign_in_throttle
               SET failures = ${lockedUntil ? 0 : failures}, locked_until = ${lockedUntil}
               WHERE kind = ${keys.kind} AND key_hash = ${key}`;
    }

    if (keys.ip) {
      const ik = ipKey(keys.ip);
      await tx`INSERT INTO sign_in_throttle (kind, key_hash, failures, window_started_at)
               VALUES ('ip', ${ik}, 0, ${now}) ON CONFLICT DO NOTHING`;
      const [ipRow] = await tx<Array<{ failures: number; window_started_at: Date }>>`
        SELECT failures, window_started_at FROM sign_in_throttle
        WHERE kind = 'ip' AND key_hash = ${ik} FOR UPDATE`;
      if (ipRow) {
        const windowOver = now.getTime() - ipRow.window_started_at.getTime() >= minutes(IP_WINDOW_MINUTES);
        const windowStart = windowOver ? now : ipRow.window_started_at;
        const failures = (windowOver ? 0 : ipRow.failures) + 1;
        const lockedUntil =
          failures > IP_MAX_FAILURES ? new Date(windowStart.getTime() + minutes(IP_WINDOW_MINUTES)) : null;
        await tx`UPDATE sign_in_throttle
                 SET failures = ${failures}, window_started_at = ${windowStart}, locked_until = ${lockedUntil}
                 WHERE kind = 'ip' AND key_hash = ${ik}`;
      }
    }
    return lockedNow;
  });
}

/** Clears the per-account counter after a successful sign-in (the address counter is kept). */
export async function recordSuccess(sql: Sql, keys: ThrottleKeys): Promise<void> {
  await sql`DELETE FROM sign_in_throttle WHERE kind = ${keys.kind} AND key_hash = ${accountKey(keys)}`;
}

/** When the identifier is locked, the time the lock ends; otherwise null (M-08 sign-in status). */
export async function lockedUntil(
  sql: Db,
  kind: IdentifierKind,
  identifier: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const [row] = await sql<Array<{ locked_until: Date | null }>>`
    SELECT locked_until FROM sign_in_throttle WHERE kind = ${kind} AND key_hash = ${accountKey({ kind, identifier })}`;
  return row?.locked_until && row.locked_until > now ? row.locked_until : null;
}

/** Early unlock by the parent (G1-08 §3.3): clears the child's username lock and counter. */
export async function clearAccountLock(sql: Db, kind: IdentifierKind, identifier: string): Promise<void> {
  await sql`DELETE FROM sign_in_throttle WHERE kind = ${kind} AND key_hash = ${accountKey({ kind, identifier })}`;
}
