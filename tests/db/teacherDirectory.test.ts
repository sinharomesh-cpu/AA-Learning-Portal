import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanDirectoryQuery, getDirectoryTeacher, searchTeachers } from '@/server/teacherDirectory';
import { addTeacherFromDirectory, listLinkedStudents, teacherMaySee } from '@/server/teacherLinks';
import { getTeacherProfile, setHiddenFromSearch } from '@/server/teacherProfile';
import { createAdult, createChild, testDb, uniq } from './helpers';

/** PR3: teacher directory (board 65; OC-48, OC-54, OC-62; C-1 option (a)). */
const sql = testDb();

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

/** A unique word in every teacher's name so searches only see this test's teachers. */
const tag = () => `Zq${uniq()}`;

async function teacher(
  name: string,
  opts: {
    status?: string;
    approval?: 'approved' | 'submitted' | 'changes_requested' | 'rejected' | 'draft';
    subjects?: string[];
    grades?: number[];
    hidden?: boolean;
    bio?: string;
  } = {},
) {
  const email = `teacher-${uniq()}@example.com`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', ${opts.status ?? 'active'}, ${email}, ${name}, 'x', 'Asia/Singapore') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  const approval = opts.approval ?? 'approved';
  const decided = ['approved', 'changes_requested', 'rejected'].includes(approval);
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio,
                                          hidden_from_search, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', ${approval}, ${opts.subjects ?? ['maths', 'science']},
                    ${opts.grades ?? [4, 5, 6]}, ${opts.bio ?? 'Patient primary maths teacher.'}, ${opts.hidden ?? false},
                    ${decided ? owner : null}, ${decided ? new Date() : null})`;
  return { id: row!.id, email };
}

async function family() {
  const parent = await createAdult(sql, 'parent');
  const kiran = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'english']} WHERE account_id = ${kiran}`;
  return { parent, kiran };
}

describe('cleanDirectoryQuery', () => {
  it('drops unknown subjects and grades and trims the name', () => {
    expect(cleanDirectoryQuery({ subject: 'maths', grade: '5', name: '  Rao  ' })).toEqual({
      subject: 'maths',
      grade: 5,
      name: 'Rao',
    });
    expect(cleanDirectoryQuery({ subject: 'magic', grade: '13', name: '' })).toEqual({
      subject: undefined,
      grade: undefined,
      name: undefined,
    });
    expect(cleanDirectoryQuery({ grade: '4.5' }).grade).toBeUndefined();
    expect(cleanDirectoryQuery({ name: 'x'.repeat(200) }).name).toHaveLength(80);
  });
});

