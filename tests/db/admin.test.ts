import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminPermissions,
  createAccount,
  createAdmin,
  decideTeacher,
  listAccounts,
  listAdmins,
  listAuditEvents,
  listPendingTeachers,
  mayAct,
  setAccountActive,
  updateAccount,
  updateAdmin,
} from '@/server/admin';
import { createSession, loadSession } from '@/server/auth/sessions';
import { createAdult, createChild, testDb, uniq } from './helpers';

/** WP2-5b: Admins and permissions, accounts, teacher approvals, audit log (OC-21, OC-50). */
const sql = testDb();
const T0 = new Date('2026-10-16T06:00:00Z');
const BASE = 'http://aa.test';

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

const email = (tag: string) => `${tag}-${uniq()}@example.com`;

async function lastMail(to: string) {
  const [row] = await sql<Array<{ template: string; payload: Record<string, string> }>>`
    SELECT template, payload FROM email_outbox WHERE to_address = ${to} ORDER BY created_at DESC, id DESC LIMIT 1`;
  return row;
}

async function admin(permissions: string[]) {
  const owner = await createAdult(sql, 'superadmin');
  const address = email('admin');
  const r = await createAdmin(sql, owner, { name: 'Admin Test', email: address, permissions, baseUrl: BASE }, T0);
  if (!r.ok) throw new Error(r.reason);
  return { owner, adminId: r.adminId, address };
}

async function pendingTeacher() {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'pending_approval', ${email('teacher')}, 'Teacher Waiting', 'x') RETURNING id`;
  // A self-registered teacher who has sent their profile (only a sent profile can be approved).
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, submitted_at)
            VALUES (${row!.id}, 'self_registered', 'submitted', ${['science']}, ${[4, 5]}, now())`;
  return row!.id;
}

describe('Admins (board 66)', () => {
  it('only the Super Admin creates Admins; they get a set-password link', async () => {
    const { owner, adminId, address } = await admin(['audit_log']);
    expect(await adminPermissions(sql, adminId)).toEqual(['audit_log']);
    const mail = await lastMail(address);
    expect(mail?.template).toBe('admin_invite');
    expect(mail?.payload.link).toMatch(/\/reset-password\?purpose=set_password&token=/);
    expect((await listAdmins(sql, owner))?.map((a) => a.id)).toContain(adminId);
    // An Admin cannot add or list Admins.
    expect(
      await createAdmin(sql, adminId, { name: 'X', email: email('x'), permissions: ['accounts'], baseUrl: BASE }),
    ).toEqual({ ok: false, reason: 'denied' });
    expect(await listAdmins(sql, adminId)).toBeNull();
    // Parents and teachers cannot either.
    const parent = await createAdult(sql, 'parent');
    expect(await listAdmins(sql, parent)).toBeNull();
  });

  it('refuses a taken email and an admin with nothing to manage', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const taken = email('taken');
    await createAdmin(sql, owner, { name: 'One', email: taken, permissions: ['accounts'], baseUrl: BASE });
    expect(
      await createAdmin(sql, owner, { name: 'Two', email: taken, permissions: ['accounts'], baseUrl: BASE }),
    ).toEqual({
      ok: false,
      reason: 'email_taken',
    });
    expect(
      await createAdmin(sql, owner, { name: 'Three', email: email('t'), permissions: ['nope'], baseUrl: BASE }),
    ).toEqual({
      ok: false,
      reason: 'no_permissions',
    });
  });

  it('each permission opens only its own area, checked on the server', async () => {
    const { adminId } = await admin(['audit_log']);
    expect(await mayAct(sql, adminId, 'audit_log')).toBe(true);
    expect(await mayAct(sql, adminId, 'accounts')).toBe(false);
    expect(await mayAct(sql, adminId, 'teacher_approvals')).toBe(false);
    expect(await mayAct(sql, adminId, 'superadmin')).toBe(false);
    expect(await listAccounts(sql, adminId)).toBeNull();
    expect(await listPendingTeachers(sql, adminId)).toBeNull();
    expect(await listAuditEvents(sql, adminId)).not.toBeNull();
  });

  it('turning an Admin off signs them out and removes every permission at once', async () => {
    const { owner, adminId } = await admin(['accounts', 'audit_log']);
    const s = await createSession(sql, { id: adminId, role: 'admin', credential_version: 1 }, T0);
    expect(await updateAdmin(sql, owner, adminId, { permissions: ['accounts'], active: false }, T0)).toEqual({
      ok: true,
    });
    expect(await loadSession(sql, s.token, T0)).toBeNull();
    expect(await mayAct(sql, adminId, 'accounts')).toBe(false);
    expect(await adminPermissions(sql, adminId)).toEqual([]);
  });

  it('the database refuses permissions for anyone but an Admin', async () => {
    const parent = await createAdult(sql, 'parent');
    await expect(
      sql`INSERT INTO admin_permissions (account_id, permissions) VALUES (${parent}, ${['accounts']})`,
    ).rejects.toThrow(/is not a admin/);
  });
});

