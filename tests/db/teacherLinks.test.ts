import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decideProfileChange, decideTeacher } from '@/server/admin';
import { saveTeacherProfile } from '@/server/teacherProfile';
import {
  acceptLinkRequest,
  addTeacher,
  listLinkedStudents,
  listLinkRequests,
  listMyTeachers,
  NEW_TEACHERS_PER_DAY,
  removeTeacher,
  teacherMaySee,
  updateTeacherLinks,
} from '@/server/teacherLinks';
import { createAdult, createChild, testDb, uniq } from './helpers';

/** PR2: parent–teacher linking (boards 57, 58, M-25; OC-36, OC-41, OC-62, OC-72). */
const sql = testDb();
const T0 = new Date('2026-10-16T10:00:00Z');
const BASE = 'http://aa.test';

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

const email = (tag: string) => `${tag}-${uniq()}@example.com`;

/** A parent with two children: maths+science+english, and science+hindi. */
async function family() {
  const parent = await createAdult(sql, 'parent');
  const kiran = await createChild(sql, parent);
  const meera = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science', 'english']} WHERE account_id = ${kiran}`;
  await sql`UPDATE student_profiles SET subjects = ${['science', 'hindi']} WHERE account_id = ${meera}`;
  return { parent, kiran, meera };
}

/** An approved, active teacher. */
async function approvedTeacher(subjects: string[] = ['science', 'maths']) {
  const address = email('teacher');
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${address}, 'Teacher A. Rao', 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', 'approved', ${subjects}, ${[4, 5]}, ${owner}, now())`;
  return { id: row!.id, email: address };
}

