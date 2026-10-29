import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { setAccountActive } from '@/server/admin';
import {
  cancelLesson,
  lessonMaintenance,
  lessonsForParent,
  lessonsForStudent,
  lessonsForTeacher,
  recordOutcome,
} from '@/server/lessons';
import { noteLessonReminders } from '@/server/lessonReminders';
import { allowMeetingLinks, joinTarget, setMeetingLink, stopMeetingLinks } from '@/server/meetingLinks';
import { loadViewer, mayStillSee, type StoredNotification } from '@/server/notifications/access';
import { removeTeacher, updateTeacherLinks } from '@/server/teacherLinks';
import { activeLink, createAdult, createChild, migrationsBefore, testDb, uniq } from './helpers';

/**
 * OC-53 Option A (owner, 25 Oct 2026, 00:05 IST) and migration 0031 (M3, draft): when a parent
 * removes a teacher, or unticks a child or subject, lessons starting within the next 30 minutes
 * stay scheduled and every other upcoming lesson with that teacher is cancelled. A kept lesson
 * stays usable by its own teacher, parents and child: Join and the teacher's link work for that
 * lesson only, and only if a parent's meeting-link permission was live at the moment of removal.
 * Synthetic data only; the database clock decides, as in production.
 */
const sql = testDb();
afterAll(() => sql.end());

const LINK = 'https://us02web.zoom.us/wc/join/81234567890?pwd=SecretPass1';
const LINK2 = 'https://us02web.zoom.us/wc/join/81234567891?pwd=SecretPass2';

async function teacher(name = 'Ms Rao') {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC', display_name = ${name} WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  return id;
}

/** Two parents of one child (Kiran), linked to a teacher in maths and science. */
async function family(t?: string) {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET display_name = 'Anita Shah' WHERE id = ${parent}`;
  const child = await createChild(sql, parent);
  await sql`UPDATE accounts SET display_name = 'Kiran' WHERE id = ${child}`;
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher());
  await activeLink(sql, { teacher: tid, child, parent, subjects: ['maths', 'science'] });
  return { parent, parent2, child, t: tid };
}

/**
 * A confirmed lesson starting `min` whole minutes after the current minute (database clock); it can
 * be near now or already running, so the insert skips the triggers for this transaction only.
 */
async function lessonIn(f: { t: string; child: string; parent: string }, min: number, subject = 'maths', minutes = 10) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${f.parent}, ${subject}, s, ${minutes}, s + make_interval(mins => ${minutes}), s - interval '3 days',
             s - interval '3 days' + interval '48 hours', 'confirmed', s - interval '3 days' + interval '1 minute',
             'INR', 60000, ${(60000 * minutes) / 60}, 'listed'
      FROM (SELECT date_trunc('minute', now()) + make_interval(mins => ${min}) AS s) x
      RETURNING id`;
    return r!.id;
  });
}
const row = async (id: string) => (await sql<Record<string, unknown>[]>`SELECT * FROM lessons WHERE id = ${id}`)[0]!;
const kept = async (id: string) =>
  (
    await sql<{ links_carried: boolean; kept_by: string | null }[]>`SELECT * FROM lessons_kept WHERE lesson_id = ${id}`
  )[0];
const notes = (recipient: string, lesson: string) =>
  sql<Array<{ type: string; title: string; body: string }>>`
    SELECT type, title, body FROM notifications WHERE recipient_id = ${recipient} AND entity_id = ${lesson}
    ORDER BY created_at, type`;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? 'err';
  }
};

// ---------------------------------------------------------------------------------------------
describe('OC-53 boundary (one definition: lessons_kept_window_ok)', () => {
  it('30:00 before the start is kept, 30:00.001 is not; running lessons are kept; ended ones are not', async () => {
    const [r] = await sql<Record<string, boolean>[]>`
      WITH x AS (SELECT timestamptz '2026-11-02 10:00:00+00' AS s, timestamptz '2026-11-02 10:30:00+00' AS e)
      SELECT lessons_kept_window_ok(s, e, s - interval '30 minutes') AS exactly_30,
             lessons_kept_window_ok(s, e, s - interval '30 minutes 0.001 seconds') AS just_over_30,
             lessons_kept_window_ok(s, e, s - interval '29 minutes 59 seconds') AS under_30,
             lessons_kept_window_ok(s, e, s + interval '5 minutes') AS running,
             lessons_kept_window_ok(s, e, e - interval '0.001 seconds') AS last_moment,
             lessons_kept_window_ok(s, e, e) AS at_end
      FROM x`;
    expect(r).toEqual({
      exactly_30: true,
      just_over_30: false,
      under_30: true,
      running: true,
      last_moment: true,
      at_end: false,
    });
  });
});

