import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeAudit } from '@/server/auth/audit';
import {
  createSession,
  loadSession,
  recentlyReauthenticated,
  revokeAllSessions,
  revokeSession,
} from '@/server/auth/sessions';
import { checkThrottle, clearAccountLock, recordFailure, recordSuccess } from '@/server/auth/throttle';
import { hashToken } from '@/server/auth/tokens';
import { createAdult, createChild, testDb, uniq } from './helpers';

/** WP2-2 security core against a real database (OC-21, OC-35, G1-08 §3.2–3.5). */
const sql = testDb();
const T0 = new Date('2026-10-15T04:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

async function account(id: string) {
  const [row] = await sql<Array<{ id: string; role: string; credential_version: number }>>`
    SELECT id, role, credential_version FROM accounts WHERE id = ${id}`;
  return row!;
}

describe('sessions', () => {
  it('stores only a hash of the token and loads the session from the cookie value', async () => {
    const parent = await account(await createAdult(sql, 'parent'));
    const { token } = await createSession(sql, parent, T0);
    const raw = await sql`SELECT 1 FROM sessions WHERE id_hash = ${Buffer.from(token)}`;
    expect(raw.length).toBe(0);
    const stored = await sql`SELECT 1 FROM sessions WHERE id_hash = ${hashToken(token)}`;
    expect(stored.length).toBe(1);
    const session = await loadSession(sql, token, at(1));
    expect(session?.accountId).toBe(parent.id);
    expect(session?.role).toBe('parent');
  });

  it('a child session ends after 60 idle minutes and 12 hours at most (OC-35)', async () => {
    const parentId = await createAdult(sql, 'parent');
    const child = await account(await createChild(sql, parentId));
    const { token } = await createSession(sql, child, T0);
    expect(await loadSession(sql, token, at(59))).not.toBeNull(); // activity extends idle expiry
    expect(await loadSession(sql, token, at(59 + 61))).toBeNull(); // 61 idle minutes later

    const { token: busy } = await createSession(sql, child, T0);
    for (let m = 50; m < 12 * 60; m += 50) expect(await loadSession(sql, busy, at(m))).not.toBeNull();
    expect(await loadSession(sql, busy, at(12 * 60 + 1))).toBeNull(); // absolute limit
  });

  it('signing out ends that session only', async () => {
    const parent = await account(await createAdult(sql, 'parent'));
    const a = await createSession(sql, parent, T0);
    const b = await createSession(sql, parent, T0);
    await revokeSession(sql, a.token, at(1));
    expect(await loadSession(sql, a.token, at(2))).toBeNull();
    expect(await loadSession(sql, b.token, at(2))).not.toBeNull();
  });

  it('a password reset ends every session of the account (G1-08 §3.4 step 6)', async () => {
    const parentId = await createAdult(sql, 'parent');
    const child = await account(await createChild(sql, parentId));
    const s1 = await createSession(sql, child, T0);
    const s2 = await createSession(sql, child, T0);
    await sql`UPDATE accounts SET credential_version = credential_version + 1 WHERE id = ${child.id}`;
    expect(await loadSession(sql, s1.token, at(1))).toBeNull();
    expect(await loadSession(sql, s2.token, at(1))).toBeNull();
    expect(await revokeAllSessions(sql, child.id, at(1))).toBe(2);
  });

  it('a deactivated account loses its sessions at once', async () => {
    const teacher = await account(await createAdult(sql, 'teacher'));
    const { token } = await createSession(sql, teacher, T0);
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${teacher.id}`;
    expect(await loadSession(sql, token, at(1))).toBeNull();
  });

  it('unknown, empty or oversized tokens return nothing', async () => {
    expect(await loadSession(sql, undefined, T0)).toBeNull();
    expect(await loadSession(sql, 'not-a-real-token', T0)).toBeNull();
    expect(await loadSession(sql, 'x'.repeat(500), T0)).toBeNull();
  });

  it('step-up: re-authentication counts for 5 minutes', async () => {
    const parent = await account(await createAdult(sql, 'parent'));
    const { token } = await createSession(sql, parent, T0);
    const session = (await loadSession(sql, token, at(1)))!;
    expect(recentlyReauthenticated(session, at(5))).toBe(true);
    expect(recentlyReauthenticated(session, at(6))).toBe(false);
  });
});

describe('sign-in lockout (OC-35)', () => {
  const keys = () => ({
    kind: 'username' as const,
    identifier: `kid${uniq()}-1234`,
    ip: `10.0.${Math.floor(Math.random() * 250)}.1`,
  });

  it('locks a username on the 5th failure for 15 minutes', async () => {
    const k = keys();
    for (let i = 1; i <= 4; i += 1) {
      expect(await recordFailure(sql, k, at(i))).toBe(false);
      expect((await checkThrottle(sql, k, at(i))).blocked).toBe(false);
    }
    expect(await recordFailure(sql, k, at(5))).toBe(true);
    expect(await checkThrottle(sql, k, at(6))).toEqual({
      blocked: true,
      reason: 'account',
      retryAfterSeconds: 14 * 60,
    });
    expect((await checkThrottle(sql, k, at(5 + 15))).blocked).toBe(false);
  });

  it('locks unknown usernames exactly like real ones, case-insensitively', async () => {
    const name = `NoSuchChild${uniq()}-0000`;
    for (let i = 0; i < 5; i += 1) await recordFailure(sql, { kind: 'username', identifier: name }, at(i));
    const state = await checkThrottle(sql, { kind: 'username', identifier: ` ${name.toLowerCase()} ` }, at(5));
    expect(state.blocked).toBe(true);
  });

  it('attempts during a lock do not extend it', async () => {
    const k = keys();
    for (let i = 0; i < 5; i += 1) await recordFailure(sql, k, at(i));
    for (let i = 5; i < 14; i += 1) await recordFailure(sql, k, at(i));
    expect((await checkThrottle(sql, k, at(4 + 15))).blocked).toBe(false);
  });

  it('a successful sign-in clears the count', async () => {
    const k = keys();
    for (let i = 0; i < 4; i += 1) await recordFailure(sql, k, at(i));
    await recordSuccess(sql, k);
    await recordFailure(sql, k, at(5));
    expect((await checkThrottle(sql, k, at(6))).blocked).toBe(false);
  });

  it('the parent can unlock early (G1-08 §3.3)', async () => {
    const k = keys();
    for (let i = 0; i < 5; i += 1) await recordFailure(sql, k, at(i));
    await clearAccountLock(sql, 'username', k.identifier);
    expect((await checkThrottle(sql, k, at(6))).blocked).toBe(false);
  });

  it('more than 20 failures from one address in 15 minutes are refused (429)', async () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < 21; i += 1) {
      await recordFailure(sql, { kind: 'username', identifier: `spray${i}${uniq()}-1111`, ip }, at(0));
    }
    const state = await checkThrottle(sql, { kind: 'username', identifier: `someone${uniq()}-2222`, ip }, at(1));
    expect(state).toMatchObject({ blocked: true, reason: 'ip' });
    expect((await checkThrottle(sql, { kind: 'username', identifier: 'x-1234', ip }, at(16))).blocked).toBe(false);
  });

  it('no username or address is stored in readable form', async () => {
    const name = `visible${uniq()}-5555`;
    await recordFailure(sql, { kind: 'username', identifier: name, ip: '203.0.113.9' }, at(0));
    const rows = await sql`SELECT encode(key_hash, 'escape') AS k FROM sign_in_throttle`;
    expect(rows.some((r) => String(r.k).includes(name) || String(r.k).includes('203.0.113.9'))).toBe(false);
  });
});

describe('audit log', () => {
  it('records events with actor and subject', async () => {
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    await writeAudit(sql, {
      type: 'CHILD_PASSWORD_RESET',
      outcome: 'success',
      actorId: parent,
      subjectId: child,
      details: { method: 'parent' },
    });
    const [row] = await sql`SELECT event_type, details FROM audit_events WHERE subject_id = ${child}`;
    expect(row).toMatchObject({ event_type: 'CHILD_PASSWORD_RESET', details: { method: 'parent' } });
  });

  it('refuses details that look like secrets', async () => {
    await expect(writeAudit(sql, { type: 'SIGN_IN', outcome: 'failure', details: { password: 'x' } })).rejects.toThrow(
      /not allowed/,
    );
    await expect(
      writeAudit(sql, { type: 'SIGN_IN', outcome: 'failure', details: { resetToken: 'x' } }),
    ).rejects.toThrow(/not allowed/);
    await expect(writeAudit(sql, { type: 'bad type', outcome: 'success' })).rejects.toThrow(/Bad audit event type/);
  });
});
