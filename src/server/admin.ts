import 'server-only';
import { looksLikeEmail, maskEmail, normaliseEmail } from './auth/accounts';
import { writeAudit } from './auth/audit';
import { queueEmail } from './auth/outbox';
import { revokeAllSessions } from './auth/sessions';
import { issueSetPassword } from './auth/setPasswordLink';
import { parentsToTellOfRejection, revalidateTeacherLinks } from './teacherLinks';
import type { Db, Sql } from './db/client';

/**
 * Super Admin and Admin tools (WP2-5b; boards M-27, M-28, M-29/60, M-30, 66; OC-21, OC-50).
 *
 * Every function takes the acting admin's id from their session and checks again in the
 * database that they may do this (role, active status and, for Admins, the ticked permission).
 * Rules that never change (OC-21): no admin opens a child's records or learning content, signs
 * in as someone else, or resets a child's password; only the Super Admin manages Admins.
 * Every change is written to the audit log.
 */
export const ADMIN_PERMISSIONS = ['accounts', 'teacher_approvals', 'audit_log'] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const PERMISSION_LABEL: Record<AdminPermission, string> = {
  accounts: 'Accounts',
  teacher_approvals: 'Teacher approvals',
  audit_log: 'Audit log',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Denied = { ok: false; reason: 'denied' };
const DENIED: Denied = { ok: false, reason: 'denied' };
type NotFound = { ok: false; reason: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, reason: 'not_found' };

function cleanName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** The permissions an Admin holds; empty for anyone else. */
export async function adminPermissions(sql: Db, accountId: string): Promise<AdminPermission[]> {
  if (!UUID.test(accountId)) return [];
  const [row] = await sql<Array<{ permissions: AdminPermission[] }>>`
    SELECT p.permissions FROM admin_permissions p JOIN accounts a ON a.id = p.account_id
    WHERE p.account_id = ${accountId} AND a.role = 'admin' AND a.status = 'active'`;
  return row?.permissions ?? [];
}

/**
 * True when the actor is the active Super Admin, or an active Admin holding `permission`.
 * `permission: 'superadmin'` means the Super Admin only.
 */
export async function mayAct(sql: Db, actorId: string, permission: AdminPermission | 'superadmin'): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const [actor] = await sql<Array<{ role: string }>>`
    SELECT role FROM accounts WHERE id = ${actorId} AND status = 'active' AND role IN ('superadmin', 'admin')`;
  if (!actor) return false;
  if (actor.role === 'superadmin') return true;
  if (permission === 'superadmin') return false;
  return (await adminPermissions(sql, actorId)).includes(permission);
}

function cleanPermissions(input: string[]): AdminPermission[] {
  return ADMIN_PERMISSIONS.filter((p) => input.includes(p));
}

// ------------------------------------------------------------------ Admins (board 66)

export interface AdminRow {
  id: string;
  name: string;
  email: string;
  status: string;
  invited: boolean;
  permissions: AdminPermission[];
}

export async function listAdmins(sql: Db, actorId: string): Promise<AdminRow[] | null> {
  if (!(await mayAct(sql, actorId, 'superadmin'))) return null;
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      email: string;
      status: string;
      invited: boolean;
      permissions: AdminPermission[] | null;
    }>
  >`SELECT a.id, a.display_name AS name, a.email, a.status, a.password_hash IS NULL AS invited, p.permissions
    FROM accounts a LEFT JOIN admin_permissions p ON p.account_id = a.id
    WHERE a.role = 'admin' ORDER BY a.created_at, a.id`;
  return rows.map((r) => ({ ...r, permissions: r.permissions ?? [] }));
}

export type CreateAdminResult =
  | { ok: true; adminId: string }
  | { ok: false; reason: 'invalid_name' | 'invalid_email' | 'no_permissions' | 'email_taken' }
  | Denied;