describe('Accounts (M-27, M-28)', () => {
  it('lists parents and teachers only, children as a count', async () => {
    const { adminId } = await admin(['accounts']);
    const parent = await createAdult(sql, 'parent');
    await createChild(sql, parent);
    const rows = (await listAccounts(sql, adminId)) ?? [];
    expect(rows.every((r) => r.role === 'parent' || r.role === 'teacher')).toBe(true);
    expect(rows.find((r) => r.id === parent)?.detail).toBe('1 child');
    const [student] = await sql<Array<{ display_name: string }>>`
      SELECT display_name FROM accounts WHERE role = 'student' LIMIT 1`;
    const display_name = student!.display_name;
    expect(JSON.stringify(rows)).not.toContain(display_name);
  });

  it('creates a parent or a teacher who sets their own password; teachers still need approval', async () => {
    const { adminId } = await admin(['accounts']);
    const p = email('newparent');
    const r = await createAccount(sql, adminId, { role: 'parent', name: 'New Parent', email: p, baseUrl: BASE }, T0);
    expect(r.ok).toBe(true);
    expect((await lastMail(p))?.template).toBe('account_created_set_password');
    const t = email('newteacher');
    const rt = await createAccount(sql, adminId, { role: 'teacher', name: 'New Teacher', email: t, baseUrl: BASE }, T0);
    if (!rt.ok) throw new Error(rt.reason);
    const [row] =
      await sql`SELECT a.status, p.origin FROM accounts a JOIN teacher_profiles p ON p.account_id = a.id WHERE a.id = ${rt.accountId}`;
    expect(row).toMatchObject({ status: 'pending_approval', origin: 'admin_created' });
    expect(await createAccount(sql, adminId, { role: 'parent', name: 'Dup', email: p, baseUrl: BASE })).toEqual({
      ok: false,
      reason: 'email_taken',
    });
    expect(
      await createAccount(sql, adminId, { role: 'admin', name: 'Sneaky', email: email('s'), baseUrl: BASE }),
    ).toEqual({
      ok: false,
      reason: 'invalid_role',
    });
  });

  it('an email change tells the old address; the audit log records field names only', async () => {
    const { adminId } = await admin(['accounts']);
    const parent = await createAdult(sql, 'parent');
    const [current] = await sql<Array<{ email: string }>>`SELECT email FROM accounts WHERE id = ${parent}`;
    const old = current!.email;
    const fresh = email('moved');
    expect(await updateAccount(sql, adminId, parent, { name: 'Renamed Parent', email: fresh }, T0)).toEqual({
      ok: true,
    });
    expect((await lastMail(old))?.template).toBe('account_email_changed');
    const [event] = await sql<Array<{ details: Record<string, string> }>>`
      SELECT details FROM audit_events WHERE subject_id = ${parent} AND event_type = 'ACCOUNT_UPDATED'`;
    expect(event!.details).toEqual({ changed: 'name,email' });
    expect(JSON.stringify(event)).not.toContain(fresh);
  });

  it('deactivating needs a reason and signs the person out; reactivating restores the right status', async () => {
    const { adminId } = await admin(['accounts']);
    const teacher = await pendingTeacher();
    const s = await createSession(sql, { id: teacher, role: 'teacher', credential_version: 1 }, T0);
    expect(await setAccountActive(sql, adminId, teacher, { active: false, reason: '' })).toEqual({
      ok: false,
      reason: 'reason_required',
    });
    expect(await setAccountActive(sql, adminId, teacher, { active: false, reason: 'Test reason' }, T0)).toEqual({
      ok: true,
    });
    expect(await loadSession(sql, s.token, T0)).toBeNull();
    expect(await setAccountActive(sql, adminId, teacher, { active: true, reason: '' }, T0)).toEqual({ ok: true });
    const [row] = await sql`SELECT status FROM accounts WHERE id = ${teacher}`;
    expect(row!.status).toBe('pending_approval');
  });

  it('cannot touch children, Admins or the Super Admin from the accounts tools', async () => {
    const { owner, adminId } = await admin(['accounts']);
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    for (const id of [child, owner, adminId]) {
      expect(await setAccountActive(sql, adminId, id, { active: false, reason: 'Nope nope' })).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await updateAccount(sql, adminId, id, { name: 'X', email: email('x') })).toEqual({
        ok: false,
        reason: 'not_found',
      });
    }
  });
});

