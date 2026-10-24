import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Persona } from '@/fixtures/personas';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-17 PR 2, owner decision B4 (24 Oct 2026): the teacher dashboard's "My students" lists
 * exactly the children with an ACTIVE link to the teacher, the existing rule used by My students.
 * A waiting link request, a removed link, another teacher's child, or a lesson request on its own
 * never adds a child. Synthetic data on the throw-away database.
 */
const sql = testDb();
let getTeacherHome: typeof import('@/server/teacherHome').getTeacherHome;

beforeAll(async () => {
  process.env.DATABASE_URL = inject('databaseUrl');
  ({ getTeacherHome } = await import('@/server/teacherHome'));
});
afterAll(async () => {
  const { closeDb } = await import('@/server/db/client');
  await closeDb();
  await sql.end();
});

async function teacher(name: string) {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET display_name = ${name}, time_zone = 'UTC' WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  return id;
}
const viewer = (id: string): Persona => ({ id, role: 'teacher', displayName: 'T', initial: 'T', timeZone: 'UTC' });
const names = async (t: string) => (await getTeacherHome(viewer(t), new Date()))!.students.map((s) => s.name);

describe('teacher dashboard roster (B4)', () => {
  it('lists active links only', async () => {
    const t = await teacher('Ms Rao');
    const other = await teacher('Mr Iyer');
    const parent = await createAdult(sql, 'parent');
    const kids: Record<string, string> = {};
    for (const n of ['Asha', 'Bilal', 'Chitra', 'Dev', 'Esha']) {
      kids[n] = await createChild(sql, parent);
      await sql`UPDATE accounts SET display_name = ${n} WHERE id = ${kids[n]}`;
    }
    await activeLink(sql, { teacher: t, child: kids.Asha!, parent, subjects: ['maths'] });
    // Bilal: a link request still waiting for the teacher.
    await sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects,
                                                 requested_at, expires_at)
              VALUES (${t}, ${kids.Bilal}, ${parent}, 'parent_added', 'requested', ${['maths']}, now(), now() + interval '14 days')`;
    // Chitra: linked, then removed.
    const removed = await activeLink(sql, { teacher: t, child: kids.Chitra!, parent, subjects: ['maths'] });
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE id = ${removed}`;
    // Dev: another teacher's child.
    await activeLink(sql, { teacher: other, child: kids.Dev!, parent, subjects: ['maths'] });
    // Esha: no link, only a stray lesson row (inserted with triggers skipped; impossible normally).
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                                    reply_deadline, currency, rate_minor, price_minor, price_basis)
               VALUES (${t}, ${kids.Esha}, ${parent}, 'maths', date_trunc('hour', now()) + interval '3 days', 30,
                       date_trunc('hour', now()) + interval '3 days 30 minutes', now(),
                       now() + interval '48 hours', 'INR', 60000, 30000, 'listed')`;
    });
    expect(await names(t)).toEqual(['Asha']);
    expect(await names(other)).toEqual(['Dev']);
  });

  it('shows grade, ticked subjects, lessons taught and the last shared file', async () => {
    const t = await teacher(`Ms Rao ${uniq()}`);
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
    await activeLink(sql, { teacher: t, child, parent, subjects: ['maths', 'science'] });
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                                    reply_deadline, status, confirmed_at, outcome, outcome_at, currency, rate_minor,
                                    price_minor, price_basis)
               VALUES (${t}, ${child}, ${parent}, 'maths', date_trunc('hour', now()) - interval '2 days', 30,
                       date_trunc('hour', now()) - interval '2 days' + interval '30 minutes', now() - interval '5 days',
                       now() - interval '3 days', 'confirmed', now() - interval '4 days', 'taught', now() - interval '1 day',
                       'INR', 60000, 30000, 'listed')`;
    });
    const [s] = (await getTeacherHome(viewer(t), new Date()))!.students;
    expect(s).toMatchObject({ grade: 5, subject: 'Maths, Science', completed: 1, nextLesson: null, lastShared: null });
  });
});
