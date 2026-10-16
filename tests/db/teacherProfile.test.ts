import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAdmin,
  decideProfileChange,
  decideTeacher,
  listPendingTeachers,
  listProfileChanges,
  setAccountActive,
} from '@/server/admin';
import { createSession, loadSession } from '@/server/auth/sessions';
import { createChild, recordChildConsents, signInChild } from '@/server/children';
import { getTeacherProfile, saveTeacherProfile, type TeacherProfileInput } from '@/server/teacherProfile';
import { createAdult, testDb, uniq } from './helpers';

/** PR1: teacher profile (M-20, M-22), approval gating (OC-38, OC-71), re-review (OC-73), OC-72. */
const sql = testDb();
const T0 = new Date('2026-10-16T08:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const BASE = 'http://aa.test';
// Sample phrase for tests only (not a real secret).
const CHILD_PHRASE = ['kite', 'river', 'mango'].join('-');
const ip = () => `203.0.113.${Math.floor(Math.random() * 250)}`;

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

const BIO = 'I have taught science to primary classes for eight years.';
const profile = (over: Partial<TeacherProfileInput> = {}): TeacherProfileInput => ({
  name: 'Teacher A. Rao',
  timeZone: 'Asia/Singapore',
  subjects: ['science'],
  grades: [4, 5],
  bio: BIO,
  acceptTerms: true,
  ...over,
});

async function teacher(
  origin: 'self_registered' | 'parent_added' | 'admin_created' = 'self_registered',
  approval = 'draft',
) {
  const approved = approval === 'approved';
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', ${approved ? 'active' : 'pending_approval'}, ${`teacher-${uniq()}@example.com`}, 'Teacher New', 'x')
    RETURNING id`;
  const parent = origin === 'parent_added' ? await createAdult(sql, 'parent') : null;
  const owner = await createAdult(sql, 'superadmin');
  const decided = ['approved', 'changes_requested', 'rejected'].includes(approval);
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, added_by_parent_id, approval_status, subjects, grades, bio,
                                  decided_by, decided_at, decision_note)
    VALUES (${row!.id}, ${origin}, ${parent}, ${approval},
            ${approved ? ['science'] : []}, ${approved ? [4, 5] : []}, ${approved ? BIO : null},
            ${decided ? owner : null}, ${decided ? T0 : null}, ${decided ? 'Please add your grades.' : null})`;
  return row!.id;
}

async function approver(permissions = ['teacher_approvals']) {
  const owner = await createAdult(sql, 'superadmin');
  const r = await createAdmin(
    sql,
    owner,
    { name: 'Approver', email: `approver-${uniq()}@example.com`, permissions, baseUrl: BASE },
    T0,
  );
  if (!r.ok) throw new Error(r.reason);
  return r.adminId;
}

async function auditTypes(subjectId: string) {
  const rows = await sql<{ event_type: string }[]>`
    SELECT event_type FROM audit_events WHERE subject_id = ${subjectId} ORDER BY occurred_at, id`;
  return rows.map((r) => r.event_type);
}

async function lastMail(teacherId: string) {
  const [row] = await sql<Array<{ template: string }>>`
    SELECT o.template FROM email_outbox o JOIN accounts a ON a.email = o.to_address
    WHERE a.id = ${teacherId} ORDER BY o.created_at DESC, o.id DESC LIMIT 1`;
  return row?.template;
}

describe('M-20 before approval', () => {
  it('saves a draft with empty subjects; sending needs every field and the terms', async () => {
    const id = await teacher();
    expect(
      await saveTeacherProfile(
        sql,
        id,
        profile({ subjects: [], grades: [], bio: '', acceptTerms: false }),
        'draft',
        T0,
      ),
    ).toEqual({ ok: true, outcome: 'draft_saved' });
    expect((await getTeacherProfile(sql, id))?.approvalStatus).toBe('draft');

    const r = await saveTeacherProfile(
      sql,
      id,
      profile({ subjects: [], grades: [], bio: 'Short', acceptTerms: false }),
      'submit',
      T0,
    );
    expect(r).toEqual({ ok: false, reason: 'invalid', problems: ['subjects', 'grades', 'bio', 'terms'] });
    expect((await getTeacherProfile(sql, id))?.approvalStatus).toBe('draft');
  });

  it('refuses unknown subjects, grades, time zones and over-long text', async () => {
    const id = await teacher();
    const r = await saveTeacherProfile(
      sql,
      id,
      profile({ name: 'x', subjects: ['astrology'], grades: [13], timeZone: 'Mars/Base', bio: 'a'.repeat(1001) }),
      'draft',
      T0,
    );
    expect(r).toEqual({ ok: false, reason: 'invalid', problems: ['name', 'time_zone', 'subjects', 'grades', 'bio'] });
  });

  it('sending records the terms, the time and an audit event; the name and time zone are saved', async () => {
    const id = await teacher();
    expect(await saveTeacherProfile(sql, id, profile(), 'submit', T0)).toEqual({ ok: true, outcome: 'submitted' });
    const p = await getTeacherProfile(sql, id);
    expect(p).toMatchObject({
      name: 'Teacher A. Rao',
      timeZone: 'Asia/Singapore',
      subjects: ['science'],
      grades: [4, 5],
      approvalStatus: 'submitted',
      termsAccepted: true,
    });
    expect(p?.submittedAt?.toISOString()).toBe(T0.toISOString());
    const [consent] = await sql`SELECT version FROM consents WHERE account_id = ${id} AND kind = 'teacher_terms'`;
    expect(consent?.version).toMatch(/^teacher-terms-draft-/);
    expect(await auditTypes(id)).toContain('TEACHER_PROFILE_SUBMITTED');
  });

  it('a sent profile can still be corrected; it stays in the queue at its place', async () => {
    const id = await teacher();
    await saveTeacherProfile(sql, id, profile(), 'submit', T0);
    expect(await saveTeacherProfile(sql, id, profile({ grades: [3, 4, 5] }), 'draft', at(5))).toEqual({
      ok: true,
      outcome: 'updated_in_queue',
    });
    const p = await getTeacherProfile(sql, id);
    expect(p).toMatchObject({ approvalStatus: 'submitted', grades: [3, 4, 5] });
    expect(p?.submittedAt?.toISOString()).toBe(T0.toISOString());
    // Still complete: a sent profile cannot be emptied.
    expect(await saveTeacherProfile(sql, id, profile({ subjects: [] }), 'draft', at(6))).toMatchObject({
      ok: false,
      problems: ['subjects'],
    });
  });

  it('after "changes requested" the teacher edits and sends again without accepting the terms twice', async () => {
    const id = await teacher('self_registered', 'changes_requested');
    await sql`INSERT INTO consents (account_id, kind, version) VALUES (${id}, 'teacher_terms', 'teacher-terms-draft-2026-10-16')`;
    expect(await saveTeacherProfile(sql, id, profile({ acceptTerms: false }), 'submit', T0)).toEqual({
      ok: true,
      outcome: 'submitted',
    });
    expect((await getTeacherProfile(sql, id))?.approvalStatus).toBe('submitted');
  });

  it('a rejected teacher, a parent or an unknown id cannot save anything (OC-72)', async () => {
    const rejected = await teacher('self_registered', 'rejected');
    const parent = await createAdult(sql, 'parent');
    for (const id of [rejected, parent, '00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      expect(await saveTeacherProfile(sql, id, profile(), 'submit', T0)).toEqual({ ok: false, reason: 'not_allowed' });
    }
    expect((await getTeacherProfile(sql, rejected))?.approvalStatus).toBe('rejected');
  });
});

describe('approval gating (OC-38, OC-71)', () => {
  it('a self-registered teacher cannot be approved or sent back before sending; can be rejected', async () => {
    const adminId = await approver();
    const id = await teacher();
    const listed = (await listPendingTeachers(sql, adminId))?.find((t) => t.id === id);
    expect(listed).toMatchObject({ canApprove: false, canRequestChanges: false, approvalStatus: 'draft' });
    for (const decision of ['approve', 'changes'] as const) {
      expect(await decideTeacher(sql, adminId, id, { decision, note: 'Looks fine', baseUrl: BASE }, T0)).toEqual({
        ok: false,
        reason: 'not_ready',
      });
    }
    await saveTeacherProfile(sql, id, profile(), 'submit', T0);
    expect((await listPendingTeachers(sql, adminId))?.find((t) => t.id === id)).toMatchObject({
      canApprove: true,
      canRequestChanges: true,
    });
    expect(
      (await decideTeacher(sql, adminId, id, { decision: 'approve', note: 'Checked', baseUrl: BASE }, T0)).ok,
    ).toBe(true);

    const other = await teacher();
    expect((await decideTeacher(sql, adminId, other, { decision: 'reject', note: 'Spam', baseUrl: BASE }, T0)).ok).toBe(
      true,
    );
  });

  it('an admin-created teacher also needs to send first', async () => {
    const adminId = await approver();
    const id = await teacher('admin_created');
    expect(await decideTeacher(sql, adminId, id, { decision: 'approve', note: 'Checked', baseUrl: BASE }, T0)).toEqual({
      ok: false,
      reason: 'not_ready',
    });
  });

  it('a parent-added teacher may be approved from draft, but never sent back for changes', async () => {
    const adminId = await approver();
    const id = await teacher('parent_added');
    expect((await listPendingTeachers(sql, adminId))?.find((t) => t.id === id)).toMatchObject({
      canApprove: true,
      canRequestChanges: false,
    });
    expect(await decideTeacher(sql, adminId, id, { decision: 'changes', note: 'More', baseUrl: BASE }, T0)).toEqual({
      ok: false,
      reason: 'not_ready',
    });
    expect(
      (await decideTeacher(sql, adminId, id, { decision: 'approve', note: 'Checked', baseUrl: BASE }, T0)).ok,
    ).toBe(true);
  });
});

describe('M-22 after approval (OC-73)', () => {
  it('name, bio and time zone save at once', async () => {
    const id = await teacher('self_registered', 'approved');
    expect(
      await saveTeacherProfile(
        sql,
        id,
        profile({ name: 'Ms A. Rao', bio: `${BIO} Now also tutoring online.`, acceptTerms: false }),
        'draft',
        T0,
      ),
    ).toEqual({ ok: true, outcome: 'saved' });
    expect(await getTeacherProfile(sql, id)).toMatchObject({
      name: 'Ms A. Rao',
      bio: `${BIO} Now also tutoring online.`,
      pendingChange: null,
    });
    expect(await auditTypes(id)).toContain('TEACHER_PROFILE_UPDATED');
  });

  it('a subject or grade change waits for review; the teacher keeps the approved values and access', async () => {
    const id = await teacher('self_registered', 'approved');
    expect(
      await saveTeacherProfile(sql, id, profile({ subjects: ['maths', 'science'], grades: [4, 5, 6] }), 'submit', T0),
    ).toEqual({ ok: true, outcome: 'saved_change_pending' });
    const p = await getTeacherProfile(sql, id);
    expect(p).toMatchObject({
      approvalStatus: 'approved',
      subjects: ['science'],
      grades: [4, 5],
      pendingChange: { subjects: ['maths', 'science'], grades: [4, 5, 6] },
    });
    const [account] = await sql`SELECT status FROM accounts WHERE id = ${id}`;
    expect(account!.status).toBe('active');
    expect(await auditTypes(id)).toContain('TEACHER_PROFILE_CHANGE_SUBMITTED');

    // Saving the same change again keeps its place in the queue.
    await saveTeacherProfile(sql, id, profile({ subjects: ['science', 'maths'], grades: [6, 5, 4] }), 'submit', at(10));
    expect((await getTeacherProfile(sql, id))?.pendingChange?.submittedAt.toISOString()).toBe(T0.toISOString());

    // Going back to the approved values withdraws the change.
    expect(await saveTeacherProfile(sql, id, profile(), 'submit', at(20))).toEqual({
      ok: true,
      outcome: 'saved_change_withdrawn',
    });
    expect((await getTeacherProfile(sql, id))?.pendingChange).toBeNull();
  });

  it('an approver accepts or declines the change; the teacher is emailed and sees the note', async () => {
    const adminId = await approver();
    const accepted = await teacher('self_registered', 'approved');
    const declined = await teacher('self_registered', 'approved');
    for (const id of [accepted, declined]) {
      await saveTeacherProfile(sql, id, profile({ subjects: ['maths'] }), 'submit', T0);
    }
    const queue = (await listProfileChanges(sql, adminId))?.map((c) => c.id);
    expect(queue).toEqual(expect.arrayContaining([accepted, declined]));

    expect(
      await decideProfileChange(sql, adminId, accepted, { decision: 'approve', note: '', baseUrl: BASE }, T0),
    ).toEqual({ ok: false, reason: 'note_required' });
    expect(
      (await decideProfileChange(sql, adminId, accepted, { decision: 'approve', note: 'Fine', baseUrl: BASE }, T0)).ok,
    ).toBe(true);
    expect(
      (
        await decideProfileChange(
          sql,
          adminId,
          declined,
          { decision: 'decline', note: 'Please keep science', baseUrl: BASE },
          T0,
        )
      ).ok,
    ).toBe(true);

    expect(await getTeacherProfile(sql, accepted)).toMatchObject({
      subjects: ['maths'],
      pendingChange: null,
      lastChange: { decision: 'approved', note: 'Fine' },
    });
    expect(await getTeacherProfile(sql, declined)).toMatchObject({
      subjects: ['science'],
      pendingChange: null,
      lastChange: { decision: 'declined', note: 'Please keep science' },
    });
    expect(await lastMail(accepted)).toBe('teacher_profile_change_approved');
    expect(await lastMail(declined)).toBe('teacher_profile_change_declined');
    expect(await auditTypes(accepted)).toContain('TEACHER_PROFILE_CHANGE_DECISION');
    // Decided once only.
    expect(
      await decideProfileChange(sql, adminId, accepted, { decision: 'decline', note: 'Again', baseUrl: BASE }, T0),
    ).toEqual({ ok: false, reason: 'not_found' });
  });

  it('only an approver with the permission can decide a change', async () => {
    const id = await teacher('self_registered', 'approved');
    await saveTeacherProfile(sql, id, profile({ grades: [6] }), 'submit', T0);
    const noPermission = await approver(['accounts']);
    const parent = await createAdult(sql, 'parent');
    for (const actor of [noPermission, parent, id]) {
      expect(await listProfileChanges(sql, actor)).toBeNull();
      expect(
        await decideProfileChange(sql, actor, id, { decision: 'approve', note: 'Sure', baseUrl: BASE }, T0),
      ).toEqual({ ok: false, reason: 'denied' });
    }
    expect((await getTeacherProfile(sql, id))?.grades).toEqual([4, 5]);
  });

  it('the database refuses a waiting change on a profile that is not approved', async () => {
    const id = await teacher();
    await expect(
      sql`UPDATE teacher_profiles SET pending_subjects = ${['maths']}, pending_grades = ${[5]}, change_submitted_at = now()
          WHERE account_id = ${id}`,
    ).rejects.toThrow(/teacher_profiles_pending_change/);
  });
});

describe('OC-72: children of a deactivated parent', () => {
  async function family() {
    const parentId = await createAdult(sql, 'parent');
    await recordChildConsents(sql, parentId, { guardian: true, aiTutor: true, emailReminders: false }, T0);
    const r = await createChild(
      sql,
      parentId,
      {
        name: 'Kiran',
        grade: 5,
        curriculum: 'CBSE',
        timeZone: 'Asia/Kolkata',
        subjects: ['maths'],
        avatar: 'star',
        username: `kid${uniq()}`,
        password: CHILD_PHRASE,
      },
      T0,
    );
    if (!r.ok) throw new Error(r.reason);
    return { parentId, childId: r.childId, username: r.username };
  }

  it('signs the child out and keeps them out until the parent is reactivated', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const { parentId, childId, username } = await family();
    const now = new Date();
    const session = await createSession(sql, { id: childId, role: 'student', credential_version: 1 }, now);
    expect(await loadSession(sql, session.token, now)).not.toBeNull();

    expect(await setAccountActive(sql, owner, parentId, { active: false, reason: 'Test of OC-72' }, now)).toEqual({
      ok: true,
    });
    expect(await loadSession(sql, session.token, now)).toBeNull();
    const [revoked] = await sql`SELECT revoked_at FROM sessions WHERE account_id = ${childId}`;
    expect(revoked!.revoked_at).not.toBeNull();
    expect(await signInChild(sql, { username, password: CHILD_PHRASE, ip: ip() }, now)).toEqual({
      ok: false,
      reason: 'paused',
    });
    expect(await auditTypes(childId)).toContain('CHILD_LOGIN_FAILED');

    expect(await setAccountActive(sql, owner, parentId, { active: true, reason: '' }, now)).toEqual({ ok: true });
    expect(await signInChild(sql, { username, password: CHILD_PHRASE, ip: ip() }, now)).toMatchObject({ ok: true });
  });

  it('a child session made while the parent is inactive is refused too', async () => {
    const { parentId, childId } = await family();
    await sql`UPDATE accounts SET status = 'deactivated', status_reason = 'Test' WHERE id = ${parentId}`;
    const now = new Date();
    const session = await createSession(sql, { id: childId, role: 'student', credential_version: 1 }, now);
    expect(await loadSession(sql, session.token, now)).toBeNull();
  });

  it('a child with another active parent keeps their access', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const { parentId, childId, username } = await family();
    const second = await createAdult(sql, 'parent');
    await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${second}, ${childId})`;
    const now = new Date();
    const session = await createSession(sql, { id: childId, role: 'student', credential_version: 1 }, now);
    await setAccountActive(sql, owner, parentId, { active: false, reason: 'Test of OC-72' }, now);
    expect(await loadSession(sql, session.token, now)).not.toBeNull();
    expect(await signInChild(sql, { username, password: CHILD_PHRASE, ip: ip() }, now)).toMatchObject({ ok: true });
  });
});