describe('searching (board 65)', () => {
  it('lists only approved, active, visible teachers, with the OC-54 fields only', async () => {
    const { parent } = await family();
    const t = tag();
    const shown = await teacher(`Teacher ${t} Shown`);
    await teacher(`Teacher ${t} Hidden`, { hidden: true });
    await teacher(`Teacher ${t} Submitted`, { approval: 'submitted', status: 'pending_approval' });
    await teacher(`Teacher ${t} Changes`, { approval: 'changes_requested', status: 'pending_approval' });
    await teacher(`Teacher ${t} Rejected`, { approval: 'rejected', status: 'deactivated' });
    await teacher(`Teacher ${t} Draft`, { approval: 'draft', status: 'pending_approval' });
    await teacher(`Teacher ${t} Closed`, { status: 'deactivated' });
    await teacher(`Teacher ${t} Suspended`, { status: 'suspended' });

    const r = await searchTeachers(sql, parent, { name: t });
    expect(r.teachers.map((x) => x.name)).toEqual([`Teacher ${t} Shown`]);
    expect(r.more).toBe(false);
    const [only] = r.teachers;
    expect(Object.keys(only!).sort()).toEqual(['alreadyMine', 'bio', 'grades', 'id', 'name', 'subjects', 'timeZone']);
    expect(only).toMatchObject({
      id: shown.id,
      subjects: ['maths', 'science'],
      grades: [4, 5, 6],
      timeZone: 'Asia/Singapore',
      bio: 'Patient primary maths teacher.',
      alreadyMine: false,
    });
    expect(JSON.stringify(r)).not.toContain(shown.email);
  });

  it('filters by subject, grade and name, and treats % and _ literally', async () => {
    const { parent } = await family();
    const t = tag();
    await teacher(`Teacher ${t} Maths`, { subjects: ['maths'], grades: [3, 4] });
    await teacher(`Teacher ${t} Hindi`, { subjects: ['hindi'], grades: [8] });
    const names = async (q: Parameters<typeof searchTeachers>[2]) =>
      (await searchTeachers(sql, parent, q)).teachers.map((x) => x.name);
    expect(await names({ name: t, subject: 'maths' })).toEqual([`Teacher ${t} Maths`]);
    expect(await names({ name: t, grade: 8 })).toEqual([`Teacher ${t} Hindi`]);
    expect(await names({ name: t, subject: 'maths', grade: 8 })).toEqual([]);
    expect(await names({ name: t.toLowerCase() })).toHaveLength(2);
    expect(await names({ name: `${t}%` })).toEqual([]);
    expect(await names({ name: `${t.slice(0, 3)}_` })).toEqual([]);
  });

  it('shows pending subject changes nowhere: only the approved subjects and grades', async () => {
    const { parent } = await family();
    const t = tag();
    const x = await teacher(`Teacher ${t} Change`, { subjects: ['maths'], grades: [5] });
    await sql`UPDATE teacher_profiles SET pending_subjects = ${['maths', 'it']}, pending_grades = ${[5, 9]},
              change_submitted_at = now() WHERE account_id = ${x.id}`;
    const [found] = (await searchTeachers(sql, parent, { name: t })).teachers;
    expect(found).toMatchObject({ subjects: ['maths'], grades: [5] });
    expect((await searchTeachers(sql, parent, { name: t, subject: 'it' })).teachers).toEqual([]);
  });

  it('is for active parents only', async () => {
    const t = tag();
    const x = await teacher(`Teacher ${t} One`);
    const other = await createAdult(sql, 'teacher');
    const admin = await createAdult(sql, 'superadmin');
    const closed = await createAdult(sql, 'parent', 'deactivated');
    for (const who of [other, admin, closed, x.id, 'not-a-uuid']) {
      expect((await searchTeachers(sql, who, { name: t })).teachers).toEqual([]);
      expect(await getDirectoryTeacher(sql, who, x.id)).toBeNull();
    }
  });

  it('marks teachers already linked to this parent’s children, but not another family’s', async () => {
    const a = await family();
    const b = await family();
    const t = tag();
    const x = await teacher(`Teacher ${t} Linked`);
    await sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
              VALUES (${x.id}, ${a.kiran}, ${a.parent}, 'parent_added', 'active', ${['maths']})`;
    expect((await searchTeachers(sql, a.parent, { name: t })).teachers[0]!.alreadyMine).toBe(true);
    expect((await searchTeachers(sql, b.parent, { name: t })).teachers[0]!.alreadyMine).toBe(false);
  });

  it('returns at most 50 and says more matched', async () => {
    const { parent } = await family();
    const t = tag();
    for (let i = 0; i < 51; i += 1) await teacher(`Teacher ${t} ${String(i).padStart(2, '0')}`);
    const r = await searchTeachers(sql, parent, { name: t });
    expect(r.teachers).toHaveLength(50);
    expect(r.more).toBe(true);
    expect(r.teachers[0]!.name).toBe(`Teacher ${t} 00`);
  });
});

describe('hide from search (OC-54)', () => {
  it('the teacher hides and shows themselves; links are kept', async () => {
    const { parent, kiran } = await family();
    const t = tag();
    const x = await teacher(`Teacher ${t} Toggle`);
    await sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
              VALUES (${x.id}, ${kiran}, ${parent}, 'parent_added', 'active', ${['maths']})`;
    expect(await setHiddenFromSearch(sql, x.id, true)).toEqual({ ok: true });
    expect((await getTeacherProfile(sql, x.id))!.hiddenFromSearch).toBe(true);
    expect((await searchTeachers(sql, parent, { name: t })).teachers).toEqual([]);
    expect(await getDirectoryTeacher(sql, parent, x.id)).toBeNull();
    expect(await teacherMaySee(sql, x.id, kiran, 'maths')).toBe(true);
    expect(await setHiddenFromSearch(sql, x.id, false)).toEqual({ ok: true });
    expect((await searchTeachers(sql, parent, { name: t })).teachers).toHaveLength(1);
    const [audit] = await sql<{ details: { hidden: boolean } }[]>`
      SELECT details FROM audit_events WHERE event_type = 'TEACHER_SEARCH_VISIBILITY' AND actor_id = ${x.id}
      ORDER BY occurred_at DESC, id DESC LIMIT 1`;
    expect(audit!.details.hidden).toBe(false);
  });

  it('a rejected teacher, a parent or an unknown id cannot change it', async () => {
    const t = tag();
    const rejected = await teacher(`Teacher ${t} R`, { approval: 'rejected', status: 'deactivated' });
    const parent = await createAdult(sql, 'parent');
    for (const who of [rejected.id, parent, 'nope']) {
      expect(await setHiddenFromSearch(sql, who, true)).toEqual({ ok: false, reason: 'not_allowed' });
    }
  });
});

