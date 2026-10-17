import 'server-only';
import { CURRICULA_LIST } from '@/lib/curricula';
import { randomInt } from 'node:crypto';
import { SUBJECT_IDS, type SubjectId } from '@/fixtures/subjects';
import { writeAudit } from './auth/audit';
import { queueEmail, windowBucket } from './auth/outbox';
import { generatePassphrase } from './auth/passphrase';
import { checkNewPassword, type CredentialProblem, hashPassword, verifyPassword } from './auth/password';
import { revokeAllSessions } from './auth/sessions';
import {
  checkThrottle,
  clearAccountLock,
  lockedUntil,
  normaliseIdentifier,
  recordFailure,
  recordSuccess,
} from './auth/throttle';
import type { Db, Sql } from './db/client';

/**
 * Child accounts (WP2-4; M-02, M-06, M-07, M-08; OC-23, OC-35 = D-23a, G1-08 §3).
 *
 * - Only a parent with an active guardian link can see or change a child. Every function that
 *   takes a child id checks that link on the server and answers "not found" otherwise, exactly
 *   as for a child that does not exist (§3.4 step 4).
 * - Resetting, unlocking, signing out and pausing need a recent password confirmation by the
 *   parent (step-up, §3.4 step 3).
 * - A child's password is shown to the parent once, at creation or reset, and is never stored
 *   or logged in readable form. Children have no email or phone.
 * - Teachers and admins have no guardian links, so none of these functions work for them (§3.3).
 */
export const CHILD_NOTICE_VERSION = '2026-10-draft';
/** A parent's password confirmation lasts this long for child security actions (§3.4 step 3). */
export const STEP_UP_MINUTES = 5;
export const AVATARS = ['star', 'sun', 'leaf', 'moon'] as const;
export type Avatar = (typeof AVATARS)[number];

/** Curricula offered in the profile form, shown as "configured by AA Pro" (M-08). Owner-confirmed (OC-58). */
export const CURRICULA = CURRICULA_LIST;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChildRecord {
  id: string;
  name: string;
  username: string;
  grade: number;
  curriculum: string | null;
  timeZone: string;
  subjects: SubjectId[];
  avatar: Avatar;
  status: 'active' | 'suspended';
}

export interface ChildDetail extends ChildRecord {
  /** When the sign-in is locked after 5 wrong tries, the time the lock ends. */
  lockedUntil: Date | null;
}

export type NotFound = { ok: false; reason: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, reason: 'not_found' };

// ------------------------------------------------------------------ consent (M-06)

/** True when the parent has given both required consents for the current notice. */
export async function hasChildConsents(sql: Db, parentId: string): Promise<boolean> {
  const rows = await sql<Array<{ kind: string }>>`
    SELECT kind FROM consents
    WHERE account_id = ${parentId} AND version = ${CHILD_NOTICE_VERSION} AND kind IN ('guardian', 'ai_tutor')`;
  return rows.length === 2;
}

export async function recordChildConsents(
  sql: Sql,
  parentId: string,
  input: { guardian: boolean; aiTutor: boolean; emailReminders: boolean },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'required' } | NotFound> {
  if (!input.guardian || !input.aiTutor) return { ok: false, reason: 'required' };
  if (!(await activeParent(sql, parentId))) return NOT_FOUND;
  const kinds = ['guardian', 'ai_tutor', ...(input.emailReminders ? ['email_reminders'] : [])];
  await sql.begin(async (tx) => {
    for (const kind of kinds) {
      await tx`INSERT INTO consents (account_id, kind, version, accepted_at)
               VALUES (${parentId}, ${kind}, ${CHILD_NOTICE_VERSION}, ${now})
               ON CONFLICT (account_id, kind, version) DO NOTHING`;
    }
    await writeAudit(
      tx,
      {
        type: 'CHILD_CONSENT_GIVEN',
        outcome: 'success',
        actorId: parentId,
        subjectId: parentId,
        details: { version: CHILD_NOTICE_VERSION, emailReminders: input.emailReminders },
      },
      now,
    );
  });
  return { ok: true };
}

async function activeParent(sql: Db, parentId: string): Promise<boolean> {
  if (!UUID.test(parentId)) return false;
  const [row] = await sql`SELECT 1 FROM accounts WHERE id = ${parentId} AND role = 'parent' AND status = 'active'`;
  return Boolean(row);
}

// ------------------------------------------------------------------ reading