/** Board 66 "Add an admin": the new Admin gets a set-password link and must set up MFA. */
export async function createAdmin(
  sql: Sql,
  actorId: string,
  input: { name: string; email: string; permissions: string[]; baseUrl: string },
  now: Date = new Date(),
): Promise<CreateAdminResult> {
  if (!(await mayAct(sql, actorId, 'superadmin'))) return DENIED;
  const name = cleanName(input.name);
  const email = normaliseEmail(input.email);
  const permissions = cleanPermissions(input.permissions);
  if (name.length < 1 || name.length > 80) return { ok: false, reason: 'invalid_name' };
  if (!looksLikeEmail(email)) return { ok: false, reason: 'invalid_email' };
  if (permissions.length === 0) return { ok: false, reason: 'no_permissions' };
  return sql.begin(async (tx) => {
    const [taken] = await tx`SELECT 1 FROM accounts WHERE email = ${email}`;
    if (taken) return { ok: false as const, reason: 'email_taken' as const };
    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO accounts (role, status, email, display_name, created_at, updated_at)
      VALUES ('admin', 'active', ${email}, ${name}, ${now}, ${now}) RETURNING id`;
    const adminId = row!.id;
    await tx`INSERT INTO admin_permissions (account_id, permissions, granted_by, updated_at)
             VALUES (${adminId}, ${permissions}, ${actorId}, ${now})`;
    await issueSetPassword(tx, { id: adminId, email, name }, 'admin_invite', input.baseUrl, now);
    await writeAudit(
      tx,
      {
        type: 'ADMIN_CREATED',
        outcome: 'success',
        actorId,
        subjectId: adminId,
        details: { permissions: permissions.join(',') },
      },
      now,
    );
    return { ok: true as const, adminId };
  });
}

export async function updateAdmin(
  sql: Sql,
  actorId: string,
  adminId: string,
  input: { permissions: string[]; active: boolean },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'no_permissions' } | Denied | NotFound> {
  if (!(await mayAct(sql, actorId, 'superadmin'))) return DENIED;
  if (!UUID.test(adminId)) return NOT_FOUND;
  const permissions = cleanPermissions(input.permissions);
  if (input.active && permissions.length === 0) return { ok: false, reason: 'no_permissions' };
  return sql.begin(async (tx) => {
    const [admin] = await tx<Array<{ status: string }>>`
      SELECT status FROM accounts WHERE id = ${adminId} AND role = 'admin' FOR UPDATE`;
    if (!admin) return NOT_FOUND;
    await tx`UPDATE admin_permissions SET permissions = ${permissions}, granted_by = ${actorId}, updated_at = ${now}
             WHERE account_id = ${adminId}`;
    const status = input.active ? 'active' : 'deactivated';
    if (status !== admin.status) {
      await tx`UPDATE accounts SET status = ${status} WHERE id = ${adminId}`;
      if (status === 'deactivated') await revokeAllSessions(tx, adminId, now);
    }
    await writeAudit(
      tx,
      {
        type: 'ADMIN_UPDATED',
        outcome: 'success',
        actorId,
        subjectId: adminId,
        details: { permissions: permissions.join(','), status },
      },
      now,
    );
    return { ok: true as const };
  });
}

/** Sends a fresh set-password link to an Admin who has not set a password yet. */
export async function resendAdminInvite(
  sql: Sql,
  actorId: string,
  adminId: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<{ ok: true } | Denied | NotFound> {
  if (!(await mayAct(sql, actorId, 'superadmin'))) return DENIED;
  if (!UUID.test(adminId)) return NOT_FOUND;
  return sql.begin(async (tx) => {
    const [admin] = await tx<Array<{ email: string; display_name: string }>>`
      SELECT email, display_name FROM accounts
      WHERE id = ${adminId} AND role = 'admin' AND status = 'active' AND password_hash IS NULL`;
    if (!admin) return NOT_FOUND;
    await tx`UPDATE one_time_tokens SET used_at = ${now}
             WHERE account_id = ${adminId} AND purpose = 'set_password' AND used_at IS NULL`;
    await issueSetPassword(
      tx,
      { id: adminId, email: admin.email, name: admin.display_name },
      'admin_invite',
      baseUrl,
      now,
    );
    await writeAudit(tx, { type: 'ADMIN_INVITE_RESENT', outcome: 'success', actorId, subjectId: adminId }, now);
    return { ok: true as const };
  });
}

// ------------------------------------------------------------------ Accounts (M-27, M-28)

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  role: 'parent' | 'teacher';
  status: string;
  /** Parents: number of linked children (never their names). Teachers: subjects and grades. */
  detail: string;
  createdAt: Date;
  lastSignIn: Date | null;
}

export interface AccountFilter {
  q?: string;
  role?: string;
  status?: string;
}

const SUBJECT_NAME: Record<string, string> = {
  maths: 'Maths',
  science: 'Science',
  sst: 'SST',
  english: 'English',
  hindi: 'Hindi',
  it: 'IT',
};

/** "CBSE, ICSE · 8 years' experience", or null when the teacher stated neither (K-6). */
export function teacherClaims(curricula: string[], experienceYears: number | null): string | null {
  const parts = [
    curricula.join(', '),
    experienceYears === null
      ? ''
      : `${experienceYears} ${Number(experienceYears) === 1 ? 'year' : 'years'} of teaching experience`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function teacherDetail(subjects: string[] | null, grades: number[] | null): string {
  const s = (subjects ?? []).map((x) => SUBJECT_NAME[x] ?? x).join(', ');
  const g = grades?.length ? `Grades ${[...grades].sort((a, b) => a - b).join(', ')}` : '';
  return [s, g].filter(Boolean).join(' · ') || 'Profile not completed';
}

/** Parent and teacher accounts only (M-27). Children appear only as a count. */
export async function listAccounts(sql: Db, actorId: string, filter: AccountFilter = {}): Promise<AccountRow[] | null> {
  if (!(await mayAct(sql, actorId, 'accounts'))) return null;
  const roles = filter.role === 'parent' || filter.role === 'teacher' ? [filter.role] : ['parent', 'teacher'];
  const statuses = ['active', 'pending_email', 'pending_approval', 'suspended', 'deactivated'].includes(
    filter.status ?? '',
  )
    ? [filter.status!]
    : ['active', 'pending_email', 'pending_approval', 'suspended', 'deactivated'];
  const q = (filter.q ?? '').trim().toLowerCase().slice(0, 80);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      email: string;
      role: 'parent' | 'teacher';
      status: string;
      created_at: Date;
      last_sign_in: Date | null;
      children: number;
      subjects: string[] | null;
      grades: number[] | null;
    }>
  >`SELECT a.id, a.display_name AS name, a.email, a.role, a.status, a.created_at,
           (SELECT max(s.created_at) FROM sessions s WHERE s.account_id = a.id) AS last_sign_in,
           (SELECT count(*)::int FROM guardian_links g WHERE g.parent_id = a.id AND g.status = 'active') AS children,
           t.subjects, t.grades
    FROM accounts a LEFT JOIN teacher_profiles t ON t.account_id = a.id
    WHERE a.role = ANY(${roles}) AND a.status = ANY(${statuses})
      ${q ? sql`AND (lower(a.display_name) LIKE ${like} OR a.email LIKE ${like})` : sql``}
    ORDER BY a.created_at DESC, a.id LIMIT 200`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    detail:
      r.role === 'parent'
        ? `${r.children} ${r.children === 1 ? 'child' : 'children'}`
        : teacherDetail(r.subjects, r.grades),
    createdAt: r.created_at,
    lastSignIn: r.last_sign_in,
  }));
}

/** One parent or teacher account for the edit page (M-28). */
export async function getAccount(sql: Db, actorId: string, accountId: string): Promise<AccountRow | null> {
  if (!UUID.test(accountId) || !(await mayAct(sql, actorId, 'accounts'))) return null;
  const [row] = await sql<
    Array<{ id: string; name: string; email: string; role: 'parent' | 'teacher'; status: string; created_at: Date }>
  >`SELECT id, display_name AS name, email, role, status, created_at FROM accounts
    WHERE id = ${accountId} AND role IN ('parent', 'teacher')`;
  return row ? { ...row, detail: '', createdAt: row.created_at, lastSignIn: null } : null;
}

export type CreateAccountResult =
  | { ok: true; accountId: string }
  | { ok: false; reason: 'invalid_name' | 'invalid_email' | 'email_taken' | 'invalid_role' }
  | Denied;

/** M-28 "Create an account": the person gets an email to set their own password. */
export async function createAccount(
  sql: Sql,
  actorId: string,
  input: { role: string; name: string; email: string; baseUrl: string },
  now: Date = new Date(),
): Promise<CreateAccountResult> {
  if (!(await mayAct(sql, actorId, 'accounts'))) return DENIED;
  if (input.role !== 'parent' && input.role !== 'teacher') return { ok: false, reason: 'invalid_role' };
  const role = input.role;
  const name = cleanName(input.name);
  const email = normaliseEmail(input.email);
  if (name.length < 1 || name.length > 80) return { ok: false, reason: 'invalid_name' };
  if (!looksLikeEmail(email)) return { ok: false, reason: 'invalid_email' };
  return sql.begin(async (tx) => {
    const [taken] = await tx`SELECT 1 FROM accounts WHERE email = ${email}`;
    if (taken) return { ok: false as const, reason: 'email_taken' as const };
    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO accounts (role, status, email, display_name, created_at, updated_at)
      VALUES (${role}, ${role === 'teacher' ? 'pending_approval' : 'active'}, ${email}, ${name}, ${now}, ${now})
      RETURNING id`;
    const accountId = row!.id;
    if (role === 'teacher') {
      await tx`INSERT INTO teacher_profiles (account_id, origin, approval_status) VALUES (${accountId}, 'admin_created', 'draft')`;
    }
    await issueSetPassword(tx, { id: accountId, email, name }, 'account_created_set_password', input.baseUrl, now);
    await writeAudit(
      tx,
      { type: 'ACCOUNT_CREATED', outcome: 'success', actorId, subjectId: accountId, details: { role } },
      now,
    );
    return { ok: true as const, accountId };
  });
}

