import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generatePassphrase } from '@/server/auth/passphrase';
import { createSession, loadSession, recordReauthFailure, recordReauthSuccess } from '@/server/auth/sessions';
import {
  checkProfile,
  createChild,
  getChild,
  hasChildConsents,
  listChildren,
  recordChildConsents,
  resetChildPassword,
  setChildPaused,
  signInChild,
  signOutChildEverywhere,
  unlockChild,
  updateChildProfile,
  usernameBase,
  type CreateChildInput,
} from '@/server/children';
import { createAdult, testDb, uniq } from './helpers';

/** WP2-4 child accounts (M-02, M-06, M-07, M-08; OC-23, OC-35 = D-23a, G1-08 §3.7). */
const sql = testDb();
const T0 = new Date('2026-10-15T05:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
// Sample phrases for tests only (not real secrets).
const PHRASE = {
  child: ['kite', 'river', 'mango'].join('-'),
  wrong: ['not', 'the', 'right', 'one'].join('-'),
  newer: ['blue', 'whale', 'sings'].join('-'),
  short: 'kite',
};
const ip = () => `203.0.113.${Math.floor(Math.random() * 250)}`;

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

const input = (over: Partial<CreateChildInput> = {}): CreateChildInput => ({
  name: 'Kiran',
  grade: 5,
  curriculum: 'CBSE',
  timeZone: 'Asia/Kolkata',
  subjects: ['maths', 'english'],
  avatar: 'star',
  username: `kid${uniq()}`,
  password: PHRASE.child,
  ...over,
});

async function parentWithConsent() {
  const parentId = await createAdult(sql, 'parent');
  await recordChildConsents(sql, parentId, { guardian: true, aiTutor: true, emailReminders: false }, T0);
  return parentId;
}

async function parentAndChild(over: Partial<CreateChildInput> = {}) {
  const parentId = await parentWithConsent();
  const r = await createChild(sql, parentId, input(over), T0);
  if (!r.ok) throw new Error(`createChild failed: ${r.reason}`);
  return { parentId, ...r };
}

const fresh = (parentId: string, now = T0) => ({ parentId, reauthenticatedAt: now });

async function auditTypes(subjectId: string) {
  const rows = await sql<Array<{ event_type: string; details: Record<string, unknown> }>>`
    SELECT event_type, details FROM audit_events WHERE subject_id = ${subjectId} ORDER BY id`;
  return rows;
}

describe('guardian consent (M-06)', () => {
  it('needs both required boxes and records the optional one', async () => {
    const parentId = await createAdult(sql, 'parent');
    expect(await recordChildConsents(sql, parentId, { guardian: true, aiTutor: false, emailReminders: true })).toEqual({
      ok: false,
      reason: 'required',
    });
    expect(await hasChildConsents(sql, parentId)).toBe(false);
    expect((await recordChildConsents(sql, parentId, { guardian: true, aiTutor: true, emailReminders: true })).ok).toBe(
      true,
    );
    expect(await hasChildConsents(sql, parentId)).toBe(true);
    const kinds = await sql`SELECT kind FROM consents WHERE account_id = ${parentId} ORDER BY kind`;
    expect(kinds.map((k) => k.kind)).toEqual(['ai_tutor', 'email_reminders', 'guardian']);
  });

  it('no child can be created before consent', async () => {
    const parentId = await createAdult(sql, 'parent');
    expect(await createChild(sql, parentId, input())).toEqual({ ok: false, reason: 'consent_required' });
  });

  it('teachers cannot give guardian consent or create children', async () => {
    const teacherId = await createAdult(sql, 'teacher');
    expect(
      (await recordChildConsents(sql, teacherId, { guardian: true, aiTutor: true, emailReminders: false })).ok,
    ).toBe(false);
    expect(await createChild(sql, teacherId, input())).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('creating a child (M-08)', () => {
  it('makes a username with a four-digit suffix, links the child and returns the password once', async () => {
    const parentId = await parentWithConsent();
    const r = await createChild(sql, parentId, input({ username: 'Kíran Test' }), T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.username).toMatch(/^kiran-test-\d{4}$/);
    expect(r.password).toBe(PHRASE.child);
    const [row] = await sql`SELECT email, password_hash FROM accounts WHERE id = ${r.childId}`;
    expect(row!.email).toBeNull();
    expect(row!.password_hash).not.toContain(PHRASE.child);
    const kids = await listChildren(sql, parentId);
    expect(kids.map((k) => k.id)).toEqual([r.childId]);
    expect(kids[0]).toMatchObject({ name: 'Kiran', grade: 5, subjects: ['maths', 'english'], status: 'active' });
    expect((await auditTypes(r.childId)).map((e) => e.event_type)).toEqual(['CHILD_CREDENTIALS_CREATED']);
  });

  it('generates a readable password when the parent leaves it blank', async () => {
    const { password } = await parentAndChild({ password: null });
    expect(password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
  });

  it('keeps trying suffixes so a taken username is never revealed', async () => {
    const parentId = await parentWithConsent();
    const name = `twin${uniq()}`;
    const first = await createChild(sql, parentId, input({ username: name }));
    const second = await createChild(sql, parentId, input({ username: name }));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.username).not.toBe(second.username);
  });

  it('applies the child password policy (at least 8 characters, not a common one)', async () => {
    const parentId = await parentWithConsent();
    expect(await createChild(sql, parentId, input({ password: PHRASE.short }))).toEqual({
      ok: false,
      reason: 'password',
      problem: 'too_short',
    });
    expect(await createChild(sql, parentId, input({ password: ['pass', 'word'].join('') }))).toMatchObject({
      reason: 'password',
    });
  });

  it('validates the profile and the username', () => {
    expect(checkProfile({ ...input(), subjects: [] })).toBe('subjects');
    expect(checkProfile({ ...input(), subjects: ['art'] })).toBe('subjects');
    expect(checkProfile({ ...input(), grade: 13 })).toBe('grade');
    expect(checkProfile({ ...input(), timeZone: 'Mars/Base' })).toBe('time_zone');
    expect(checkProfile({ ...input(), curriculum: 'Made up' })).toBe('curriculum');
    expect(checkProfile({ ...input(), avatar: 'photo' })).toBe('avatar');
    expect(checkProfile({ ...input(), name: ' ' })).toBe('name');
    expect(usernameBase('  Meera  R. ')).toBe('meera-r');
    expect(usernameBase('!!')).toBeNull();
    expect(usernameBase('a')).toBeNull();
  });

  it('a passphrase passes the child policy', () => {
    for (let i = 0; i < 20; i++) expect(generatePassphrase()).toMatch(/^([a-z]+-){3}\d{2}$/);
  });
});

describe('isolation', () => {
  it("a parent cannot see or change another family's child", async () => {
    const { childId } = await parentAndChild();
    const other = await parentWithConsent();
    expect(await getChild(sql, other, childId)).toBeNull();
    expect(await listChildren(sql, other)).toEqual([]);
    expect(await updateChildProfile(sql, other, childId, input())).toEqual({ ok: false, reason: 'not_found' });
    expect(await resetChildPassword(sql, fresh(other), childId, null, T0)).toEqual({ ok: false, reason: 'not_found' });
    expect(await unlockChild(sql, fresh(other), childId, T0)).toEqual({ ok: false, reason: 'not_found' });
    expect(await signOutChildEverywhere(sql, fresh(other), childId, T0)).toEqual({ ok: false, reason: 'not_found' });
    expect(await setChildPaused(sql, fresh(other), childId, true, T0)).toEqual({ ok: false, reason: 'not_found' });
    const denied =
      await sql`SELECT count(*)::int AS n FROM audit_events WHERE actor_id = ${other} AND event_type = 'CHILD_ACTION_REFUSED'`;
    expect(denied[0]!.n).toBe(4);
  });

  it('teachers and Super Admins cannot reset or unlock a child', async () => {
    const { childId } = await parentAndChild();
    for (const role of ['teacher', 'superadmin'] as const) {
      const id = await createAdult(sql, role);
      expect(await resetChildPassword(sql, fresh(id), childId, null, T0)).toEqual({ ok: false, reason: 'not_found' });
      expect(await unlockChild(sql, fresh(id), childId, T0)).toEqual({ ok: false, reason: 'not_found' });
    }
  });

  it('a bad id is treated as not found', async () => {
    const parentId = await parentWithConsent();
    expect(await getChild(sql, parentId, 'not-a-uuid')).toBeNull();
    expect(await getChild(sql, 'nope', '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('child sign-in (M-02, G1-08 §3.2)', () => {
  it('signs in with the right username and password, case-insensitively', async () => {
    const { username, childId } = await parentAndChild();
    const r = await signInChild(sql, { username: ` ${username.toUpperCase()} `, password: PHRASE.child, ip: ip() }, T0);
    expect(r).toMatchObject({ ok: true, account: { id: childId, role: 'student' } });
    expect((await auditTypes(childId)).map((e) => e.event_type)).toContain('CHILD_LOGIN_SUCCEEDED');
  });

  it('an unknown username answers exactly like a wrong password', async () => {
    const { username } = await parentAndChild();
    const wrong = await signInChild(sql, { username, password: PHRASE.wrong, ip: ip() }, T0);
    const unknown = await signInChild(sql, { username: `nobody${uniq()}-1234`, password: PHRASE.wrong, ip: ip() }, T0);
    expect(wrong).toEqual({ ok: false, reason: 'invalid' });
    expect(unknown).toEqual(wrong);
  });

  it('locks on the 5th failure for 15 minutes, for real and unknown usernames alike', async () => {
    const { username, childId, parentId } = await parentAndChild();
    const ghost = `ghost${uniq()}-1234`;
    for (const name of [username, ghost]) {
      for (let i = 1; i <= 4; i++) {
        expect(await signInChild(sql, { username: name, password: PHRASE.wrong, ip: ip() }, at(i))).toEqual({
          ok: false,
          reason: 'invalid',
        });
      }
      expect(await signInChild(sql, { username: name, password: PHRASE.wrong, ip: ip() }, at(5))).toMatchObject({
        ok: false,
        reason: 'locked',
      });
      // Even the right password is refused while locked.
      expect(await signInChild(sql, { username: name, password: PHRASE.child, ip: ip() }, at(6))).toMatchObject({
        reason: 'locked',
      });
    }
    // The lock started at minute 5, so it ends at minute 20 however many tries come in between.
    for (let m = 7; m < 20; m++) await signInChild(sql, { username, password: PHRASE.wrong, ip: ip() }, at(m));
    expect((await signInChild(sql, { username, password: PHRASE.child, ip: ip() }, at(20))).ok).toBe(true);

    const events = (await auditTypes(childId)).map((e) => e.event_type);
    expect(events.filter((e) => e === 'CHILD_LOCKED')).toHaveLength(1);
    expect(events.filter((e) => e === 'CHILD_LOGIN_FAILED')).toHaveLength(5);
    const [parent] = await sql`SELECT email FROM accounts WHERE id = ${parentId}`;
    const mails =
      await sql`SELECT template FROM email_outbox WHERE to_address = ${parent!.email} AND template = 'child_locked'`;
    expect(mails).toHaveLength(1);
    // No email or audit event for the unknown username.
    const ghostEvents = await sql`SELECT 1 FROM audit_events WHERE details::text LIKE ${`%${ghost}%`}`;
    expect(ghostEvents).toHaveLength(0);
  });

  it('a paused child cannot sign in', async () => {
    const { username, childId, parentId } = await parentAndChild();
    expect((await setChildPaused(sql, fresh(parentId), childId, true, T0)).ok).toBe(true);
    expect(await signInChild(sql, { username, password: PHRASE.child, ip: ip() }, T0)).toEqual({
      ok: false,
      reason: 'paused',
    });
    expect((await setChildPaused(sql, fresh(parentId), childId, false, T0)).ok).toBe(true);
    expect((await signInChild(sql, { username, password: PHRASE.child, ip: ip() }, T0)).ok).toBe(true);
  });

  it('adults cannot use the child form', async () => {
    const r = await signInChild(sql, { username: 'parent@example.com', password: PHRASE.child, ip: ip() }, T0);
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('parent recovery actions (M-08, G1-08 §3.3–3.4)', () => {
  it('need a password confirmation within the last 5 minutes', async () => {
    const { parentId, childId } = await parentAndChild();
    const stale = { parentId, reauthenticatedAt: at(-6) };
    expect(await resetChildPassword(sql, stale, childId, null, T0)).toEqual({ ok: false, reason: 'reauth_required' });
    expect(await unlockChild(sql, stale, childId, T0)).toEqual({ ok: false, reason: 'reauth_required' });
    expect(await signOutChildEverywhere(sql, stale, childId, T0)).toEqual({ ok: false, reason: 'reauth_required' });
    expect(await setChildPaused(sql, stale, childId, true, T0)).toEqual({ ok: false, reason: 'reauth_required' });
  });

  it('a reset revokes every session, clears the lock, bumps the credential version and emails the parent', async () => {
    const { parentId, childId, username } = await parentAndChild();
    const s1 = await createSession(sql, { id: childId, role: 'student', credential_version: 1 }, T0);
    const s2 = await createSession(sql, { id: childId, role: 'student', credential_version: 1 }, T0);
    for (let i = 1; i <= 5; i++) await signInChild(sql, { username, password: PHRASE.wrong, ip: ip() }, at(i));
    expect((await getChild(sql, parentId, childId, at(6)))?.lockedUntil).not.toBeNull();

    const r = await resetChildPassword(sql, fresh(parentId, at(6)), childId, PHRASE.newer, at(6));
    expect(r).toEqual({ ok: true, password: PHRASE.newer, username });
    expect(await loadSession(sql, s1.token, at(7))).toBeNull();
    expect(await loadSession(sql, s2.token, at(7))).toBeNull();
    expect((await getChild(sql, parentId, childId, at(7)))?.lockedUntil).toBeNull();
    expect((await signInChild(sql, { username, password: PHRASE.child, ip: ip() }, at(7))).ok).toBe(false);
    expect((await signInChild(sql, { username, password: PHRASE.newer, ip: ip() }, at(8))).ok).toBe(true);

    const events = await auditTypes(childId);
    expect(events.map((e) => e.event_type)).toEqual(
      expect.arrayContaining(['CHILD_PASSWORD_RESET', 'CHILD_SESSIONS_REVOKED']),
    );
    const [parent] = await sql`SELECT email FROM accounts WHERE id = ${parentId}`;
    const [mail] = await sql<Array<{ payload: Record<string, string> }>>`
      SELECT payload FROM email_outbox WHERE to_address = ${parent!.email} AND template = 'child_password_reset'`;
    expect(mail!.payload.childName).toBe('Kiran');
    expect(JSON.stringify(mail!.payload)).not.toContain(PHRASE.newer);
  });

  it('unlock clears the lock without changing the password', async () => {
    const { parentId, childId, username } = await parentAndChild();
    for (let i = 1; i <= 5; i++) await signInChild(sql, { username, password: PHRASE.wrong, ip: ip() }, at(i));
    expect((await unlockChild(sql, fresh(parentId, at(6)), childId, at(6))).ok).toBe(true);
    expect((await signInChild(sql, { username, password: PHRASE.child, ip: ip() }, at(6))).ok).toBe(true);
  });

  it('sign out everywhere ends all sessions', async () => {
    const { parentId, childId } = await parentAndChild();
    const s = await createSession(sql, { id: childId, role: 'student', credential_version: 1 }, T0);
    expect(await signOutChildEverywhere(sql, fresh(parentId), childId, T0)).toEqual({ ok: true, count: 1 });
    expect(await loadSession(sql, s.token, at(1))).toBeNull();
  });

  it('five wrong step-up passwords sign the parent out', async () => {
    const parentId = await createAdult(sql, 'parent');
    const { token } = await createSession(sql, { id: parentId, role: 'parent', credential_version: 1 }, T0);
    for (let i = 1; i <= 4; i++) expect(await recordReauthFailure(sql, token, at(i))).toBe(false);
    await recordReauthSuccess(sql, token, at(5));
    for (let i = 1; i <= 4; i++) expect(await recordReauthFailure(sql, token, at(5 + i))).toBe(false);
    expect(await recordReauthFailure(sql, token, at(10))).toBe(true);
    expect(await loadSession(sql, token, at(10))).toBeNull();
  });

  it('profile edits are saved for a linked child only', async () => {
    const { parentId, childId } = await parentAndChild();
    expect(
      await updateChildProfile(sql, parentId, childId, {
        ...input(),
        name: 'Kiran B',
        grade: 6,
        subjects: ['science'],
      }),
    ).toEqual({ ok: true });
    expect(await getChild(sql, parentId, childId)).toMatchObject({ name: 'Kiran B', grade: 6, subjects: ['science'] });
  });
});

describe('audit records (G1-08 §3.5)', () => {
  it('never hold passwords, usernames or child names', async () => {
    const { parentId, childId, username } = await parentAndChild({ name: `Zed${uniq()}` });
    await signInChild(sql, { username, password: PHRASE.wrong, ip: ip() }, T0);
    await resetChildPassword(sql, fresh(parentId), childId, PHRASE.newer, T0);
    const rows = await sql<Array<{ details: unknown }>>`
      SELECT details FROM audit_events WHERE subject_id = ${childId} OR actor_id = ${parentId}`;
    const [named] = await sql<Array<{ display_name: string }>>`SELECT display_name FROM accounts WHERE id = ${childId}`;
    const text = JSON.stringify(rows);
    for (const secret of [PHRASE.child, PHRASE.newer, PHRASE.wrong, username, named!.display_name]) {
      expect(text).not.toContain(secret);
    }
  });
});