const SELECT_CHILD = (sql: Db, parentId: string) => sql`
  SELECT a.id, a.display_name AS name, a.username, a.time_zone, a.status,
         p.grade, p.curriculum, p.subjects, p.avatar
  FROM guardian_links g
  JOIN accounts a ON a.id = g.student_id
  JOIN student_profiles p ON p.account_id = a.id
  JOIN accounts parent ON parent.id = g.parent_id
  WHERE g.parent_id = ${parentId} AND g.status = 'active'
    AND parent.role = 'parent' AND parent.status = 'active'
    AND a.status IN ('active', 'suspended')`;

interface ChildRow {
  id: string;
  name: string;
  username: string;
  time_zone: string;
  status: 'active' | 'suspended';
  grade: number;
  curriculum: string | null;
  subjects: SubjectId[];
  avatar: Avatar;
}

const toRecord = (r: ChildRow): ChildRecord => ({
  id: r.id,
  name: r.name,
  username: r.username,
  grade: r.grade,
  curriculum: r.curriculum,
  timeZone: r.time_zone,
  subjects: r.subjects,
  avatar: r.avatar,
  status: r.status,
});

/** The parent's own linked children, oldest first (M-07). */
export async function listChildren(sql: Db, parentId: string): Promise<ChildRecord[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await sql<ChildRow[]>`${SELECT_CHILD(sql, parentId)} ORDER BY g.created_at, a.id`;
  return rows.map(toRecord);
}

/** One linked child, or null when the child is not this parent's (same as not existing). */
export async function getChild(
  sql: Db,
  parentId: string,
  childId: string,
  now = new Date(),
): Promise<ChildDetail | null> {
  if (!UUID.test(parentId) || !UUID.test(childId)) return null;
  const [row] = await sql<ChildRow[]>`${SELECT_CHILD(sql, parentId)} AND a.id = ${childId}`;
  if (!row) return null;
  return { ...toRecord(row), lockedUntil: await lockedUntil(sql, 'username', row.username, now) };
}

// ------------------------------------------------------------------ validation

export interface ChildProfileInput {
  name: string;
  grade: number;
  curriculum: string | null;
  timeZone: string;
  subjects: string[];
  avatar: string;
}

export type ProfileProblem = 'name' | 'grade' | 'curriculum' | 'time_zone' | 'subjects' | 'avatar';

function cleanName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function checkProfile(input: ChildProfileInput): ProfileProblem | null {
  const name = cleanName(input.name);
  if (name.length < 1 || [...name].length > 40) return 'name';
  if (!Number.isInteger(input.grade) || input.grade < 1 || input.grade > 12) return 'grade';
  if (input.curriculum !== null && !(CURRICULA as readonly string[]).includes(input.curriculum)) return 'curriculum';
  if (!isValidTimeZone(input.timeZone)) return 'time_zone';
  const subjects = new Set(input.subjects);
  if (subjects.size === 0 || [...subjects].some((s) => !(SUBJECT_IDS as readonly string[]).includes(s))) {
    return 'subjects';
  }
  if (!(AVATARS as readonly string[]).includes(input.avatar)) return 'avatar';
  return null;
}

/**
 * Turns the name a parent typed into the first part of a username: lower-case letters, digits
 * and hyphens, 2–30 characters (G1-08 §3.1). Returns null when nothing usable is left.
 */
export function usernameBase(input: string): string | null {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  return /^[a-z0-9][a-z0-9-]{1,29}$/.test(base) ? base : null;
}

// ------------------------------------------------------------------ create (M-08)

export interface CreateChildInput extends ChildProfileInput {
  username: string;
  /** The password the parent typed, or null to generate a readable one. */
  password: string | null;
}

export type CreateChildResult =
  | { ok: true; childId: string; username: string; password: string }
  | { ok: false; reason: 'consent_required' | 'username' | 'username_unavailable' }
  | { ok: false; reason: 'profile'; problem: ProfileProblem }
  | { ok: false; reason: 'password'; problem: CredentialProblem }
  | NotFound;

const UNIQUE_VIOLATION = '23505';

/**
 * Creates a child account linked to this parent. The username gets a random four-digit
 * suffix; if that one is taken another is tried, so a parent never learns that another
 * family's username exists. The password is returned once, for the parent to see.
 */