describe('Teacher approvals (M-29)', () => {
  it('an Admin with the permission approves; the teacher becomes active and is emailed', async () => {
    const { adminId } = await admin(['teacher_approvals']);
    const teacher = await pendingTeacher();
    expect((await listPendingTeachers(sql, adminId))?.map((t) => t.id)).toContain(teacher);
    expect(await decideTeacher(sql, adminId, teacher, { decision: 'approve', note: '', baseUrl: BASE })).toEqual({
      ok: false,
      reason: 'note_required',
    });
    expect(
      await decideTeacher(sql, adminId, teacher, { decision: 'approve', note: 'Checked', baseUrl: BASE }, T0),
    ).toEqual({
      ok: true,
    });
    const [row] =
      await sql`SELECT a.status, p.approval_status, p.decided_by FROM accounts a JOIN teacher_profiles p ON p.account_id = a.id WHERE a.id = ${teacher}`;
    expect(row).toMatchObject({ status: 'active', approval_status: 'approved', decided_by: adminId });
    // Decided once only.
    expect(await decideTeacher(sql, adminId, teacher, { decision: 'reject', note: 'Again', baseUrl: BASE })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('reject and request changes keep the teacher out of the portal', async () => {
    const owner = await createAdult(sql, 'superadmin');
    for (const decision of ['reject', 'changes'] as const) {
      const teacher = await pendingTeacher();
      expect((await decideTeacher(sql, owner, teacher, { decision, note: 'Because', baseUrl: BASE }, T0)).ok).toBe(
        true,
      );
      const [row] = await sql`SELECT status FROM accounts WHERE id = ${teacher}`;
      expect(row!.status).toBe('pending_approval');
    }
  });

  it('an Admin without the permission, or a parent, cannot decide', async () => {
    const { adminId } = await admin(['accounts']);
    const parent = await createAdult(sql, 'parent');
    const teacher = await pendingTeacher();
    for (const actor of [adminId, parent]) {
      expect(await decideTeacher(sql, actor, teacher, { decision: 'approve', note: 'Sure', baseUrl: BASE })).toEqual({
        ok: false,
        reason: 'denied',
      });
    }
  });
});

describe('Audit log (M-30)', () => {
  it('shows children only as an account number, never a name', async () => {
    const { adminId } = await admin(['audit_log']);
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    await sql`UPDATE accounts SET display_name = ${`Secret${uniq()}`} WHERE id = ${child}`;
    await sql`INSERT INTO audit_events (event_type, outcome, actor_id, subject_id) VALUES ('CHILD_LOGIN_SUCCEEDED', 'success', ${child}, ${child})`;
    const rows = (await listAuditEvents(sql, adminId, { type: 'CHILD_LOGIN_SUCCEEDED' })) ?? [];
    const row = rows.find((r) => r.record.includes(child.slice(0, 6)));
    expect(row?.record).toBe(`Child account #${child.slice(0, 6)}`);
    expect(JSON.stringify(rows)).not.toContain('Secret');
  });

  it('is read-only in the database', async () => {
    await expect(sql`UPDATE audit_events SET outcome = 'success'`).rejects.toThrow(/append-only/);
  });
});