/** M-28 edit: name and email. Field names (not values) are recorded in the audit log. */
export async function updateAccount(
  sql: Sql,
  actorId: string,
  accountId: string,
  input: { name: string; email: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'invalid_name' | 'invalid_email' | 'email_taken' } | Denied | NotFound> {
  if (!(await mayAct(sql, actorId, 'accounts'))) return DENIED;
  if (!UUID.test(accountId)) return NOT_FOUND;
  const name = cleanName(input.name);
  const email = normaliseEmail(input.email);
  if (name.length < 1 || name.length > 80) return { ok: false, reason: 'invalid_name' };
  if (!looksLikeEmail(email)) return { ok: false, reason: 'invalid_email' };
  return sql.begin(async (tx) => {
    const [current] = await tx<Array<{ display_name: string; email: string }>>`
      SELECT display_name, email FROM accounts WHERE id = ${accountId} AND role IN ('parent', 'teacher') FOR UPDATE`;
    if (!current) return NOT_FOUND;
    if (email !== current.email) {
      const [taken] = await tx`SELECT 1 FROM accounts WHERE email = ${email} AND id <> ${accountId}`;
      if (taken) return { ok: false as const, reason: 'email_taken' as const };
    }
    const changed = [name !== current.display_name ? 'name' : '', email !== current.email ? 'email' : '']
      .filter(Boolean)
      .join(',');
    if (!changed) return { ok: true as const };
    await tx`UPDATE accounts SET display_name = ${name}, email = ${email} WHERE id = ${accountId}`;
    if (email !== current.email) {
      // The old address is told, so a change made by mistake (or by someone else) is noticed.
      await queueEmail(tx, {
        to: current.email,
        template: 'account_email_changed',
        payload: { name, newEmail: maskEmail(email) },
        dedupeKey: `account_email_changed:${accountId}:${now.getTime()}`,
      });
    }
    await writeAudit(
      tx,
      { type: 'ACCOUNT_UPDATED', outcome: 'success', actorId, subjectId: accountId, details: { changed } },
      now,
    );
    return { ok: true as const };
  });
}

/** M-28 deactivate (reason required) and reactivate. Deactivating signs the person out everywhere. */
export async function setAccountActive(
  sql: Sql,
  actorId: string,
  accountId: string,
  input: { active: boolean; reason: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'reason_required' } | Denied | NotFound> {
  if (!(await mayAct(sql, actorId, 'accounts'))) return DENIED;
  if (!UUID.test(accountId)) return NOT_FOUND;
  const reason = input.reason.trim().slice(0, 500);
  if (!input.active && reason.length < 3) return { ok: false, reason: 'reason_required' };
  return sql.begin(async (tx) => {
    const [account] = await tx<Array<{ role: string; status: string; confirmed: boolean; approval: string | null }>>`
      SELECT a.role, a.status, (a.email_verified_at IS NOT NULL OR a.password_hash IS NULL) AS confirmed,
             t.approval_status AS approval
      FROM accounts a LEFT JOIN teacher_profiles t ON t.account_id = a.id
      WHERE a.id = ${accountId} AND a.role IN ('parent', 'teacher') FOR UPDATE OF a`;
    if (!account) return NOT_FOUND;
    if (input.active) {
      if (account.status !== 'deactivated' && account.status !== 'suspended') return { ok: true as const };
      // Back to where the account would be: waiting for approval, unconfirmed email, or active.
      // (An account created by an admin has no password yet; it confirms its email on setting one.)
      const status =
        account.role === 'teacher' && account.approval !== 'approved'
          ? 'pending_approval'
          : account.confirmed
            ? 'active'
            : 'pending_email';
      await tx`UPDATE accounts SET status = ${status}, status_reason = NULL WHERE id = ${accountId}`;
      await writeAudit(
        tx,
        { type: 'ACCOUNT_REACTIVATED', outcome: 'success', actorId, subjectId: accountId, details: { status } },
        now,
      );
    } else {
      await tx`UPDATE accounts SET status = 'deactivated', status_reason = ${reason} WHERE id = ${accountId}`;
      await revokeAllSessions(tx, accountId, now);
      if (account.role === 'parent') {
        // OC-72 (1): their children are signed out too, unless another parent of theirs is active.
        const children = await tx<Array<{ id: string }>>`
          SELECT g.student_id AS id FROM guardian_links g
          WHERE g.parent_id = ${accountId} AND g.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM guardian_links o JOIN accounts p ON p.id = o.parent_id
              WHERE o.student_id = g.student_id AND o.parent_id <> ${accountId}
                AND o.status = 'active' AND p.status = 'active')`;
        for (const child of children) await revokeAllSessions(tx, child.id, now);
      }
      await writeAudit(
        tx,
        {
          type: 'ACCOUNT_DEACTIVATED',
          outcome: 'success',
          actorId,
          subjectId: accountId,
          details: { role: account.role },
        },
        now,
      );
    }
    return { ok: true as const };
  });
}

// ------------------------------------------------------------------ Teacher approvals (M-29, board 60)

export interface PendingTeacher {
  id: string;
  name: string;
  email: string;
  origin: 'self_registered' | 'parent_added' | 'admin_created';
  addedBy: string | null;
  createdAt: Date;
  approvalStatus: string;
  detail: string;
  bio: string | null;
  /** The teacher's own statement (K-6), shown to the approver as such. */
  claims: string | null;
  submittedAt: Date | null;
  /** Every teacher must send their profile (and accept the terms) before approval (OC-38, OC-75). */
  canApprove: boolean;
  /** "Request changes" needs a sent profile and is not offered for parent-added teachers. */
  canRequestChanges: boolean;
}

/** Which decisions are open for a teacher in the queue (also enforced in decideTeacher). */
export function decisionsOpen(origin: string, approvalStatus: string): Record<TeacherDecision, boolean> {
  const sent = approvalStatus === 'submitted';
  return {
    // OC-75: every teacher, parent-added ones too, sends a completed profile before approval.
    approve: sent,
    changes: sent && origin !== 'parent_added',
    reject: sent || approvalStatus === 'draft',
  };
}

export async function listPendingTeachers(sql: Db, actorId: string): Promise<PendingTeacher[] | null> {
  if (!(await mayAct(sql, actorId, 'teacher_approvals'))) return null;
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      email: string;
      origin: PendingTeacher['origin'];
      parent_email: string | null;
      created_at: Date;
      approval_status: string;
      subjects: string[];
      grades: number[];
      bio: string | null;
      curricula: string[];
      experience_years: number | null;
      submitted_at: Date | null;
    }>
  >`SELECT a.id, a.display_name AS name, a.email, t.origin, p.email AS parent_email, a.created_at,
           t.approval_status, t.subjects, t.grades, t.bio, t.curricula, t.experience_years, t.submitted_at
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
    LEFT JOIN accounts p ON p.id = t.added_by_parent_id
    WHERE a.role = 'teacher' AND a.status = 'pending_approval'
      AND t.approval_status IN ('draft', 'submitted')
    ORDER BY (t.approval_status = 'submitted') DESC, t.submitted_at, a.created_at, a.id`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    origin: r.origin,
    addedBy: r.parent_email ? maskEmail(r.parent_email) : null,
    createdAt: r.created_at,
    approvalStatus: r.approval_status,
    detail: teacherDetail(r.subjects, r.grades),
    bio: r.bio,
    claims: teacherClaims(r.curricula, r.experience_years),
    submittedAt: r.submitted_at,
    canApprove: decisionsOpen(r.origin, r.approval_status).approve,
    canRequestChanges: decisionsOpen(r.origin, r.approval_status).changes,
  }));
}