export async function createChild(
  sql: Sql,
  parentId: string,
  input: CreateChildInput,
  now: Date = new Date(),
): Promise<CreateChildResult> {
  if (!(await activeParent(sql, parentId))) return NOT_FOUND;
  if (!(await hasChildConsents(sql, parentId))) return { ok: false, reason: 'consent_required' };
  const problem = checkProfile(input);
  if (problem) return { ok: false, reason: 'profile', problem };
  const base = usernameBase(input.username);
  if (!base) return { ok: false, reason: 'username' };
  const password = input.password ?? generatePassphrase();
  const passwordProblem = checkNewPassword(password, 'child');
  if (passwordProblem) return { ok: false, reason: 'password', problem: passwordProblem };
  const passwordHash = await hashPassword(password);
  const subjects = [...new Set(input.subjects)];

  for (let attempt = 0; attempt < 25; attempt++) {
    const username = `${base}-${randomInt(1000, 10000)}`;
    try {
      const childId = await sql.begin(async (tx) => {
        const [account] = await tx<Array<{ id: string }>>`
          INSERT INTO accounts (role, status, username, display_name, password_hash, time_zone, created_at, updated_at)
          VALUES ('student', 'active', ${username}, ${cleanName(input.name)}, ${passwordHash}, ${input.timeZone}, ${now}, ${now})
          RETURNING id`;
        const id = account!.id;
        await tx`INSERT INTO student_profiles (account_id, grade, curriculum, subjects, avatar)
                 VALUES (${id}, ${input.grade}, ${input.curriculum}, ${subjects}, ${input.avatar})`;
        await tx`INSERT INTO guardian_links (parent_id, student_id, created_at) VALUES (${parentId}, ${id}, ${now})`;
        await writeAudit(
          tx,
          { type: 'CHILD_CREDENTIALS_CREATED', outcome: 'success', actorId: parentId, subjectId: id },
          now,
        );
        return id;
      });
      return { ok: true, childId, username, password };
    } catch (error) {
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
    }
  }
  return { ok: false, reason: 'username_unavailable' };
}

// ------------------------------------------------------------------ edit (M-08)

