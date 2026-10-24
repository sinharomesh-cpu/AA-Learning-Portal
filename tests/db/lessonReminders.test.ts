import { afterAll, describe, expect, it } from 'vitest';
import { REMINDER_GUIDANCE, noteLessonReminders } from '@/server/lessonReminders';
import { cancelLesson, closeLessonsWithoutLink } from '@/server/lessons';
import { loadViewer, mayStillSee, type StoredNotification } from '@/server/notifications/access';
import { refreshBell } from '@/server/notifications/queries';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-17 PR 7 (D3A-10 Option A, owner 24 Oct 2026, 12:44 IST): the 15-minute lesson reminder,
 * in-app only and best-effort. It is created when the viewer's own AA Pro asks for the bell
 * (page render, 60-second refresh, return to the tab), once per lesson and person; never while
 * AA Pro is closed, never by email. Synthetic data on the throw-away database.
 */
const sql = testDb();
afterAll(() => sql.end());

async function teacher(name = 'Ms Rao') {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET display_name = ${name}, time_zone = 'Asia/Kolkata' WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
  return id;
}
async function family() {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET display_name = 'Anita Shah', time_zone = 'Asia/Kolkata' WHERE id = ${parent}`;
  await sql`UPDATE accounts SET display_name = 'Ravi Shah', time_zone = 'Europe/London' WHERE id = ${parent2}`;
  const child = await createChild(sql, parent);
  await sql`UPDATE accounts SET display_name = 'Kiran', time_zone = 'Asia/Kolkata' WHERE id = ${child}`;
  await sql`UPDATE student_profiles SET subjects = ${['maths']}, grade = 5 WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const t = await teacher();
  const link = await activeLink(sql, { teacher: t, child, parent, subjects: ['maths'] });
  return { parent, parent2, child, t, link };
}
/** A confirmed lesson starting about `fromSec` seconds from now (whole minute, rounded down), rules skipped. */
async function lesson(f: { t: string; child: string; parent: string }, fromSec: number, status = 'confirmed') {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [l] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${f.parent}, 'maths', s, 30, s + interval '30 minutes', s - interval '3 days',
             s - interval '3 days' + interval '48 hours', ${status},
             CASE WHEN ${status} = 'confirmed' THEN s - interval '3 days' + interval '1 minute' END,
             'INR', 60000, 30000, 'listed'
      FROM (SELECT date_trunc('minute', now() + make_interval(secs => ${fromSec})) AS s) x RETURNING id`;
    return l!.id;
  });
}
const viewer = async (id: string) => (await loadViewer(sql, id))!;
const reminders = (lessonId: string) =>
  sql<Array<{ recipient_id: string; kind: string; title: string; body: string; href: string }>>`
    SELECT recipient_id, kind, title, body, href FROM notifications
    WHERE entity_type = 'lesson' AND entity_id = ${lessonId} AND type = 'lesson_reminder' ORDER BY title`;

describe('PR 7: who gets the reminder, and when', () => {
  it('within 15 minutes of the start: each parent, the teacher (no child name) and the child, in their own words', async () => {
    const f = await family();
    const l = await lesson(f, 14 * 60);
    for (const id of [f.parent, f.parent2, f.t, f.child])
      expect(await noteLessonReminders(sql, await viewer(id))).toBe(1);
    const rows = await reminders(l);
    const by = (id: string) => rows.find((r) => r.recipient_id === id)!;
    expect(rows.every((r) => r.kind === 'reminder')).toBe(true);
    expect(by(f.parent).title).toMatch(/^Kiran’s Maths lesson with Ms Rao starts at \d{1,2}:\d{2} (am|pm)$/);
    expect(by(f.parent2).title).toMatch(/^Kiran’s Maths lesson with Ms Rao starts at /); // in London time
    expect(by(f.parent).title).not.toBe(by(f.parent2).title);
    expect(by(f.t).title).toMatch(/^Your Maths lesson \(Grade 5\) starts at /);
    expect(by(f.t).title + by(f.t).body).not.toContain('Kiran');
    expect(by(f.child).title).toMatch(/^Your Maths lesson with Ms Rao starts at /);
    expect([by(f.parent).href, by(f.t).href, by(f.child).href]).toEqual([
      '/parent/calendar',
      '/teacher/schedule',
      '/student/schedule',
    ]);
    for (const r of rows) expect(r.body).toContain(REMINDER_GUIDANCE);
  });

  it('not before the 15-minute mark, not once started, not for other statuses; once only', async () => {
    const f = await family();
    const early = await lesson(f, 17 * 60); // 16–17 minutes ahead
    const started = await lesson(f, -60 - 40 * 60);
    const requested = await lesson(f, 10 * 60, 'requested');
    const v = await viewer(f.parent);
    expect(await noteLessonReminders(sql, v)).toBe(0);
    for (const id of [early, started, requested]) expect(await reminders(id)).toEqual([]);
    // The 15-minute mark passes (moved here by changing the start, the database clock decides).
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lessons SET starts_at = date_trunc('minute', now()) + interval '15 minutes',
                                  ends_at = date_trunc('minute', now()) + interval '45 minutes' WHERE id = ${early}`;
    });
    expect(await noteLessonReminders(sql, v)).toBe(1);
    expect(await noteLessonReminders(sql, v)).toBe(0);
    expect(await reminders(early)).toHaveLength(1);
  });

  it('two refreshes at the same moment (two tabs) still make one reminder', async () => {
    const f = await family();
    const l = await lesson(f, 5 * 60);
    const v = await viewer(f.parent);
    const made = await Promise.all([1, 2, 3, 4].map(() => noteLessonReminders(sql, v)));
    expect(made.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await reminders(l)).toHaveLength(1);
  });

  it('nobody else: another family, another teacher, a removed teacher, an ex-parent', async () => {
    const f = await family();
    const g = await family();
    const l = await lesson(f, 5 * 60);
    expect(await noteLessonReminders(sql, await viewer(g.parent))).toBe(0);
    expect(await noteLessonReminders(sql, await viewer(g.child))).toBe(0);
    expect(await noteLessonReminders(sql, await viewer(g.t))).toBe(0);
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE id = ${f.link}`;
    expect(await noteLessonReminders(sql, await viewer(f.t))).toBe(0);
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE parent_id = ${f.parent2}`;
    expect(await noteLessonReminders(sql, await viewer(f.parent2))).toBe(0);
    expect(await reminders(l)).toEqual([]);
  });

  it('a lesson AA Pro cancels loses its reminders; a parent’s cancellation too', async () => {
    const f = await family();
    const l = await lesson(f, 10 * 60);
    for (const id of [f.parent, f.t, f.child]) await noteLessonReminders(sql, await viewer(id));
    expect(await reminders(l)).toHaveLength(3);
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE id = ${f.link}`;
    await sql.begin((tx) => closeLessonsWithoutLink(tx, { studentId: f.child }));
    expect(await reminders(l)).toEqual([]);
    expect(await noteLessonReminders(sql, await viewer(f.parent))).toBe(0);

    const g = await family();
    const m = await lesson(g, 40 * 60);
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
               VALUES (${g.parent}, 'reminder', 'lesson_reminder', 'Sample', '/parent/calendar', 'lesson', ${m},
                       ${`lesson_reminder:${m}:${uniq()}`})`;
    });
    expect(await cancelLesson(sql, { id: g.parent2, role: 'parent' }, m)).toEqual({ ok: true });
    expect(await reminders(m)).toEqual([]);
  });

  it('a child can open their own reminder, never another child’s', async () => {
    const f = await family();
    const g = await family();
    const l = await lesson(f, 5 * 60);
    const n = {
      id: '00000000-0000-4000-8000-000000000000',
      kind: 'reminder',
      type: 'lesson_reminder',
      title: 'Sample',
      body: '',
      href: '/student/schedule',
      entity_type: 'lesson',
      entity_id: l,
    } as unknown as StoredNotification;
    expect(await mayStillSee(sql, await viewer(f.child), n)).toBe(true);
    expect(await mayStillSee(sql, await viewer(g.child), n)).toBe(false);
  });
});

describe('PR 7: the bell refresh creates it (and nothing outside AA Pro)', () => {
  it('refreshBell counts the new reminder at once; no email is queued', async () => {
    const f = await family();
    await lesson(f, 6 * 60);
    const before = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM email_outbox`)[0]!.n;
    const r = await refreshBell(sql, f.child, 'http://localhost');
    expect(r.unread).toBe(1);
    const after = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM email_outbox`)[0]!.n;
    expect(after).toBe(before);
  });
});