export type TeacherDecision = 'approve' | 'reject' | 'changes';

/** M-29: approve, reject or ask for changes, with a required note. Audited; the teacher is emailed. */
export async function decideTeacher(
  sql: Sql,
  actorId: string,
  teacherId: string,
  input: { decision: TeacherDecision; note: string; baseUrl: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'note_required' | 'not_ready' } | Denied | NotFound> {
  if (!(await mayAct(sql, actorId, 'teacher_approvals'))) return DENIED;
  if (!UUID.test(teacherId)) return NOT_FOUND;
  const note = input.note.trim().slice(0, 1000);
  if (note.length < 3) return { ok: false, reason: 'note_required' };
  return sql.begin(async (tx) => {
    const [t] = await tx<
      Array<{ email: string; display_name: string; has_password: boolean; origin: string; approval_status: string }>
    >`
      SELECT a.email, a.display_name, a.password_hash IS NOT NULL AS has_password, p.origin, p.approval_status
      FROM accounts a JOIN teacher_profiles p ON p.account_id = a.id
      WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'pending_approval'
        AND p.approval_status IN ('draft', 'submitted')
      FOR UPDATE OF a, p`;
    if (!t) return NOT_FOUND;
    // A teacher who registered themselves (or was created by an admin) must send their profile
    // and accept the terms before they can be approved (OC-38, OC-71).
    if (!decisionsOpen(t.origin, t.approval_status)[input.decision])
      return { ok: false as const, reason: 'not_ready' as const };
    const approval = { approve: 'approved', reject: 'rejected', changes: 'changes_requested' }[input.decision];
    await tx`UPDATE teacher_profiles SET approval_status = ${approval}, decided_by = ${actorId}, decided_at = ${now},
                    decision_note = ${note}
             WHERE account_id = ${teacherId}`;
    if (input.decision === 'approve') {
      // OC-36, OC-75: waiting links start, limited to the subjects just approved; parents are told.
      await revalidateTeacherLinks(tx, teacherId, { activate: true, baseUrl: input.baseUrl }, now);
    } else if (input.decision === 'reject') {
      for (const parent of await parentsToTellOfRejection(tx, teacherId)) {
        await queueEmail(tx, {
          to: parent.email,
          template: 'parent_teacher_not_approved',
          payload: { name: parent.name, teacher: t.display_name, teachersUrl: `${input.baseUrl}/parent/teachers` },
          dedupeKey: `parent_teacher_decision:${teacherId}:${parent.email}:rejected`,
        });
      }
    }
    if (input.decision === 'approve') {
      await tx`UPDATE accounts SET status = 'active' WHERE id = ${teacherId}`;
      if (t.has_password) {
        await queueEmail(tx, {
          to: t.email,
          template: 'teacher_approved',
          payload: { name: t.display_name, signInUrl: `${input.baseUrl}/sign-in` },
          dedupeKey: `teacher_approved:${teacherId}`,
        });
      } else {
        await issueSetPassword(
          tx,
          { id: teacherId, email: t.email, name: t.display_name },
          'teacher_approved_set_password',
          input.baseUrl,
          now,
        );
      }
    } else {
      await queueEmail(tx, {
        to: t.email,
        template: input.decision === 'reject' ? 'teacher_not_approved' : 'teacher_changes_requested',
        payload: { name: t.display_name, signInUrl: `${input.baseUrl}/sign-in` },
        dedupeKey: `teacher_decision:${teacherId}:${now.getTime()}`,
      });
    }
    await writeAudit(
      tx,
      { type: 'TEACHER_DECISION', outcome: 'success', actorId, subjectId: teacherId, details: { decision: approval } },
      now,
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------------------------ Profile changes (OC-73)

export interface ProfileChange {
  id: string;
  name: string;
  email: string;
  current: string;
  requested: string;
  submittedAt: Date;
}

/** Approved teachers who asked to change their subjects or grades (OC-73). They keep teaching meanwhile. */
export async function listProfileChanges(sql: Db, actorId: string): Promise<ProfileChange[] | null> {
  if (!(await mayAct(sql, actorId, 'teacher_approvals'))) return null;
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      email: string;
      subjects: string[];
      grades: number[];
      pending_subjects: string[];
      pending_grades: number[];
      change_submitted_at: Date;
    }>
  >`SELECT a.id, a.display_name AS name, a.email, t.subjects, t.grades, t.pending_subjects, t.pending_grades,
           t.change_submitted_at
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
    WHERE a.role = 'teacher' AND a.status = 'active' AND t.change_submitted_at IS NOT NULL
    ORDER BY t.change_submitted_at, a.id`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    current: teacherDetail(r.subjects, r.grades),
    requested: teacherDetail(r.pending_subjects, r.pending_grades),
    submittedAt: r.change_submitted_at,
  }));
}

/**
 * Accept or decline an approved teacher's subject/grade change (OC-73). Accepting replaces the
 * approved values; declining keeps them. Either way the teacher keeps their access, is emailed
 * and sees the note on their profile page.
 */
export async function decideProfileChange(
  sql: Sql,
  actorId: string,
  teacherId: string,
  input: { decision: 'approve' | 'decline'; note: string; baseUrl: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'note_required' } | Denied | NotFound> {
  if (!(await mayAct(sql, actorId, 'teacher_approvals'))) return DENIED;
  if (!UUID.test(teacherId)) return NOT_FOUND;
  const note = input.note.trim().slice(0, 1000);
  if (note.length < 3) return { ok: false, reason: 'note_required' };
  return sql.begin(async (tx) => {
    const [t] = await tx<Array<{ email: string; display_name: string }>>`
      SELECT a.email, a.display_name
      FROM accounts a JOIN teacher_profiles p ON p.account_id = a.id
      WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'active'
        AND p.approval_status = 'approved' AND p.change_submitted_at IS NOT NULL
      FOR UPDATE OF a, p`;
    if (!t) return NOT_FOUND;
    const decision = input.decision === 'approve' ? 'approved' : 'declined';
    if (decision === 'approved') {
      await tx`UPDATE teacher_profiles SET subjects = pending_subjects, grades = pending_grades
               WHERE account_id = ${teacherId}`;
    }
    await tx`UPDATE teacher_profiles
             SET pending_subjects = NULL, pending_grades = NULL, change_submitted_at = NULL,
                 change_decision = ${decision}, change_decision_note = ${note},
                 change_decided_by = ${actorId}, change_decided_at = ${now}
             WHERE account_id = ${teacherId}`;
    if (decision === 'approved') {
      // OC-75: links lose subjects the teacher no longer teaches; parents are told.
      await revalidateTeacherLinks(tx, teacherId, { activate: false, baseUrl: input.baseUrl }, now);
    }
    await queueEmail(tx, {
      to: t.email,
      template: decision === 'approved' ? 'teacher_profile_change_approved' : 'teacher_profile_change_declined',
      payload: { name: t.display_name, profileUrl: `${input.baseUrl}/teacher/profile` },
      dedupeKey: `teacher_profile_change:${teacherId}:${now.getTime()}`,
    });
    await writeAudit(
      tx,
      {
        type: 'TEACHER_PROFILE_CHANGE_DECISION',
        outcome: 'success',
        actorId,
        subjectId: teacherId,
        details: { decision },
      },
      now,
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------------------------ Audit log (M-30)

export interface AuditRow {
  id: string;
  at: Date;
  who: string;
  type: string;
  outcome: string;
  record: string;
}

export interface AuditFilter {
  type?: string;
  from?: Date;
  to?: Date;
  page?: number;
}

/**
 * How a person appears in the log: admins by name, adults by masked email, children only as
 * "Child account" (no names, OC-21), and "Unknown" for failed attempts on unknown accounts.
 */
function personLabel(role: string | null, name: string | null, email: string | null, id: string | null): string {
  if (!id) return '—';
  if (!role) return 'Deleted account';
  if (role === 'student') return `Child account #${id.slice(0, 6)}`;
  if (role === 'superadmin') return `${name ?? ''} (Super Admin)`;
  if (role === 'admin') return `${name ?? ''} (Admin)`;
  return `${email ? maskEmail(email) : '—'} (${role === 'parent' ? 'parent' : 'teacher'})`;
}

export const AUDIT_PAGE_SIZE = 100;

export async function listAuditEvents(sql: Db, actorId: string, filter: AuditFilter = {}): Promise<AuditRow[] | null> {
  if (!(await mayAct(sql, actorId, 'audit_log'))) return null;
  const type = filter.type && /^[A-Z][A-Z0-9_]{2,63}$/.test(filter.type) ? filter.type : null;
  const offset = Math.max(0, Math.min(1000, Math.floor(filter.page ?? 0))) * AUDIT_PAGE_SIZE;
  const rows = await sql<
    Array<{
      id: string;
      occurred_at: Date;
      event_type: string;
      outcome: string;
      actor_id: string | null;
      actor_role: string | null;
      actor_name: string | null;
      actor_email: string | null;
      subject_id: string | null;
      subject_role: string | null;
      subject_name: string | null;
      subject_email: string | null;
    }>
  >`SELECT e.id::text, e.occurred_at, e.event_type, e.outcome,
           e.actor_id, a.role AS actor_role, a.display_name AS actor_name, a.email AS actor_email,
           e.subject_id, s.role AS subject_role, s.display_name AS subject_name, s.email AS subject_email
    FROM audit_events e
    LEFT JOIN accounts a ON a.id = e.actor_id
    LEFT JOIN accounts s ON s.id = e.subject_id
    WHERE TRUE
      ${type ? sql`AND e.event_type = ${type}` : sql``}
      ${filter.from ? sql`AND e.occurred_at >= ${filter.from}` : sql``}
      ${filter.to ? sql`AND e.occurred_at < ${filter.to}` : sql``}
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT ${AUDIT_PAGE_SIZE} OFFSET ${offset}`;
  return rows.map((r) => ({
    id: r.id,
    at: r.occurred_at,
    who: r.actor_id ? personLabel(r.actor_role, r.actor_name, r.actor_email, r.actor_id) : 'System or unknown',
    type: r.event_type,
    outcome: r.outcome,
    record: personLabel(r.subject_role, r.subject_name, r.subject_email, r.subject_id),
  }));
}

/** Distinct event types, for the filter. */
export async function auditEventTypes(sql: Db, actorId: string): Promise<string[]> {
  if (!(await mayAct(sql, actorId, 'audit_log'))) return [];
  const rows = await sql<Array<{ event_type: string }>>`SELECT DISTINCT event_type FROM audit_events ORDER BY 1`;
  return rows.map((r) => r.event_type);
}

/** The acting admin's own recent actions, for the home page (M-35). */
export async function recentActionsBy(sql: Db, actorId: string, limit = 5): Promise<AuditRow[]> {
  const rows = await sql<
    Array<{
      id: string;
      occurred_at: Date;
      event_type: string;
      outcome: string;
      subject_id: string | null;
      role: string | null;
      name: string | null;
      email: string | null;
    }>
  >`SELECT e.id::text, e.occurred_at, e.event_type, e.outcome, e.subject_id, s.role, s.display_name AS name, s.email
    FROM audit_events e LEFT JOIN accounts s ON s.id = e.subject_id
    WHERE e.actor_id = ${actorId} AND e.event_type NOT IN ('SIGN_IN', 'MFA_SUCCEEDED', 'MFA_FAILED')
    ORDER BY e.occurred_at DESC, e.id DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    at: r.occurred_at,
    who: '',
    type: r.event_type,
    outcome: r.outcome,
    record: personLabel(r.role, r.name, r.email, r.subject_id),
  }));
}