export async function updateChildProfile(
  sql: Sql,
  parentId: string,
  childId: string,
  input: ChildProfileInput,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'profile'; problem: ProfileProblem } | NotFound> {
  const problem = checkProfile(input);
  if (problem) return { ok: false, reason: 'profile', problem };
  return sql.begin(async (tx) => {
    if (!(await getChild(tx, parentId, childId, now))) return NOT_FOUND;
    await tx`UPDATE accounts SET display_name = ${cleanName(input.name)}, time_zone = ${input.timeZone}
             WHERE id = ${childId}`;
    await tx`UPDATE student_profiles
             SET grade = ${input.grade}, curriculum = ${input.curriculum},
                 subjects = ${[...new Set(input.subjects)]}, avatar = ${input.avatar}
             WHERE account_id = ${childId}`;
    await writeAudit(
      tx,
      { type: 'CHILD_PROFILE_UPDATED', outcome: 'success', actorId: parentId, subjectId: childId },
      now,
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------------------------ sign-in and security (M-08)

/** The parent's step-up state, from their own session. */
export interface ParentActor {
  parentId: string;
  reauthenticatedAt: Date;
}

type SecurityFailure = NotFound | { ok: false; reason: 'reauth_required' };

/** Shared guard: recent password confirmation, active parent, active guardian link. */
async function guard(
  sql: Db,
  actor: ParentActor,
  childId: string,
  action: string,
  now: Date,
): Promise<{ ok: true; child: ChildDetail } | SecurityFailure> {
  if (now.getTime() - actor.reauthenticatedAt.getTime() > STEP_UP_MINUTES * 60_000) {
    return { ok: false, reason: 'reauth_required' };
  }
  const child = await getChild(sql, actor.parentId, childId, now);
  if (!child) {
    await writeAudit(
      sql,
      {
        type: 'CHILD_ACTION_REFUSED',
        outcome: 'denied',
        actorId: UUID.test(actor.parentId) ? actor.parentId : null,
        details: { action },
      },
      now,
    );
    return NOT_FOUND;
  }
  return { ok: true, child };
}

export type ResetResult =
  | { ok: true; password: string; username: string }
  | { ok: false; reason: 'password'; problem: CredentialProblem }
  | SecurityFailure;

/**
 * Resets a child's password (§3.4 steps 5a–7). In one transaction: new hash, credential
 * version bumped, every session of the child revoked, lock cleared, audit written and the
 * parent emailed. The new password is returned once.
 */
export async function resetChildPassword(
  sql: Sql,
  actor: ParentActor,
  childId: string,
  newPassword: string | null,
  now: Date = new Date(),
): Promise<ResetResult> {
  const password = newPassword ?? generatePassphrase();
  const problem = checkNewPassword(password, 'child');
  if (problem) return { ok: false, reason: 'password', problem };
  const passwordHash = await hashPassword(password);
  return sql.begin(async (tx) => {
    const g = await guard(tx, actor, childId, 'reset', now);
    if (!g.ok) return g;
    await tx`UPDATE accounts SET password_hash = ${passwordHash}, credential_version = credential_version + 1
             WHERE id = ${childId}`;
    const revoked = await revokeAllSessions(tx, childId, now);
    await clearAccountLock(tx, 'username', g.child.username);
    await writeAudit(
      tx,
      { type: 'CHILD_PASSWORD_RESET', outcome: 'success', actorId: actor.parentId, subjectId: childId },
      now,
    );
    await writeAudit(
      tx,
      {
        type: 'CHILD_SESSIONS_REVOKED',
        outcome: 'success',
        actorId: actor.parentId,
        subjectId: childId,
        details: { reason: 'reset', count: revoked },
      },
      now,
    );
    await notifyParent(
      tx,
      actor.parentId,
      'child_password_reset',
      g.child,
      now,
      `child_password_reset:${childId}:${now.getTime()}`,
    );
    return { ok: true as const, password, username: g.child.username };
  });
}

/** Early unlock by the parent (§3.3 step 2): clears the lock; the password is unchanged. */
export async function unlockChild(
  sql: Sql,
  actor: ParentActor,
  childId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | SecurityFailure> {
  return sql.begin(async (tx) => {
    const g = await guard(tx, actor, childId, 'unlock', now);
    if (!g.ok) return g;
    await clearAccountLock(tx, 'username', g.child.username);
    await writeAudit(
      tx,
      {
        type: 'CHILD_UNLOCKED',
        outcome: 'success',
        actorId: actor.parentId,
        subjectId: childId,
        details: { by: 'parent' },
      },
      now,
    );
    return { ok: true as const };
  });
}

/** "Sign out of all devices" (§3.4 step 5c). */
export async function signOutChildEverywhere(
  sql: Sql,
  actor: ParentActor,
  childId: string,
  now: Date = new Date(),
): Promise<{ ok: true; count: number } | SecurityFailure> {
  return sql.begin(async (tx) => {
    const g = await guard(tx, actor, childId, 'sign_out', now);
    if (!g.ok) return g;
    const count = await revokeAllSessions(tx, childId, now);
    await writeAudit(
      tx,
      {
        type: 'CHILD_SESSIONS_REVOKED',
        outcome: 'success',
        actorId: actor.parentId,
        subjectId: childId,
        details: { reason: 'parent_request', count },
      },
      now,
    );
    return { ok: true as const, count };
  });
}

/** Pause stops the child signing in and signs them out; resume lets them sign in again (M-08). */
export async function setChildPaused(
  sql: Sql,
  actor: ParentActor,
  childId: string,
  paused: boolean,
  now: Date = new Date(),
): Promise<{ ok: true } | SecurityFailure> {
  return sql.begin(async (tx) => {
    const g = await guard(tx, actor, childId, paused ? 'pause' : 'resume', now);
    if (!g.ok) return g;
    await tx`UPDATE accounts SET status = ${paused ? 'suspended' : 'active'} WHERE id = ${childId}`;
    if (paused) await revokeAllSessions(tx, childId, now);
    await writeAudit(
      tx,
      {
        type: paused ? 'CHILD_PAUSED' : 'CHILD_RESUMED',
        outcome: 'success',
        actorId: actor.parentId,
        subjectId: childId,
      },
      now,
    );
    return { ok: true as const };
  });
}

async function notifyParent(
  sql: Db,
  parentId: string,
  template: 'child_password_reset' | 'child_locked',
  child: { name: string },
  now: Date,
  dedupeKey: string,
): Promise<void> {
  const [parent] = await sql<Array<{ email: string; display_name: string }>>`
    SELECT email, display_name FROM accounts WHERE id = ${parentId} AND role = 'parent' AND status = 'active'`;
  if (!parent) return;
  await queueEmail(sql, {
    to: parent.email,
    template,
    payload: { name: parent.display_name, childName: child.name, when: now.toISOString() },
    dedupeKey,
  });
}

// ------------------------------------------------------------------ child sign-in (M-02)

export type ChildSignInResult =
  | { ok: true; account: { id: string; role: 'student'; credential_version: number } }
  | { ok: false; reason: 'invalid' | 'locked' | 'ip_limited' | 'paused'; retryAfterSeconds?: number };

/**
 * Child sign-in with username and password (G1-08 §3.2). A wrong username, a wrong password
 * and an unknown account all answer the same way, take the same time and lock the same way.
 * Failures on real accounts are audited; the parents of a real account are emailed once per
 * lock. Nothing on screen says whether an account exists.
 */
export async function signInChild(
  sql: Sql,
  input: { username: string; password: string; ip?: string },
  now: Date = new Date(),
): Promise<ChildSignInResult> {
  const username = normaliseIdentifier(input.username).slice(0, 64);
  const keys = { kind: 'username' as const, identifier: username, ip: input.ip };
  const throttle = await checkThrottle(sql, keys, now);
  if (throttle.blocked) {
    if (throttle.reason === 'ip') {
      await writeAudit(sql, { type: 'RATE_LIMIT_IP_THROTTLED', outcome: 'denied', details: { form: 'child' } }, now);
    }
    return {
      ok: false,
      reason: throttle.reason === 'ip' ? 'ip_limited' : 'locked',
      retryAfterSeconds: throttle.retryAfterSeconds,
    };
  }
  const [account] = await sql<
    Array<{
      id: string;
      status: string;
      credential_version: number;
      password_hash: string | null;
      display_name: string;
    }>
  >`SELECT id, status, credential_version, password_hash, display_name FROM accounts
    WHERE username = ${username} AND role = 'student'`;
  const valid = await verifyPassword(account?.password_hash, input.password.slice(0, 256));
  if (!account || !valid) {
    const lockedNow = await recordFailure(sql, keys, now);
    if (account) {
      await writeAudit(sql, { type: 'CHILD_LOGIN_FAILED', outcome: 'failure', subjectId: account.id }, now);
      if (lockedNow) {
        await writeAudit(sql, { type: 'CHILD_LOCKED', outcome: 'success', subjectId: account.id }, now);
        const parents = await sql<Array<{ parent_id: string }>>`
          SELECT parent_id FROM guardian_links WHERE student_id = ${account.id} AND status = 'active'`;
        for (const { parent_id } of parents) {
          await notifyParent(
            sql,
            parent_id,
            'child_locked',
            { name: account.display_name },
            now,
            `child_locked:${account.id}:${parent_id}:${windowBucket(now, 15)}`,
          );
        }
      }
    }
    return lockedNow ? { ok: false, reason: 'locked', retryAfterSeconds: 15 * 60 } : { ok: false, reason: 'invalid' };
  }
  await recordSuccess(sql, keys);
  if (account.status !== 'active') {
    await writeAudit(
      sql,
      { type: 'CHILD_LOGIN_FAILED', outcome: 'denied', subjectId: account.id, details: { status: account.status } },
      now,
    );
    return { ok: false, reason: 'paused' };
  }
  // OC-72 (1): while the parent's account is deactivated, the child cannot sign in either.
  const [guardian] = await sql<Array<{ ok: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
      WHERE g.student_id = ${account.id} AND g.status = 'active' AND p.status = 'active'
    ) AS ok`;
  if (!guardian?.ok) {
    await writeAudit(
      sql,
      { type: 'CHILD_LOGIN_FAILED', outcome: 'denied', subjectId: account.id, details: { status: 'parent_inactive' } },
      now,
    );
    return { ok: false, reason: 'paused' };
  }
  await writeAudit(
    sql,
    { type: 'CHILD_LOGIN_SUCCEEDED', outcome: 'success', subjectId: account.id, actorId: account.id },
    now,
  );
  return { ok: true, account: { id: account.id, role: 'student', credential_version: account.credential_version } };
}

// ------------------------------------------------------------------ step-up (§3.4 step 3)

/** Checks the parent's own password for a step-up prompt. */
export async function checkParentPassword(sql: Sql, parentId: string, password: string): Promise<boolean> {
  if (!UUID.test(parentId)) return false;
  const [row] = await sql<Array<{ password_hash: string | null }>>`
    SELECT password_hash FROM accounts WHERE id = ${parentId} AND status = 'active'`;
  return verifyPassword(row?.password_hash, password.slice(0, 256));
}