/** The teacher fills in and sends their profile (M-20). */
async function sendProfile(teacherId: string, subjects: string[]) {
  const r = await saveTeacherProfile(
    sql,
    teacherId,
    {
      name: 'Teacher New',
      timeZone: 'Asia/Kolkata',
      subjects,
      grades: [5],
      bio: 'Primary teacher for many years.',
      curricula: [],
      experienceYears: null,
      acceptTerms: true,
    },
    'submit',
    T0,
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
}

/** The teacher accepts every waiting request (CR-12): links start only then. */
async function acceptAll(teacherId: string) {
  for (const r of await listLinkRequests(sql, teacherId, T0)) {
    const a = await acceptLinkRequest(sql, teacherId, r.id, BASE, T0);
    if (!a.ok) throw new Error(JSON.stringify(a));
  }
}

async function lastTemplate(to: string) {
  const [row] = await sql<{ template: string }[]>`
    SELECT template FROM email_outbox WHERE to_address = ${to} ORDER BY created_at DESC, id DESC LIMIT 1`;
  return row?.template;
}

describe('adding a teacher (board 58)', () => {
  it('an approved teacher gets a request per child, and is linked for those subjects only on accepting', async () => {
    const { parent, kiran, meera } = await family();
    const t = await approvedTeacher();
    const r = await addTeacher(
      sql,
      parent,
      {
        name: 'Rao',
        email: t.email.toUpperCase(),
        children: [{ childId: kiran, subjects: ['science'] }],
        baseUrl: BASE,
      },
      T0,
    );
    expect(r).toMatchObject({ ok: true, outcome: 'sent', teacherName: 'Teacher A. Rao' });
    expect(await teacherMaySee(sql, t.id, kiran)).toBe(false);
    expect(await lastTemplate(t.email)).toBe('teacher_link_request');
    await acceptAll(t.id);
    expect(await teacherMaySee(sql, t.id, kiran)).toBe(true);
    expect(await teacherMaySee(sql, t.id, kiran, 'science')).toBe(true);
    expect(await teacherMaySee(sql, t.id, kiran, 'maths')).toBe(false);
    expect(await teacherMaySee(sql, t.id, meera)).toBe(false);
    expect((await listLinkedStudents(sql, t.id)).map((s) => [s.id, s.subjects])).toEqual([[kiran, ['science']]]);
    const [mine] = await listMyTeachers(sql, parent);
    expect(mine).toMatchObject({ id: t.id, state: 'active', teaches: ['science', 'maths'] });
  });

  it('a new email creates a parent-added teacher who waits; links start only on approval', async () => {
    const { parent, kiran } = await family();
    const address = email('new');
    const r = await addTeacher(
      sql,
      parent,
      { name: 'Teacher H. Kapoor', email: address, children: [{ childId: kiran, subjects: ['maths'] }], baseUrl: BASE },
      T0,
    );
    expect(r).toMatchObject({ ok: true, outcome: 'waiting_approval' });
    const [teacher] = await sql<{ id: string; status: string; password_hash: string | null }[]>`
      SELECT id, status, password_hash FROM accounts WHERE email = ${address}`;
    expect(teacher).toMatchObject({ status: 'pending_approval', password_hash: null });
    expect(await lastTemplate(address)).toBe('teacher_added_by_parent');
    expect(await teacherMaySee(sql, teacher!.id, kiran)).toBe(false);
    expect((await listMyTeachers(sql, parent))[0]).toMatchObject({ state: 'waiting' });

    // OC-75: not approvable until the teacher sends a completed profile.
    const owner = await createAdult(sql, 'superadmin');
    expect(
      await decideTeacher(sql, owner, teacher!.id, { decision: 'approve', note: 'Checked', baseUrl: BASE }, T0),
    ).toEqual({
      ok: false,
      reason: 'not_ready',
    });
    await sendProfile(teacher!.id, ['maths']);
    expect(
      (await decideTeacher(sql, owner, teacher!.id, { decision: 'approve', note: 'Checked', baseUrl: BASE }, T0)).ok,
    ).toBe(true);
    // Reading A (OC-101): approval sends the request to the teacher; nothing starts by itself.
    expect(await teacherMaySee(sql, teacher!.id, kiran, 'maths')).toBe(false);
    const sentTo = await sql<{ template: string }[]>`SELECT template FROM email_outbox WHERE to_address = ${address}`;
    expect(sentTo.map((m) => m.template)).toEqual(
      expect.arrayContaining(['teacher_approved_set_password', 'teacher_link_request']),
    );
    await acceptAll(teacher!.id);
    expect(await teacherMaySee(sql, teacher!.id, kiran, 'maths')).toBe(true);
    const [parentRow] = await sql<{ email: string }[]>`SELECT email FROM accounts WHERE id = ${parent}`;
    const toParent = await sql<
      { template: string }[]
    >`SELECT template FROM email_outbox WHERE to_address = ${parentRow!.email}`;
    expect(toParent.map((m) => m.template)).toEqual(
      expect.arrayContaining(['parent_teacher_approved', 'parent_link_request_accepted']),
    );
  });

  it('a rejected teacher gives no access; the parent is told and sees "Not approved"', async () => {
    const { parent, kiran } = await family();
    const address = email('rej');
    await addTeacher(
      sql,
      parent,
      { name: 'Teacher J. Singh', email: address, children: [{ childId: kiran, subjects: ['maths'] }], baseUrl: BASE },
      T0,
    );
    const [teacher] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE email = ${address}`;
    const owner = await createAdult(sql, 'superadmin');
    await decideTeacher(sql, owner, teacher!.id, { decision: 'reject', note: 'Could not verify', baseUrl: BASE }, T0);
    expect(await teacherMaySee(sql, teacher!.id, kiran)).toBe(false);
    expect((await listMyTeachers(sql, parent))[0]).toMatchObject({ state: 'not_approved' });
    const [parentRow] = await sql<{ email: string }[]>`SELECT email FROM accounts WHERE id = ${parent}`;
    expect(await lastTemplate(parentRow!.email)).toBe('parent_teacher_not_approved');
    // A rejected teacher cannot be added again.
    expect(
      await addTeacher(
        sql,
        parent,
        { name: 'Again', email: address, children: [{ childId: kiran, subjects: ['maths'] }], baseUrl: BASE },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'cannot_add' });
  });

  it('refuses another family’s child, subjects the child does not study, and empty choices', async () => {
    const { parent, kiran } = await family();
    const other = await family();
    const t = await approvedTeacher();
    const add = (children: Array<{ childId: string; subjects: string[] }>) =>
      addTeacher(sql, parent, { name: 'Rao', email: t.email, children, baseUrl: BASE }, T0);
    expect(await add([{ childId: other.kiran, subjects: ['science'] }])).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await add([{ childId: kiran, subjects: ['hindi'] }])).toEqual({ ok: false, reason: 'subjects' });
    expect(await add([{ childId: kiran, subjects: ['astrology'] }])).toEqual({ ok: false, reason: 'subjects' });
    expect(await add([{ childId: kiran, subjects: [] }])).toEqual({ ok: false, reason: 'choose' });
    expect(await teacherMaySee(sql, t.id, other.kiran)).toBe(false);
    expect(await teacherMaySee(sql, t.id, kiran)).toBe(false);
  });

  it('a parent, admin or child email gets the same neutral answer and nothing is created', async () => {
    const { parent, kiran } = await family();
    const otherParent = await createAdult(sql, 'parent');
    const [row] = await sql<{ email: string }[]>`SELECT email FROM accounts WHERE id = ${otherParent}`;
    expect(
      await addTeacher(
        sql,
        parent,
        { name: 'Someone', email: row!.email, children: [{ childId: kiran, subjects: ['maths'] }], baseUrl: BASE },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'cannot_add' });
    const [links] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM teacher_student_links WHERE student_id = ${kiran}`;
    expect(links?.count).toBe(0);
  });

  it('a student, a teacher or a deactivated parent cannot add teachers', async () => {
    const { parent, kiran } = await family();
    const t = await approvedTeacher();
    const input = { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science'] }], baseUrl: BASE };
    for (const actor of [kiran, t.id]) {
      expect(await addTeacher(sql, actor, input, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    }
    await sql`UPDATE accounts SET status = 'deactivated', status_reason = 'Test' WHERE id = ${parent}`;
    expect(await addTeacher(sql, parent, input, T0)).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it(`limits new teacher accounts to ${NEW_TEACHERS_PER_DAY} a day per parent`, async () => {
    const { parent, kiran } = await family();
    for (let i = 0; i < NEW_TEACHERS_PER_DAY; i++) {
      const r = await addTeacher(
        sql,
        parent,
        {
          name: `Teacher ${i}`,
          email: email(`bulk${i}`),
          children: [{ childId: kiran, subjects: ['maths'] }],
          baseUrl: BASE,
        },
        T0,
      );
      expect(r.ok).toBe(true);
    }
    expect(
      await addTeacher(
        sql,
        parent,
        { name: 'One more', email: email('bulk'), children: [{ childId: kiran, subjects: ['maths'] }], baseUrl: BASE },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'too_many' });
  });
});

describe('changing and removing links (board 57)', () => {
  it('unticking a subject or a child ends access at once; adding a child sends a request for it', async () => {
    const { parent, kiran, meera } = await family();
    const t = await approvedTeacher();
    await addTeacher(
      sql,
      parent,
      { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science', 'maths'] }], baseUrl: BASE },
      T0,
    );
    await acceptAll(t.id);
    expect(
      await updateTeacherLinks(
        sql,
        parent,
        t.id,
        [
          { childId: kiran, subjects: ['science'] },
          { childId: meera, subjects: ['science'] },
        ],
        T0,
      ),
    ).toEqual({ ok: true, removed: false, requested: 1 });
    expect(await teacherMaySee(sql, t.id, kiran, 'maths')).toBe(false);
    expect(await teacherMaySee(sql, t.id, kiran, 'science')).toBe(true);
    expect(await teacherMaySee(sql, t.id, meera, 'science')).toBe(false);
    await acceptAll(t.id);
    expect(await teacherMaySee(sql, t.id, meera, 'science')).toBe(true);

    expect(await updateTeacherLinks(sql, parent, t.id, [{ childId: meera, subjects: ['science'] }], T0)).toEqual({
      ok: true,
      removed: false,
      requested: 0,
    });
    expect(await teacherMaySee(sql, t.id, kiran)).toBe(false);

    expect(await updateTeacherLinks(sql, parent, t.id, [], T0)).toEqual({ ok: true, removed: true, requested: 0 });
    expect(await teacherMaySee(sql, t.id, meera)).toBe(false);
    expect(await listMyTeachers(sql, parent)).toEqual([]);
  });

  it('another parent cannot change or remove links to children that are not theirs', async () => {
    const { parent, kiran } = await family();
    const stranger = await family();
    const t = await approvedTeacher();
    await addTeacher(
      sql,
      parent,
      { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science'] }], baseUrl: BASE },
      T0,
    );
    await acceptAll(t.id);
    expect(await removeTeacher(sql, stranger.parent, t.id)).toEqual({ ok: false, reason: 'not_found' });
    expect(
      await updateTeacherLinks(sql, stranger.parent, t.id, [{ childId: kiran, subjects: ['maths'] }]),
    ).toMatchObject({ ok: false });
    expect(await teacherMaySee(sql, t.id, kiran, 'science')).toBe(true);
    expect(await listMyTeachers(sql, stranger.parent)).toEqual([]);
  });

  it('cancelling a request for a new teacher withdraws it from the approval queue; it can be made again', async () => {
    const { parent, kiran } = await family();
    const address = email('cancel');
    await addTeacher(
      sql,
      parent,
      { name: 'Teacher C', email: address, children: [{ childId: kiran, subjects: ['maths'] }], baseUrl: BASE },
      T0,
    );
    const [teacher] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE email = ${address}`;
    expect(await removeTeacher(sql, parent, teacher!.id)).toEqual({ ok: true });
    const [row] = await sql<{ status: string }[]>`SELECT status FROM accounts WHERE id = ${teacher!.id}`;
    expect(row!.status).toBe('deactivated');
    expect(
      await addTeacher(
        sql,
        parent,
        { name: 'Teacher C', email: address, children: [{ childId: kiran, subjects: ['maths'] }], baseUrl: BASE },
        T0,
      ),
    ).toMatchObject({ ok: true, outcome: 'waiting_approval' });
  });
});

describe('the shared access check', () => {
  it('a teacher who is not approved or not active sees nobody, even with a link', async () => {
    const { parent, kiran } = await family();
    const t = await approvedTeacher();
    await addTeacher(
      sql,
      parent,
      { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science'] }], baseUrl: BASE },
      T0,
    );
    await acceptAll(t.id);
    await sql`UPDATE accounts SET status = 'deactivated', status_reason = 'Test' WHERE id = ${t.id}`;
    expect(await teacherMaySee(sql, t.id, kiran)).toBe(false);
    expect(await listLinkedStudents(sql, t.id)).toEqual([]);
  });

  it('a paused child, or a child whose parent is deactivated, is hidden from the teacher (OC-72)', async () => {
    const { parent, kiran } = await family();
    const t = await approvedTeacher();
    await addTeacher(
      sql,
      parent,
      { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science'] }], baseUrl: BASE },
      T0,
    );
    await acceptAll(t.id);
    await sql`UPDATE accounts SET status = 'suspended' WHERE id = ${kiran}`;
    expect(await teacherMaySee(sql, t.id, kiran)).toBe(false);
    await sql`UPDATE accounts SET status = 'active' WHERE id = ${kiran}`;
    await sql`UPDATE accounts SET status = 'deactivated', status_reason = 'Test' WHERE id = ${parent}`;
    expect(await teacherMaySee(sql, t.id, kiran)).toBe(false);
  });

  it('a pending teacher’s own profile save does not grant access', async () => {
    const { parent, kiran } = await family();
    const address = email('pend');
    await addTeacher(
      sql,
      parent,
      { name: 'Teacher P', email: address, children: [{ childId: kiran, subjects: ['maths'] }], baseUrl: BASE },
      T0,
    );
    const [teacher] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE email = ${address}`;
    await saveTeacherProfile(
      sql,
      teacher!.id,
      {
        name: 'Teacher P',
        timeZone: 'Asia/Kolkata',
        subjects: ['maths'],
        grades: [5],
        bio: 'Maths teacher for many years.',
        curricula: [],
        experienceYears: null,
        acceptTerms: true,
      },
      'submit',
      T0,
    );
    expect(await teacherMaySee(sql, teacher!.id, kiran)).toBe(false);
    expect(await teacherMaySee(sql, teacher!.id, 'not-a-uuid')).toBe(false);
  });
});

describe('OC-75: subjects must be on the teacher’s approved profile', () => {
  it('an approved teacher can be linked only for subjects they teach; a direct attempt is refused', async () => {
    const { parent, kiran } = await family();
    const t = await approvedTeacher(['science']);
    expect(
      await addTeacher(
        sql,
        parent,
        { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science', 'maths'] }], baseUrl: BASE },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'not_taught', teacherName: 'Teacher A. Rao', teaches: ['science'] });
    await addTeacher(
      sql,
      parent,
      { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science'] }], baseUrl: BASE },
      T0,
    );
    await acceptAll(t.id);
    expect(await updateTeacherLinks(sql, parent, t.id, [{ childId: kiran, subjects: ['science', 'maths'] }])).toEqual({
      ok: false,
      reason: 'subjects',
    });
    // Bypassing the application: the database refuses too.
    await expect(
      sql`UPDATE teacher_student_links SET subjects = ${['science', 'maths']}
          WHERE teacher_id = ${t.id} AND student_id = ${kiran} AND status = 'active'`,
    ).rejects.toThrow(/approved teacher who teaches these subjects/);
    expect(await teacherMaySee(sql, t.id, kiran, 'maths')).toBe(false);
  });

  it('a pending teacher gets only saved preferences; approval starts the subjects they are approved for', async () => {
    const { parent, kiran } = await family();
    const address = email('pref');
    await addTeacher(
      sql,
      parent,
      {
        name: 'Teacher P',
        email: address,
        children: [{ childId: kiran, subjects: ['maths', 'english'] }],
        baseUrl: BASE,
      },
      T0,
    );
    const [teacher] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE email = ${address}`;
    // No active link while waiting, whatever is ticked; the database refuses one too.
    await expect(
      sql`UPDATE teacher_student_links SET status = 'active' WHERE teacher_id = ${teacher!.id}`,
    ).rejects.toThrow(/only a request waiting for the teacher can be accepted/);
    for (const s of ['maths', 'english', undefined])
      expect(await teacherMaySee(sql, teacher!.id, kiran, s)).toBe(false);

    await sendProfile(teacher!.id, ['maths', 'science']);
    const owner = await createAdult(sql, 'superadmin');
    await decideTeacher(sql, owner, teacher!.id, { decision: 'approve', note: 'Checked', baseUrl: BASE }, T0);
    expect(await teacherMaySee(sql, teacher!.id, kiran, 'maths')).toBe(false);
    const [request] = await listLinkRequests(sql, teacher!.id, T0);
    expect(request?.subjects).toEqual(['maths']);
    await acceptAll(teacher!.id);
    expect(await teacherMaySee(sql, teacher!.id, kiran, 'maths')).toBe(true);
    expect(await teacherMaySee(sql, teacher!.id, kiran, 'english')).toBe(false);
    const [parentRow] = await sql<{ email: string }[]>`SELECT email FROM accounts WHERE id = ${parent}`;
    const templates = await sql<
      { template: string }[]
    >`SELECT template FROM email_outbox WHERE to_address = ${parentRow!.email}`;
    expect(templates.map((r) => r.template)).toEqual(
      expect.arrayContaining(['parent_teacher_subjects_reduced', 'parent_teacher_approved']),
    );
  });

  it('a pending link with no subject in common ends on approval and the parent is told', async () => {
    const { parent, kiran } = await family();
    const address = email('none');
    await addTeacher(
      sql,
      parent,
      { name: 'Teacher N', email: address, children: [{ childId: kiran, subjects: ['english'] }], baseUrl: BASE },
      T0,
    );
    const [teacher] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE email = ${address}`;
    await sendProfile(teacher!.id, ['hindi']);
    const owner = await createAdult(sql, 'superadmin');
    await decideTeacher(sql, owner, teacher!.id, { decision: 'approve', note: 'Checked', baseUrl: BASE }, T0);
    expect(await teacherMaySee(sql, teacher!.id, kiran)).toBe(false);
    expect(await listMyTeachers(sql, parent)).toEqual([]);
    const [parentRow] = await sql<{ email: string }[]>`SELECT email FROM accounts WHERE id = ${parent}`;
    expect(await lastTemplate(parentRow!.email)).toBe('parent_teacher_link_ended');
  });

  it('when approved subjects shrink (OC-73), links lose those subjects at once', async () => {
    const { parent, kiran, meera } = await family();
    const t = await approvedTeacher(['science', 'maths']);
    await addTeacher(
      sql,
      parent,
      {
        name: 'Rao',
        email: t.email,
        children: [
          { childId: kiran, subjects: ['science', 'maths'] },
          { childId: meera, subjects: ['science'] },
        ],
        baseUrl: BASE,
      },
      T0,
    );
    await acceptAll(t.id);
    await saveTeacherProfile(
      sql,
      t.id,
      {
        name: 'Teacher A. Rao',
        timeZone: 'Asia/Kolkata',
        subjects: ['maths'],
        grades: [4, 5],
        bio: 'Maths teacher for many years.',
        curricula: [],
        experienceYears: null,
        acceptTerms: false,
      },
      'submit',
      T0,
    );
    // Still allowed while the change waits (OC-73: keep access).
    expect(await teacherMaySee(sql, t.id, meera, 'science')).toBe(true);
    const owner = await createAdult(sql, 'superadmin');
    expect(
      (await decideProfileChange(sql, owner, t.id, { decision: 'approve', note: 'Fine', baseUrl: BASE }, T0)).ok,
    ).toBe(true);
    expect(await teacherMaySee(sql, t.id, kiran, 'science')).toBe(false);
    expect(await teacherMaySee(sql, t.id, kiran, 'maths')).toBe(true);
    expect(await teacherMaySee(sql, t.id, meera)).toBe(false);
    const [mine] = await listMyTeachers(sql, parent);
    expect(mine?.children.map((c) => [c.childId, c.subjects])).toEqual([[kiran, ['maths']]]);
  });

  it('defence in depth: a subject missing from the approved profile is refused even if a link still lists it', async () => {
    const { parent, kiran } = await family();
    const t = await approvedTeacher(['science', 'maths']);
    await addTeacher(
      sql,
      parent,
      { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science', 'maths'] }], baseUrl: BASE },
      T0,
    );
    await acceptAll(t.id);
    await sql`UPDATE teacher_profiles SET subjects = ${['science']} WHERE account_id = ${t.id}`;
    expect(await teacherMaySee(sql, t.id, kiran, 'maths')).toBe(false);
    expect((await listLinkedStudents(sql, t.id))[0]?.subjects).toEqual(['science']);
  });

  it('rejected and deactivated teachers cannot be linked and see nothing', async () => {
    const { parent, kiran } = await family();
    const t = await approvedTeacher(['science']);
    await sql`UPDATE accounts SET status = 'deactivated', status_reason = 'Test' WHERE id = ${t.id}`;
    expect(
      await addTeacher(
        sql,
        parent,
        { name: 'Rao', email: t.email, children: [{ childId: kiran, subjects: ['science'] }], baseUrl: BASE },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'cannot_add' });
    expect(await teacherMaySee(sql, t.id, kiran, 'science')).toBe(false);
  });
});