describe('OC-53 Option A: the parent removes the teacher', () => {
  it('keeps lessons starting within 30 minutes (and one running); cancels the rest; tells both sides', async () => {
    const f = await family();
    // 10-minute lessons, so none overlap. Starts are whole minutes; "now" is a few seconds past one.
    const soon = await lessonIn(f, 20);
    const edge = await lessonIn(f, 30); // whole minute + 30 → at most 30:00 after "now": kept
    const later = await lessonIn(f, 41, 'science'); // more than 30 minutes away: cancelled
    const running = await lessonIn(f, -5, 'science'); // started 5 minutes ago: kept
    const tomorrow = await lessonIn(f, 24 * 60);
    const g = await family(); // just over 30 minutes, another family and teacher
    const justOver = await lessonIn(g, 31);

    expect(await removeTeacher(sql, f.parent, f.t)).toEqual({ ok: true });
    expect(await removeTeacher(sql, g.parent, g.t)).toEqual({ ok: true });

    for (const id of [soon, edge, running]) {
      expect(await row(id)).toMatchObject({ status: 'confirmed', closed_by: null });
      expect(await kept(id)).toMatchObject({ kept_by: f.parent, links_carried: false });
    }
    for (const id of [later, tomorrow, justOver]) {
      expect(await row(id)).toMatchObject({ status: 'cancelled', closed_by: 'aa_pro', close_reason: 'link_ended' });
      expect(await kept(id)).toBeUndefined();
    }
    // Both parents and the teacher are told about each kept lesson and each cancellation.
    for (const p of [f.parent, f.parent2]) {
      const k = await notes(p, soon);
      expect(k.map((n) => n.type)).toEqual(['lesson_kept']);
      expect(k[0]!.title).toMatch(/^Kiran's Maths lesson with Ms Rao on .+ stays booked$/);
      expect((await notes(p, later)).map((n) => n.type)).toEqual(['lesson_cancelled']);
    }
    const tk = await notes(f.t, soon);
    expect(tk.map((n) => n.type)).toEqual(['lesson_kept']);
    expect(tk[0]!.title + tk[0]!.body).not.toContain('Kiran'); // a teacher's notice never names the child
    expect((await notes(f.t, later)).map((n) => n.type)).toEqual(['lesson_cancelled']);
    // Audit: one record per kept lesson.
    const [audit] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'LESSON_KEPT_AFTER_LINK_END'
        AND details->>'lesson' IN ${sql([soon, edge, running])}`;
    expect(audit!.n).toBe(3);
  });

  it('a kept lesson stays on every schedule; the teacher can record its outcome after it ends', async () => {
    const f = await family();
    const soon = await lessonIn(f, 15);
    await removeTeacher(sql, f.parent, f.t);
    expect((await lessonsForTeacher(sql, f.t)).map((l) => [l.id, l.kept])).toEqual([[soon, true]]);
    expect((await lessonsForParent(sql, f.parent)).find((l) => l.id === soon)?.kept).toBe(true);
    expect((await lessonsForStudent(sql, f.child)).map((l) => l.id)).toEqual([soon]);
    // Nobody can cancel it inside 30 minutes (OC-46, unchanged).
    expect(await cancelLesson(sql, { id: f.parent, role: 'parent' }, soon)).toEqual({ ok: false, reason: 'too_late' });
    // Move it into the past: the teacher records how it went.
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lessons SET starts_at = date_trunc('minute', now()) - interval '1 hour',
                                  ends_at = date_trunc('minute', now()) - interval '50 minutes' WHERE id = ${soon}`;
    });
    expect(await recordOutcome(sql, f.t, soon, 'taught')).toEqual({ ok: true });
  });

  it('the sweep never cancels a kept lesson; deactivating the teacher still does (D3A-13)', async () => {
    const f = await family();
    const soon = await lessonIn(f, 10);
    await removeTeacher(sql, f.parent, f.t);
    await lessonMaintenance(sql);
    expect((await row(soon)).status).toBe('confirmed');
    const owner = await createAdult(sql, 'superadmin');
    expect(await setAccountActive(sql, owner, f.t, { active: false, reason: 'Test deactivation' })).toEqual({
      ok: true,
    });
    expect(await row(soon)).toMatchObject({ status: 'cancelled', close_reason: 'teacher_deactivated' });
  });

  it('unticking a subject or a child keeps that subject/child’s soon lessons only; other families are untouched', async () => {
    const f = await family();
    const other = await family(f.t); // another family with the same teacher
    const sibling = await createChild(sql, f.parent);
    await sql`UPDATE student_profiles SET subjects = ${['maths']} WHERE account_id = ${sibling}`;
    await activeLink(sql, { teacher: f.t, child: sibling, parent: f.parent, subjects: ['maths'] });
    const mathsSoon = await lessonIn(f, 20, 'maths');
    const scienceSoon = await lessonIn(f, -1, 'science');
    const siblingSoon = await lessonIn({ ...f, child: sibling }, 40);
    const otherSoon = await lessonIn(other, 10);
    const r = await updateTeacherLinks(sql, f.parent, f.t, [
      { childId: f.child, subjects: ['science'] },
      { childId: sibling, subjects: ['maths'] },
    ]);
    expect(r.ok).toBe(true);
    expect(await kept(mathsSoon)).toMatchObject({ kept_by: f.parent });
    expect(await kept(scienceSoon)).toBeUndefined(); // still linked in science: nothing to keep
    expect(await kept(siblingSoon)).toBeUndefined();
    for (const id of [mathsSoon, scienceSoon, siblingSoon, otherSoon]) expect((await row(id)).status).toBe('confirmed');
    expect((await lessonsForTeacher(sql, f.t)).map((l) => l.id)).toEqual(
      expect.arrayContaining([mathsSoon, scienceSoon, siblingSoon, otherSoon]),
    );
  });

  it('OD-A scope: one change keeps only its own child/subject lessons; nothing unrelated is kept or touched', async () => {
    // Owner, 25 Oct 2026, 13:18 IST: removing a child's link applies Option A to that child's
    // lessons; unticking a subject applies it only to that subject's lessons.
    const f = await family(); // child A: maths and science
    const sib = async (subjects: string[]) => {
      const c = await createChild(sql, f.parent);
      await sql`UPDATE student_profiles SET subjects = ${subjects} WHERE account_id = ${c}`;
      await activeLink(sql, { teacher: f.t, child: c, parent: f.parent, subjects });
      return c;
    };
    const b = await sib(['maths']); // B: left out of the choice (link removed)
    const c = await sib(['maths']); // C: unchanged
    const d = await sib(['maths']); // D: link already ended earlier, its lesson not yet swept
    // Non-overlapping 10-minute lessons with the one teacher.
    const dStale = await lessonIn({ ...f, child: d }, -9); // running, inside the window
    const aMathsSoon = await lessonIn(f, 2, 'maths');
    const bSoon = await lessonIn({ ...f, child: b }, 14);
    const cSoon = await lessonIn({ ...f, child: c }, 26);
    const aScienceLater = await lessonIn(f, 45, 'science');
    const aMathsLater = await lessonIn(f, 60, 'maths');
    const bLater = await lessonIn({ ...f, child: b }, 75);
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE teacher_student_links SET status = 'removed', removed_at = now()
               WHERE teacher_id = ${f.t} AND student_id = ${d}`;
    });

    const r = await updateTeacherLinks(sql, f.parent, f.t, [
      { childId: f.child, subjects: ['science'] }, // maths unticked
      { childId: c, subjects: ['maths'] }, // unchanged; B left out
    ]);
    expect(r.ok).toBe(true);
    // In scope and within 30 minutes: kept.
    expect(await kept(aMathsSoon)).toMatchObject({ kept_by: f.parent });
    expect(await kept(bSoon)).toMatchObject({ kept_by: f.parent });
    // In scope, more than 30 minutes away: cancelled as "link ended".
    for (const id of [aMathsLater, bLater]) {
      expect(await row(id)).toMatchObject({ status: 'cancelled', close_reason: 'link_ended' });
    }
    // Not in this change's scope: the unticked child's other subject and the unchanged child are untouched.
    for (const id of [aScienceLater, cSoon]) {
      expect(await kept(id)).toBeUndefined();
      expect((await row(id)).status).toBe('confirmed');
    }
    // A lesson whose link ended by some earlier event is never kept by this parent's change
    // (D3A-24 closes it as before).
    expect(await kept(dStale)).toBeUndefined();
    expect(await row(dStale)).toMatchObject({ status: 'cancelled', close_reason: 'link_ended' });
    const audit = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'LESSON_KEPT_AFTER_LINK_END'
        AND details->>'lesson' = ANY(${[aMathsSoon, bSoon, cSoon, dStale, aScienceLater]})`;
    expect(audit[0]!.n).toBe(2);
  });

  it('OD-A scope: a subject untick alone never keeps another child’s stale lesson', async () => {
    const f = await family();
    const d = await createChild(sql, f.parent);
    await sql`UPDATE student_profiles SET subjects = ${['maths']} WHERE account_id = ${d}`;
    await activeLink(sql, { teacher: f.t, child: d, parent: f.parent, subjects: ['maths'] });
    const dStale = await lessonIn({ ...f, child: d }, 4);
    const aScienceSoon = await lessonIn(f, 16, 'science');
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE teacher_student_links SET status = 'removed', removed_at = now()
               WHERE teacher_id = ${f.t} AND student_id = ${d}`;
    });
    await updateTeacherLinks(sql, f.parent, f.t, [{ childId: f.child, subjects: ['maths'] }]); // science unticked
    expect(await kept(aScienceSoon)).toMatchObject({ kept_by: f.parent });
    expect(await kept(dStale)).toBeUndefined();
    expect(await row(dStale)).toMatchObject({ status: 'cancelled', close_reason: 'link_ended' });
  });

  it('requests (never inside 30 minutes) still close as "link ended"', async () => {
    const f = await family();
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at,
                                     requested_at, reply_deadline, status, currency, rate_minor, price_minor, price_basis)
               SELECT ${f.t}, ${f.child}, ${f.parent}, 'maths', s, 30, s + interval '30 minutes', now(),
                      now() + interval '48 hours', 'requested', 'INR', 60000, 30000, 'listed'
               FROM (SELECT date_trunc('minute', now()) + interval '3 days' AS s) x`;
    });
    await removeTeacher(sql, f.parent, f.t);
    const rows = await sql`SELECT status, close_reason FROM lessons WHERE student_id = ${f.child}`;
    expect(rows).toEqual([{ status: 'declined', close_reason: 'link_ended' }]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('OC-53: meeting links for a kept lesson (explicit, lesson-scoped permission)', () => {
  it('permission live at removal: carried to the kept lesson only; Join works for its own people only', async () => {
    const f = await family();
    expect(await allowMeetingLinks(sql, f.parent, f.t, f.child)).toEqual({ ok: true });
    const soon = await lessonIn(f, 8); // Join opens 10 minutes before: open now
    await setMeetingLink(sql, f.t, soon, LINK);
    const later = await lessonIn(f, 90);
    await removeTeacher(sql, f.parent, f.t);
    expect(await kept(soon)).toMatchObject({ links_carried: true });
    expect((await row(later)).status).toBe('cancelled');
    // The general permission is withdrawn (D3A-1 rule 3 unchanged): no other lesson can use it.
    expect(
      await sql`SELECT 1 FROM meeting_link_permissions WHERE student_id = ${f.child} AND withdrawn_at IS NULL`,
    ).toHaveLength(0);
    // The kept lesson: its own teacher may change its link; Join opens for teacher, both parents and the child.
    expect(await setMeetingLink(sql, f.t, soon, LINK2)).toEqual({ ok: true, changed: true });
    for (const v of [
      { id: f.t, role: 'teacher' as const },
      { id: f.parent, role: 'parent' as const },
      { id: f.parent2, role: 'parent' as const },
      { id: f.child, role: 'student' as const },
    ]) {
      expect(await joinTarget(sql, v, soon)).toEqual({ ok: true, url: LINK2 });
    }
    // Anyone else: "not found".
    const stranger = await family();
    const otherTeacher = await teacher('Mr Iyer');
    for (const v of [
      { id: stranger.parent, role: 'parent' as const },
      { id: stranger.child, role: 'student' as const },
      { id: otherTeacher, role: 'teacher' as const },
    ]) {
      expect(await joinTarget(sql, v, soon)).toEqual({ ok: false, reason: 'not_found' });
    }
    expect(await setMeetingLink(sql, otherTeacher, soon, LINK)).toEqual({ ok: false, reason: 'not_found' });
    // The parent's list shows links allowed for this lesson only.
    const mine = await lessonsForParent(sql, f.parent);
    expect(mine.find((l) => l.id === soon)?.meeting.allowed).toBe(true);
  });

  it('no live permission at removal (never given, or withdrawn by a parent): nothing is carried', async () => {
    for (const how of ['never', 'withdrawn'] as const) {
      const f = await family();
      if (how === 'withdrawn') {
        await allowMeetingLinks(sql, f.parent, f.t, f.child);
        await stopMeetingLinks(sql, f.parent2, f.t, f.child);
      }
      const soon = await lessonIn(f, 8);
      await removeTeacher(sql, f.parent, f.t);
      expect(await kept(soon)).toMatchObject({ links_carried: false });
      expect(await setMeetingLink(sql, f.t, soon, LINK)).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await joinTarget(sql, { id: f.child, role: 'student' }, soon)).toEqual({
        ok: false,
        reason: 'not_allowed',
      });
      expect((await lessonsForParent(sql, f.parent)).find((l) => l.id === soon)?.meeting.allowed).toBe(false);
    }
  });

  it('unticking a subject keeps the (still live) permission for the kept lesson', async () => {
    const f = await family();
    await allowMeetingLinks(sql, f.parent, f.t, f.child);
    const soon = await lessonIn(f, 12, 'science');
    await updateTeacherLinks(sql, f.parent, f.t, [{ childId: f.child, subjects: ['maths'] }]);
    expect(await kept(soon)).toMatchObject({ links_carried: true });
    expect(await setMeetingLink(sql, f.t, soon, LINK)).toEqual({ ok: true, changed: true });
  });

  it('the teacher’s reminder and notification access follow the kept lesson', async () => {
    const f = await family();
    const soon = await lessonIn(f, 12);
    await removeTeacher(sql, f.parent, f.t);
    const viewer = await loadViewer(sql, f.t);
    expect(await noteLessonReminders(sql, viewer)).toBe(1);
    const [n] = await sql<StoredNotification[]>`
      SELECT * FROM notifications WHERE recipient_id = ${f.t} AND entity_id = ${soon} AND type = 'lesson_reminder'`;
    expect(await mayStillSee(sql, viewer!, n!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('M3 (0031) database rules: the second line of defence', () => {
  const keep = (lesson: string, by: string) =>
    sql`INSERT INTO lessons_kept (lesson_id, kept_by) VALUES (${lesson}, ${by})`;

  it('refuses: a lesson more than 30 minutes away; a still-linked teacher; a non-parent; any change', async () => {
    const f = await family();
    const far = await lessonIn(f, 45);
    const near = await lessonIn(f, 10);
    expect(await code(keep(near, f.parent))).toBe('23514'); // teacher still linked
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE student_id = ${f.child}`;
    expect(await code(keep(far, f.parent))).toBe('23514'); // outside the window
    const stranger = await createAdult(sql, 'parent');
    expect(await code(keep(near, stranger))).toBe('42501'); // not a parent of the child
    expect(await code(keep(near, f.parent))).toBe('ok');
    expect(await code(sql`UPDATE lessons_kept SET links_carried = true WHERE lesson_id = ${near}`)).toBe('23514');
    expect(await code(sql`UPDATE lessons_kept SET kept_at = now() - interval '1 day' WHERE lesson_id = ${near}`)).toBe(
      '23514',
    );
  });

  it('refuses a meeting link on a kept lesson without a carried permission, or from another teacher', async () => {
    const f = await family();
    const soon = await lessonIn(f, 10);
    await removeTeacher(sql, f.parent, f.t);
    const link = (by: string) =>
      sql`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${soon}, ${LINK}, ${by})`;
    expect(await code(link(f.t))).toBe('23514'); // nothing carried
    const g = await family();
    await allowMeetingLinks(sql, g.parent, g.t, g.child);
    const gSoon = await lessonIn(g, 10);
    await removeTeacher(sql, g.parent, g.t);
    const otherTeacher = await teacher('Mr Iyer');
    expect(
      await code(
        sql`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${gSoon}, ${LINK}, ${otherTeacher})`,
      ),
    ).toBe('23514');
    expect(
      await code(sql`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${gSoon}, ${LINK}, ${g.t})`),
    ).toBe('ok');
  });
});

// ---------------------------------------------------------------------------------------------
describe('M3 (0031) rollback, on a throw-away database (order: M3, then M2, then M1)', () => {
  it('reverts cleanly, keeps lessons and other notifications, restores 0030’s link check, applies again', async () => {
    const admin = testDb();
    const name = `m3rb_${uniq()}`;
    await admin.unsafe(`CREATE DATABASE ${name}`);
    const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
    url.pathname = `/${name}`;
    const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      // TL-3 (0034, TL3-6 Option D) ships no rollback: the older reverts run on a database at 0033.
      await migrate(db, { dir: await migrationsBefore('0034') });
      const fnBefore = async () =>
        (
          await db<
            { src: string }[]
          >`SELECT prosrc AS src FROM pg_proc WHERE proname = 'lesson_meeting_links_before_write'`
        )[0]!.src;
      expect(await fnBefore()).toContain('lessons_kept');
      // TL-2 (0033) and TL-1 (0032) are newer and depend on lessons: they are reverted first, newest
      // first (and applied again below).
      const revertTl2 = await readFile(
        new URL('../../db/rollback/0033_revert_material_requests.sql', import.meta.url),
        'utf8',
      );
      await db.begin((tx) => tx.unsafe(revertTl2));
      const revertTl1 = await readFile(
        new URL('../../db/rollback/0032_revert_lesson_chapters.sql', import.meta.url),
        'utf8',
      );
      await db.begin((tx) => tx.unsafe(revertTl1));
      const revert = await readFile(new URL('../../db/rollback/0031_revert_kept_lessons.sql', import.meta.url), 'utf8');
      await db.begin((tx) => tx.unsafe(revert));
      expect(await db`SELECT 1 FROM information_schema.tables WHERE table_name = 'lessons_kept'`).toHaveLength(0);
      expect(await db`SELECT 1 FROM pg_proc WHERE proname LIKE 'lessons\\_kept%'`).toHaveLength(0);
      // The link check is 0030's again, character for character.
      const zero30 = await readFile(new URL('../../db/migrations/0030_meeting_links.sql', import.meta.url), 'utf8');
      const start = zero30.indexOf('CREATE FUNCTION lesson_meeting_links_before_write');
      const body30 = zero30.slice(zero30.indexOf('$$', start) + 2, zero30.indexOf('END $$;', start) + 4);
      expect(await fnBefore()).toBe(body30);
      expect(await fnBefore()).not.toContain('lessons_kept');
      // Then M2 and M1 revert in order, as before.
      for (const f of ['0030_revert_meeting_links.sql', '0029_revert_lessons.sql']) {
        const r = await readFile(new URL(`../../db/rollback/${f}`, import.meta.url), 'utf8');
        await db.begin((tx) => tx.unsafe(r));
      }
      expect(await db`SELECT 1 FROM information_schema.tables WHERE table_name = 'lessons'`).toHaveLength(0);
      // And forward again: 0029, 0030, 0031, 0032, 0033.
      for (const f of [
        '0029_lessons.sql',
        '0030_meeting_links.sql',
        '0031_kept_lessons.sql',
        '0032_lesson_chapters.sql',
        '0033_material_requests.sql',
      ]) {
        const m = await readFile(new URL(`../../db/migrations/${f}`, import.meta.url), 'utf8');
        await db.begin((tx) => tx.unsafe(m));
      }
      expect(await db`SELECT 1 FROM information_schema.tables WHERE table_name = 'lessons_kept'`).toHaveLength(1);
    } finally {
      await db.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    }
  });

  it('0031 is applied exactly once when two builds migrate at the same moment', async () => {
    const { mkdtemp, readdir, copyFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const src = new URL('../../db/migrations/', import.meta.url).pathname;
    const upTo30 = await mkdtemp(join(tmpdir(), 'm3-'));
    for (const f of await readdir(src)) if (f < '0031') await copyFile(join(src, f), join(upTo30, f));
    const admin = testDb();
    const name = `m3c_${uniq()}`;
    await admin.unsafe(`CREATE DATABASE ${name}`);
    const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
    url.pathname = `/${name}`;
    const a = postgres(url.toString(), { max: 1, onnotice: () => {} });
    const b = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      await migrate(a, { dir: upTo30 }); // the shared test database as it is today: 0001-0030
      const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
      // Both runs apply everything after 0030 exactly once between them (0031; 0032 since TL-1; 0033 since TL-2; 0034 since TL-3).
      expect([...ra, ...rb].sort()).toEqual([
        '0031_kept_lessons.sql',
        '0032_lesson_chapters.sql',
        '0033_material_requests.sql',
        '0034_teacher_proposals.sql',
      ]);
    } finally {
      await a.end();
      await b.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    }
  });
});