describe('Add as my teacher from the directory (C-1 option (a))', () => {
  it('links at once for allowed subjects, emails the teacher, never needs the email from the parent', async () => {
    const { parent, kiran } = await family();
    const x = await teacher(`Teacher ${tag()} Add`);
    const r = await addTeacherFromDirectory(sql, parent, x.id, [{ childId: kiran, subjects: ['maths'] }]);
    expect(r).toEqual({ ok: true, teacherName: expect.stringContaining('Add') });
    expect(await teacherMaySee(sql, x.id, kiran, 'maths')).toBe(true);
    expect(await teacherMaySee(sql, x.id, kiran, 'english')).toBe(false);
    expect((await listLinkedStudents(sql, x.id)).map((s) => s.id)).toEqual([kiran]);
    const [mail] = await sql<{ template: string }[]>`
      SELECT template FROM email_outbox WHERE to_address = ${x.email} ORDER BY created_at DESC LIMIT 1`;
    expect(mail!.template).toBe('teacher_linked_to_child');
    const [audit] = await sql<{ details: { from: string } }[]>`
      SELECT details FROM audit_events WHERE event_type = 'TEACHER_LINKED' AND subject_id = ${x.id}`;
    expect(audit!.details.from).toBe('directory');
  });

  it('refuses subjects the teacher is not approved for (OC-75) or the child does not study', async () => {
    const { parent, kiran } = await family();
    const x = await teacher(`Teacher ${tag()} Sci`, { subjects: ['science', 'maths'] });
    await sql`UPDATE student_profiles SET subjects = ${['maths', 'english']} WHERE account_id = ${kiran}`;
    expect(await addTeacherFromDirectory(sql, parent, x.id, [{ childId: kiran, subjects: ['english'] }])).toMatchObject(
      { ok: false, reason: 'not_taught' },
    );
    expect(await addTeacherFromDirectory(sql, parent, x.id, [{ childId: kiran, subjects: ['science'] }])).toEqual({
      ok: false,
      reason: 'subjects',
    });
    expect(await addTeacherFromDirectory(sql, parent, x.id, [{ childId: kiran, subjects: [] }])).toEqual({
      ok: false,
      reason: 'choose',
    });
    expect(await teacherMaySee(sql, x.id, kiran)).toBe(false);
  });

  it('refuses another family’s child', async () => {
    const a = await family();
    const b = await family();
    const x = await teacher(`Teacher ${tag()} Other`);
    expect(await addTeacherFromDirectory(sql, a.parent, x.id, [{ childId: b.kiran, subjects: ['maths'] }])).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await teacherMaySee(sql, x.id, b.kiran)).toBe(false);
  });

  it('refuses teachers the directory does not list, even by a direct request', async () => {
    const { parent, kiran } = await family();
    const t = tag();
    const blocked = [
      await teacher(`Teacher ${t} H`, { hidden: true }),
      await teacher(`Teacher ${t} S`, { approval: 'submitted', status: 'pending_approval' }),
      await teacher(`Teacher ${t} C`, { approval: 'changes_requested', status: 'pending_approval' }),
      await teacher(`Teacher ${t} R`, { approval: 'rejected', status: 'deactivated' }),
      await teacher(`Teacher ${t} D`, { status: 'deactivated' }),
      await teacher(`Teacher ${t} U`, { status: 'suspended' }),
    ];
    for (const x of blocked) {
      expect(await addTeacherFromDirectory(sql, parent, x.id, [{ childId: kiran, subjects: ['maths'] }])).toEqual({
        ok: false,
        reason: 'not_listed',
      });
      expect(await teacherMaySee(sql, x.id, kiran)).toBe(false);
      const rows = await sql`SELECT 1 FROM teacher_student_links WHERE teacher_id = ${x.id}`;
      expect(rows.length).toBe(0);
    }
    const another = await createAdult(sql, 'parent');
    expect(await addTeacherFromDirectory(sql, parent, another, [{ childId: kiran, subjects: ['maths'] }])).toEqual({
      ok: false,
      reason: 'not_listed',
    });
    expect(await addTeacherFromDirectory(sql, parent, 'x', [{ childId: kiran, subjects: ['maths'] }])).toEqual({
      ok: false,
      reason: 'not_listed',
    });
  });

  it('only an active parent can add', async () => {
    const { kiran } = await family();
    const x = await teacher(`Teacher ${tag()} P`);
    const teacherAccount = await createAdult(sql, 'teacher');
    expect(await addTeacherFromDirectory(sql, teacherAccount, x.id, [{ childId: kiran, subjects: ['maths'] }])).toEqual(
      { ok: false, reason: 'not_allowed' },
    );
  });

  it('two parents adding the same teacher at once both succeed for their own children', async () => {
    const a = await family();
    const b = await family();
    const x = await teacher(`Teacher ${tag()} Busy`);
    const [ra, rb] = await Promise.all([
      addTeacherFromDirectory(sql, a.parent, x.id, [{ childId: a.kiran, subjects: ['maths'] }]),
      addTeacherFromDirectory(sql, b.parent, x.id, [{ childId: b.kiran, subjects: ['maths'] }]),
    ]);
    expect(ra.ok && rb.ok).toBe(true);
    expect((await listLinkedStudents(sql, x.id)).map((s) => s.id).sort()).toEqual([a.kiran, b.kiran].sort());
  });
});
