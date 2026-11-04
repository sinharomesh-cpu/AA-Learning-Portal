import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  answerLesson,
  cancelLesson,
  closeLeftoverOverlaps,
  closeLessonsWithoutLink,
  freeTimes,
  lessonForParent,
  lessonMaintenance,
  lessonChangesReady,
  lessonsForParent,
  lessonsForStudent,
  lessonsForTeacher,
  moveFailureFromDb,
  moveTarget,
  requestLesson,
  withdrawLesson,
} from '@/server/lessons';
import { materialRequestsFor, requestMaterial, withdrawMaterialRequest } from '@/server/materialRequests';
import { allowMeetingLinks, setMeetingLink } from '@/server/meetingLinks';
import { answerProposal, proposeLesson, reviewProposal, withdrawProposal } from '@/server/proposals';
import { lessonStatusText, closeReasonText } from '@/lib/lessonDisplay';
import { migrate } from '../../scripts/db-migrate.mjs';
import { removeTeacher } from '@/server/teacherLinks';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-4 APPLICATION LAYER (authorised 2 Nov 2026, 22:57 IST; continued in parallel with the
 * conditional 0036 reservation of 3 Nov 2026). Two throw-away databases, synthetic accounts only:
 *  - "without": the shared test database (every migration, NO TL-4 SQL), as every shared database
 *    is today: nothing offers or accepts a move, and TL-2/TL-3 behave as before;
 *  - "with": a database of its own with the unnumbered draft db/drafts/tl4_lesson_changes.sql.
 * AC numbers refer to Evidence Pack 4.3 §8. Nothing here touches a shared database.
 */
const without = testDb();
const admin = testDb();
const name = `tl4app_${uniq()}`;
let sql: postgres.Sql;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Three days ahead, 10:00 UTC (on every grid). */
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR);
const at = (offsetMin: number) => new Date(BASE.getTime() + offsetMin * MIN);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date) => d.toISOString().slice(11, 16);

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
  u.pathname = `/${name}`;
  sql = postgres(u.toString(), { max: 8, onnotice: () => {} });
  await migrate(sql);
  await sql.unsafe(await readFile(new URL('../../db/drafts/tl4_lesson_changes.sql', import.meta.url), 'utf8'));
});
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  await without.end();
});

type Db = postgres.Sql;

async function teacher(db: Db, name = 'Ms Rao') {
  const id = await createAdult(db, 'teacher');
  const owner = await createAdult(db, 'superadmin');
  await db`UPDATE accounts SET time_zone = 'UTC', display_name = ${name} WHERE id = ${id}`;
  await db`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
           VALUES (${id}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await db`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, 0, 1440)`;
  await db`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
           VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', 60000, 30)`;
  return id;
}

/** Two parents of one child, linked to a teacher in maths (all synthetic). */
async function family(db: Db, t?: string) {
  const parent = await createAdult(db, 'parent');
  const parent2 = await createAdult(db, 'parent');
  await db`UPDATE accounts SET display_name = 'Anita Shah', time_zone = 'UTC' WHERE id = ${parent}`;
  await db`UPDATE accounts SET display_name = 'Ravi Shah', time_zone = 'UTC' WHERE id = ${parent2}`;
  const child = await createChild(db, parent);
  await db`UPDATE accounts SET display_name = 'Kiran' WHERE id = ${child}`;
  await db`UPDATE student_profiles SET subjects = ${['maths']} WHERE account_id = ${child}`;
  await db`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher(db));
  await activeLink(db, { teacher: tid, child, parent, subjects: ['maths'] });
  return { parent, parent2, child, t: tid };
}
type Fam = Awaited<ReturnType<typeof family>>;

/** A confirmed lesson: the teacher proposes, a parent accepts (the real TL-3 path). */
async function booked(db: Db, f: Fam, start: Date, minutes = 30) {
  const p = await proposeLesson(db, f.t, {
    childId: f.child,
    subject: 'maths',
    date: ymd(start),
    time: hm(start),
    minutes: String(minutes),
  });
  if (!p.ok) throw new Error(`propose: ${p.reason}`);
  const a = await answerProposal(db, f.parent, p.id, 'accept');
  if (!a.ok) throw new Error(`accept: ${a.reason}`);
  return p.id;
}

const moveByTeacher = (db: Db, f: Fam, original: string, start: Date, extra: Record<string, unknown> = {}) =>
  proposeLesson(db, f.t, {
    replacesLessonId: original,
    childId: '',
    subject: '',
    date: ymd(start),
    time: hm(start),
    minutes: '30',
    ...extra,
  });

/** A parent's move request at a time offered by freeTimes for that move. */
async function moveByParent(db: Db, f: Fam, original: string, start: Date, minutes = 30, parent = f.parent) {
  const free = await freeTimes(db, parent, {
    childId: f.child,
    teacherId: f.t,
    subject: 'maths',
    minutes,
    parentZone: 'UTC',
    movingLessonId: original,
  });
  if (!free.ok) throw new Error(`freeTimes: ${free.reason}`);
  const slot = free.days.flatMap((d) => d.times).find((x) => x.startsAt.getTime() === start.getTime());
  if (!slot) throw new Error('time not offered');
  return requestLesson(db, parent, {
    replacesLessonId: original,
    childId: '',
    teacherId: '',
    subject: '',
    minutes: String(minutes),
    startsAt: slot.startsAt.toISOString(),
    priceMinor: String(slot.priceMinor),
    currency: slot.currency,
    basis: slot.basis,
  });
}

const statusOf = async (db: Db, id: string) =>
  (
    await db<
      { status: string; close_reason: string | null }[]
    >`SELECT status, close_reason FROM lessons WHERE id = ${id}`
  )[0]!;
const notices = (db: Db, recipient: string, entity: string) =>
  db<{ type: string; title: string; body: string; kind: string }[]>`
    SELECT type, title, body, kind FROM notifications WHERE recipient_id = ${recipient} AND entity_id = ${entity}
    ORDER BY created_at`;

// =========================================================================== without the TL-4 SQL
describe('without the TL-4 SQL (every shared database today)', () => {
  it('nothing offers or accepts a move; lists and ordinary lessons work as before', async () => {
    const f = await family(without);
    const id = await booked(without, f, at(0));
    expect(await lessonChangesReady(without)).toBe(false);
    expect(await moveTarget(without, { id: f.parent, role: 'parent' }, id)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(await moveTarget(without, { id: f.t, role: 'teacher' }, id)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await moveByTeacher(without, f, id, at(DAY / MIN))).toEqual({ ok: false, reason: 'unavailable' });
    const r = await requestLesson(without, f.parent, {
      replacesLessonId: id,
      childId: '',
      teacherId: '',
      subject: '',
      minutes: '30',
      startsAt: at(DAY / MIN).toISOString(),
      priceMinor: '30000',
      currency: 'INR',
      basis: 'listed',
    });
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
    const [item] = (await lessonsForParent(without, f.parent)).filter((l) => l.id === id);
    expect(item).toMatchObject({
      status: 'confirmed',
      canMove: false,
      movedFrom: null,
      movedTo: null,
      changePending: false,
    });
    expect((await lessonsForTeacher(without, f.t)).find((l) => l.id === id)?.canMove).toBe(false);
    // Nothing was written.
    expect((await without`SELECT count(*)::int AS n FROM lessons WHERE student_id = ${f.child}`)[0]!.n).toBe(1);
  });
});

// =========================================================================== with the TL-4 SQL
describe('with the TL-4 SQL (throw-away database)', () => {
  it('is detected', async () => {
    expect(await lessonChangesReady(sql)).toBe(true);
  });

  it('teacher proposes a move; a parent accepts: one swap, one "moved" notice, child sees only the new lesson (AC-25)', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0));
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN + 60));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    // The original stays booked meanwhile; parents see a pending move; the change shows "moved from".
    const before = await lessonsForParent(sql, f.parent);
    expect(before.find((l) => l.id === original)).toMatchObject({
      status: 'confirmed',
      changePending: true,
      canMove: false,
    });
    expect(before.find((l) => l.id === p.id)?.movedFrom?.getTime()).toBe(at(0).getTime());
    expect((await notices(sql, f.parent, p.id)).map((n) => [n.type, n.kind])).toEqual([
      ['lesson_change_proposed', 'action'],
    ]);
    // The child still sees only the booked lesson.
    expect((await lessonsForStudent(sql, f.child)).map((l) => l.id)).toEqual([original]);

    expect(await answerProposal(sql, f.parent2, p.id, 'accept')).toEqual({ ok: true });
    expect(await statusOf(sql, original)).toEqual({ status: 'cancelled', close_reason: 'rescheduled' });
    expect((await statusOf(sql, p.id)).status).toBe('confirmed');
    // AC-25 / D3: the child's schedule shows only the replacement as active.
    expect((await lessonsForStudent(sql, f.child)).map((l) => l.id)).toEqual([p.id]);
    // Parents and teacher see where it came from and went.
    const after = await lessonsForParent(sql, f.parent);
    expect(after.find((l) => l.id === p.id)?.movedFrom?.getTime()).toBe(at(0).getTime());
    expect(after.find((l) => l.id === original)?.movedTo?.getTime()).toBe(at(DAY / MIN + 60).getTime());
    expect(after.find((l) => l.id === p.id)?.canMove).toBe(true);
    // One "moved" notice each for the teacher and the other parent; none for the parent who accepted.
    expect((await notices(sql, f.t, p.id)).map((n) => n.type)).toEqual(['lesson_moved']);
    expect((await notices(sql, f.parent, p.id)).map((n) => n.type)).toContain('lesson_moved');
    expect((await notices(sql, f.parent2, p.id)).map((n) => n.type)).not.toContain('lesson_moved');
    // A teacher's notice never names the child (CR-16).
    for (const n of await notices(sql, f.t, p.id)) expect(`${n.title} ${n.body}`).not.toContain('Kiran');
    const [audit] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'LESSON_MOVED' AND details ->> 'replaces' = ${original}`;
    expect(audit!.n).toBe(1);
  });

  it('parent asks to move (request rules, may overlap its own original: rule 4); the teacher accepts; open material requests move without per-request notices', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0), 40);
    const m = await requestMaterial(sql, f.t, { lessonId: original, description: 'Workbook pages 4-6', note: '' });
    expect(m.ok).toBe(true);
    // 10:30-11:10 overlaps the original 10:00-10:40: allowed for a parent's move (rule 4).
    const r = await moveByParent(sql, f, original, at(30), 40);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await notices(sql, f.t, r.id)).map((n) => [n.type, n.kind])).toEqual([
      ['lesson_change_requested', 'action'],
    ]);
    const before = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM notifications WHERE entity_type = 'material_request'
      AND recipient_id IN (${f.parent}, ${f.parent2}, ${f.t})`;
    expect(await answerLesson(sql, f.t, r.id, 'accept')).toEqual({ ok: true });
    expect(await statusOf(sql, original)).toEqual({ status: 'cancelled', close_reason: 'rescheduled' });
    const carried = await sql<{ status: string; description: string }[]>`
      SELECT status, description FROM material_requests WHERE lesson_id = ${r.id}`;
    expect(carried).toEqual([{ status: 'open', description: 'Workbook pages 4-6' }]);
    const [old] = await sql<
      { close_reason: string }[]
    >`SELECT close_reason FROM material_requests WHERE lesson_id = ${original}`;
    expect(old!.close_reason).toBe('carried_forward');
    // Shown as moved (not "no longer needed") on the old lesson; open on the new one.
    const views = await materialRequestsFor(sql, { id: f.parent, role: 'parent' }, [original, r.id]);
    expect(views.get(original)?.map((v) => v.carriedForward)).toEqual([true]);
    expect(views.get(r.id)?.map((v) => [v.status, v.carriedForward])).toEqual([['open', false]]);
    // No "material requested" or "no longer needed" notice for the carried request.
    const afterN = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM notifications WHERE entity_type = 'material_request'
      AND recipient_id IN (${f.parent}, ${f.parent2}, ${f.t})`;
    expect(afterN[0]!.n).toBe(before[0]!.n);
    expect((await notices(sql, f.parent, r.id)).map((n) => n.type)).toContain('lesson_moved');
    expect((await notices(sql, f.parent2, r.id)).map((n) => n.type)).toContain('lesson_moved');
  });

  it('DEF-TL4-12: carried requests keep the order they had on the original (the copies share one created_at)', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(2 * 60), 30);
    const texts = ['First: workbook', 'Second: ruler', 'Third: atlas', 'Fourth: graph paper', 'Fifth: notes'];
    for (const description of texts) {
      expect((await requestMaterial(sql, f.t, { lessonId: original, description, note: '' })).ok).toBe(true);
    }
    const r = await moveByParent(sql, f, original, at(5 * 60), 30);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await answerLesson(sql, f.t, r.id, 'accept')).toEqual({ ok: true });
    const views = await materialRequestsFor(sql, { id: f.parent, role: 'parent' }, [original, r.id]);
    expect(views.get(r.id)?.map((v) => v.what)).toEqual(texts);
    expect(views.get(original)?.map((v) => v.what)).toEqual(texts);
  });

  it('decline and withdraw change nothing; the lesson stays booked and the other side is told', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0));
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN));
    if (!p.ok) throw new Error(p.reason);
    expect(await answerProposal(sql, f.parent, p.id, 'decline')).toEqual({ ok: true });
    expect((await statusOf(sql, original)).status).toBe('confirmed');
    expect((await notices(sql, f.t, p.id)).map((n) => n.type)).toEqual(['lesson_change_declined']);
    const q = await moveByParent(sql, f, original, at(DAY / MIN + 120));
    if (!q.ok) throw new Error(q.reason);
    expect(await withdrawLesson(sql, f.parent2, q.id)).toEqual({ ok: true });
    expect((await notices(sql, f.t, q.id)).map((n) => n.type)).toEqual([
      'lesson_change_requested',
      'lesson_change_withdrawn',
    ]);
    const p2 = await moveByTeacher(sql, f, original, at(DAY / MIN + 240));
    if (!p2.ok) throw new Error(p2.reason);
    expect(await withdrawProposal(sql, f.t, p2.id)).toEqual({ ok: true });
    expect((await statusOf(sql, original)).status).toBe('confirmed');
    expect((await lessonsForStudent(sql, f.child)).map((l) => l.id)).toEqual([original]);
  });

  it('authorisation: unrelated parent, unlinked teacher, another child, and a child account are refused as not found', async () => {
    const f = await family(sql);
    const other = await family(sql);
    const strangerTeacher = await teacher(sql, 'Mr Iyer');
    const original = await booked(sql, f, at(0));
    expect(await moveTarget(sql, { id: other.parent, role: 'parent' }, original)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await moveTarget(sql, { id: strangerTeacher, role: 'teacher' }, original)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await moveTarget(sql, { id: other.t, role: 'teacher' }, original)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    // A child can never move a lesson: not a parent of anyone.
    expect(await moveTarget(sql, { id: f.child, role: 'parent' }, original)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await moveTarget(sql, { id: f.child, role: 'teacher' }, original)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await moveByParent(sql, f, original, at(DAY / MIN), 30, f.parent).then((r) => r.ok)).toBe(true);
    // Cross-family: another parent's request naming this lesson is refused, nothing written.
    const r = await requestLesson(sql, other.parent, {
      replacesLessonId: original,
      childId: other.child,
      teacherId: other.t,
      subject: 'maths',
      minutes: '30',
      startsAt: at(2 * (DAY / MIN)).toISOString(),
      priceMinor: '30000',
      currency: 'INR',
      basis: 'listed',
    });
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    // Another parent of an unrelated child can't answer this family's move.
    const p = await moveByTeacher(sql, f, original, at(3 * (DAY / MIN)));
    expect(p).toEqual({ ok: false, reason: 'change_open' });
  });

  it('one open change per lesson; too soon, ended, closed lessons are not movable', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0));
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN));
    expect(p.ok).toBe(true);
    expect(await moveByTeacher(sql, f, original, at(DAY / MIN + 60))).toEqual({ ok: false, reason: 'change_open' });
    expect(await moveTarget(sql, { id: f.parent, role: 'parent' }, original)).toEqual({
      ok: false,
      reason: 'change_open',
    });
    // Rule 1 at the application: within 30 minutes of the start (the database decides with its clock too).
    const f2 = await family(sql);
    const o2 = await booked(sql, f2, at(0));
    expect(await moveTarget(sql, { id: f2.parent, role: 'parent' }, o2, new Date(at(0).getTime() - 30 * MIN))).toEqual({
      ok: false,
      reason: 'too_soon',
    });
    expect(
      (await moveTarget(sql, { id: f2.parent, role: 'parent' }, o2, new Date(at(0).getTime() - 31 * MIN))).ok,
    ).toBe(true);
    // A cancelled lesson isn't movable.
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f2.parent} WHERE id = ${o2}`;
    expect(await moveTarget(sql, { id: f2.parent, role: 'parent' }, o2)).toEqual({ ok: false, reason: 'not_movable' });
  });

  it('refusal mapping: an unmappable request refuses the move; nothing changes and the change stays open', async () => {
    const f = await family(sql);
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO books (owner_id, title, subject, form, status) VALUES (${f.parent}, 'Maths sample', 'maths', 'chapter_files', 'published')
      RETURNING id`;
    const ch: string[] = [];
    for (const [i, title] of ['Fractions', 'Decimals'].entries())
      ch.push(
        (
          await sql<
            { id: string }[]
          >`INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${title}) RETURNING id`
        )[0]!.id,
      );
    await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${f.child})`;
    const p0 = await proposeLesson(sql, f.t, {
      childId: f.child,
      subject: 'maths',
      date: ymd(at(0)),
      time: hm(at(0)),
      minutes: '30',
      planned: [{ chapterId: ch[0]!, intent: 'new' }],
    });
    if (!p0.ok) throw new Error(p0.reason);
    expect(await answerProposal(sql, f.parent, p0.id, 'accept')).toEqual({ ok: true });
    // G-4 (DEF-TL4-13): with the request already open, a move whose own chapters leave out Fractions
    // is refused when it is proposed, before anything is sent; with Fractions, or with no chapters
    // of its own (the lesson's move with it), it may be sent.
    expect((await requestMaterial(sql, f.t, { lessonId: p0.id, position: 1 })).ok).toBe(true);
    expect(
      await moveByTeacher(sql, f, p0.id, at(DAY / MIN), { planned: [{ chapterId: ch[1]!, intent: 'new' }] }),
    ).toEqual({ ok: false, reason: 'move_drops_requested' });
    expect((await sql`SELECT 1 FROM lessons WHERE replaces_lesson_id = ${p0.id}`).length).toBe(0);
    const withIt = await moveByTeacher(sql, f, p0.id, at(DAY / MIN), {
      planned: [
        { chapterId: ch[1]!, intent: 'new' },
        { chapterId: ch[0]!, intent: 'revise' },
      ],
    });
    expect(withIt.ok).toBe(true);
    if (!withIt.ok) return;
    expect(await withdrawProposal(sql, f.t, withIt.id)).toMatchObject({ ok: true });
    // The swap still decides: a request raised AFTER the move was sent can't be carried (M4).
    const [open] = await sql<{ id: string }[]>`SELECT id FROM material_requests WHERE lesson_id = ${p0.id}`;
    expect(await withdrawMaterialRequest(sql, f.t, open!.id)).toMatchObject({ ok: true });
    const p = await moveByTeacher(sql, f, p0.id, at(DAY / MIN + 60), {
      planned: [{ chapterId: ch[1]!, intent: 'new' }],
    });
    if (!p.ok) throw new Error(p.reason);
    expect((await requestMaterial(sql, f.t, { lessonId: p0.id, position: 1 })).ok).toBe(true);
    expect(await answerProposal(sql, f.parent, p.id, 'accept')).toEqual({ ok: false, reason: 'move_unmappable' });
    expect((await statusOf(sql, p0.id)).status).toBe('confirmed');
    expect((await statusOf(sql, p.id)).status).toBe('proposed');
    expect((await sql`SELECT 1 FROM lesson_reschedules WHERE original_lesson_id = ${p0.id}`).length).toBe(0);
    expect((await notices(sql, f.t, p.id)).map((n) => n.type)).not.toContain('lesson_moved');
  });

  it('refusal mapping: more than five open requests on the new lesson (per-lesson limit) refuses the move', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0));
    expect((await requestMaterial(sql, f.t, { lessonId: original, description: 'Old notes' })).ok).toBe(true);
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN));
    if (!p.ok) throw new Error(p.reason);
    for (const n of [1, 2, 3, 4, 5])
      expect((await requestMaterial(sql, f.t, { lessonId: p.id, description: `Sheet ${n}` })).ok).toBe(true);
    expect(await answerProposal(sql, f.parent, p.id, 'accept')).toEqual({ ok: false, reason: 'move_limit' });
    expect((await statusOf(sql, original)).status).toBe('confirmed');
  });

  it('the teacher can’t add planned chapters when accepting a parent’s move (Q-B)', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0));
    const r = await moveByParent(sql, f, original, at(DAY / MIN));
    if (!r.ok) throw new Error(r.reason);
    expect(
      await answerLesson(sql, f.t, r.id, 'accept', '', new Date(), {
        planned: [{ chapterId: '00000000-0000-4000-8000-000000000001', intent: null }],
      }),
    ).toEqual({ ok: false, reason: 'move_chapters' });
    expect((await statusOf(sql, original)).status).toBe('confirmed');
  });

  it('AC-20: a change counts towards the existing open limits (10 requests per parent; 10 proposals per teacher and child)', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0));
    for (let i = 1; i <= 10; i += 1) {
      const r = await requestLesson(sql, f.parent, await slotFor(f, at(DAY / MIN + i * 60)));
      expect(r.ok).toBe(true);
    }
    expect(await moveByParent(sql, f, original, at(2 * (DAY / MIN) + 600))).toEqual({ ok: false, reason: 'limit' });
    const g = await family(sql);
    const o2 = await booked(sql, g, at(0));
    for (let i = 1; i <= 10; i += 1) {
      const r = await proposeLesson(sql, g.t, {
        childId: g.child,
        subject: 'maths',
        date: ymd(at(DAY / MIN + i * 60)),
        time: hm(at(DAY / MIN + i * 60)),
        minutes: '30',
      });
      expect(r.ok).toBe(true);
    }
    expect(await moveByTeacher(sql, g, o2, at(2 * (DAY / MIN) + 600))).toEqual({ ok: false, reason: 'limit' });
    expect((await statusOf(sql, o2)).status).toBe('confirmed');
  }, 60_000);

  it('maps every TL-4 refusal message to a reason (including the per-parent rule, which a one-for-one carry cannot trigger)', () => {
    const m = (message: string) => moveFailureFromDb({ message });
    expect(
      m(
        'material_request_parent_limit: a parent would have more open material requests than allowed (before 5, after 6)',
      ),
    ).toBe('move_parent_limit');
    expect(m('material_request_limit: the new lesson would have more than five open material requests')).toBe(
      'move_limit',
    );
    expect(m('material_request_unmappable: a material request is about a chapter that is not on the new lesson')).toBe(
      'move_unmappable',
    );
    expect(m('the lesson was cancelled or changed meanwhile')).toBe('original_changed');
    expect(m('the lesson starts too soon to move')).toBe('too_soon');
    expect(m('only a confirmed lesson at least 30 minutes away can be moved')).toBe('too_soon');
    expect(m('the time overlaps a confirmed lesson')).toBeNull();
  });

  it('DEF-TL4-07 (PO decision 3 Nov 2026, Option B): a teacher move may overlap only its own original; any other overlap is still refused', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0), 40);
    // 10:30 overlaps only the lesson being moved (10:00-10:40): allowed, and the swap commits.
    const p = await moveByTeacher(sql, f, original, at(30));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(await answerProposal(sql, f.parent, p.id, 'accept')).toEqual({ ok: true });
    expect(await statusOf(sql, original)).toEqual({ status: 'cancelled', close_reason: 'rescheduled' });
    expect((await statusOf(sql, p.id)).status).toBe('confirmed');
    // Another child's confirmed lesson with the same teacher still blocks a move over it.
    const g = await family(sql, f.t);
    await booked(sql, g, at(4 * 60), 30);
    const other = await booked(sql, f, at(6 * 60), 30);
    expect(await moveByTeacher(sql, f, other, at(4 * 60 + 15))).toEqual({ ok: false, reason: 'busy' });
  });
});

/** An ordinary request (not a move) at a given time, priced by the database's own rule. */
async function slotFor(f: Fam, start: Date) {
  const free = await freeTimes(sql, f.parent, {
    childId: f.child,
    teacherId: f.t,
    subject: 'maths',
    minutes: 30,
    parentZone: 'UTC',
  });
  if (!free.ok) throw new Error(free.reason);
  const s = free.days.flatMap((d) => d.times).find((x) => x.startsAt.getTime() === start.getTime());
  if (!s) throw new Error(`not offered: ${start.toISOString()}`);
  return {
    childId: f.child,
    teacherId: f.t,
    subject: 'maths',
    minutes: '30',
    startsAt: s.startsAt.toISOString(),
    priceMinor: String(s.priceMinor),
    currency: s.currency,
    basis: s.basis,
  };
}

// =========================================================================== evidence gaps and PO decisions (3 Nov 2026)
describe('TL-4 app: expired moves, meeting links, Now/New, DEF-TL4-08/09, F-2 (with the TL-4 SQL)', () => {
  /** Puts an open change past its deadline (as tl4Final AC-5 does; test database only). */
  const overdue = (id: string) =>
    sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL session_replication_role = replica`);
      await tx`UPDATE lessons SET requested_at = now() - interval '50 hours', reply_deadline = now() - interval '3 hours' WHERE id = ${id}`;
    });

  it('expired move (teacher-proposed): both sides see it expired; accepting is refused as expired; the original stays booked; one expiry notice each, never repeated', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(0));
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN));
    if (!p.ok) throw new Error(p.reason);
    await overdue(p.id);
    // Before any sweep: shown as expired at once to both sides.
    const pv = (await lessonsForParent(sql, f.parent)).find((l) => l.id === p.id)!;
    const tv = (await lessonsForTeacher(sql, f.t)).find((l) => l.id === p.id)!;
    expect([pv.status, tv.status]).toEqual(['expired', 'expired']);
    expect(lessonStatusText(pv, 'parent').text).toBe('Expired: no answer in time');
    expect(pv.canAnswer || tv.canAnswer).toBe(false);
    expect(await answerProposal(sql, f.parent, p.id, 'accept')).toMatchObject({ ok: false, reason: 'expired' });
    expect(await statusOf(sql, original)).toEqual({ status: 'confirmed', close_reason: null });
    const ov = (await lessonsForParent(sql, f.parent)).find((l) => l.id === original)!;
    expect([ov.status, ov.changePending, ov.canMove]).toEqual(['confirmed', false, true]);
    // The sweep records it and tells each side once; a second sweep adds nothing.
    await lessonMaintenance(sql);
    await lessonMaintenance(sql);
    expect((await statusOf(sql, p.id)).status).toBe('expired');
    for (const who of [f.t, f.parent, f.parent2])
      expect((await notices(sql, who, p.id)).filter((n) => n.type === 'lesson_change_expired')).toHaveLength(1);
    // A new move can start straight away.
    expect((await moveByTeacher(sql, f, original, at(DAY / MIN + 60))).ok).toBe(true);
  });

  it('expired move (parent-requested): the teacher can no longer accept it; the original stays booked', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(2 * 60));
    const r = await moveByParent(sql, f, original, at(DAY / MIN + 120));
    if (!r.ok) throw new Error(r.reason);
    await overdue(r.id);
    expect((await lessonsForTeacher(sql, f.t)).find((l) => l.id === r.id)?.status).toBe('expired');
    expect(await answerLesson(sql, f.t, r.id, 'accept')).toMatchObject({ ok: false, reason: 'expired' });
    expect(await statusOf(sql, original)).toEqual({ status: 'confirmed', close_reason: null });
  });

  it('meeting link: the move removes the old link; the new lesson has none and the teacher prompt applies; nothing is copied', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(3 * 60));
    expect((await allowMeetingLinks(sql, f.parent, f.t, f.child)).ok).toBe(true);
    expect((await setMeetingLink(sql, f.t, original, 'https://zoom.us/wc/join/81234567890')).ok).toBe(true);
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN + 180));
    if (!p.ok) throw new Error(p.reason);
    expect(await answerProposal(sql, f.parent, p.id, 'accept')).toEqual({ ok: true });
    expect((await sql`SELECT 1 FROM lesson_meeting_links WHERE lesson_id IN (${original}, ${p.id})`).length).toBe(0);
    const nv = (await lessonsForTeacher(sql, f.t)).find((l) => l.id === p.id)!;
    // The schedule page shows its prompt exactly when: moved, upcoming, confirmed, no link yet.
    expect([nv.status, nv.movedFrom !== null, nv.meeting.added, nv.meeting.allowed]).toEqual([
      'confirmed',
      true,
      false,
      true,
    ]);
    const moved = (await notices(sql, f.t, p.id)).find((n) => n.type === 'lesson_moved');
    expect(moved?.body).toMatch(/meeting link for the new time/);
  });

  it('Now/New: an open move carries the booked lesson’s length and price; the replacement its own (information only)', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(4 * 60), 30);
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN + 240), { minutes: '40' });
    if (!p.ok) throw new Error(p.reason);
    const v = await lessonForParent(sql, f.parent, p.id);
    expect(v?.movedFromLesson).toEqual({ minutes: 30, priceMinor: 30000, currency: 'INR' });
    expect([v?.minutes, v?.price?.priceMinor]).toEqual([40, 40000]);
    // A child never gets prices or the moved-from details.
    expect((await lessonsForStudent(sql, f.child)).every((l) => l.movedFromLesson === null)).toBe(true);
  });

  it('DEF-TL4-09: the review for a move shows the booked lesson and the new time, length and price; nothing is written; a changed price is refused at send', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(5 * 60), 30);
    const input = {
      replacesLessonId: original,
      childId: '',
      subject: '',
      date: ymd(at(DAY / MIN + 300)),
      time: hm(at(DAY / MIN + 300)),
      minutes: '40',
    };
    const before = await sql`SELECT count(*)::int AS n FROM lessons`;
    const r = await reviewProposal(sql, f.t, input);
    if (!r.ok) throw new Error(r.reason);
    expect(r.review.moving).toMatchObject({ minutes: 30, priceMinor: 30000, currency: 'INR' });
    expect([r.review.minutes, r.review.price.priceMinor]).toEqual([40, 40000]);
    expect(await sql`SELECT count(*)::int AS n FROM lessons`).toEqual(before);
    // Overlapping only its own original is fine on the review too (DEF-TL4-07).
    const own = await reviewProposal(sql, f.t, { ...input, date: ymd(at(5 * 60 + 15)), time: hm(at(5 * 60 + 15)) });
    expect(own.ok).toBe(true);
    // Sending a price other than the database's is refused, exactly as TL-3.
    expect(await proposeLesson(sql, f.t, { ...input, shown: { basis: 'listed', priceMinor: '1' } })).toEqual({
      ok: false,
      reason: 'price_changed',
    });
    expect(
      (
        await proposeLesson(sql, f.t, {
          ...input,
          shown: { basis: r.review.price.basis, priceMinor: String(r.review.price.priceMinor) },
        })
      ).ok,
    ).toBe(true);
  });

  it('DEF-TL4-08: a parent cancels the original: the teacher’s open move closes in the same step as original_cancelled; one notice to the teacher and to the other parent (R3-1); history kept', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(6 * 60));
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN + 360));
    if (!p.ok) throw new Error(p.reason);
    expect(await cancelLesson(sql, { id: f.parent, role: 'parent' }, original)).toEqual({ ok: true });
    expect(await statusOf(sql, original)).toEqual({ status: 'cancelled', close_reason: null });
    expect(await statusOf(sql, p.id)).toEqual({ status: 'declined', close_reason: 'original_cancelled' });
    for (const [viewer, list] of [
      ['parent', await lessonsForParent(sql, f.parent)],
      ['teacher', await lessonsForTeacher(sql, f.t)],
    ] as const) {
      const v = list.find((l) => l.id === p.id)!;
      expect(lessonStatusText(v, viewer).text).toBe('Closed: lesson cancelled');
      expect(closeReasonText(v.closeReason)).toMatch(/lesson it would move was cancelled/);
      expect(v.canAnswer || v.canWithdraw).toBe(false);
    }
    expect((await notices(sql, f.t, p.id)).map((n) => n.type)).toEqual(['lesson_change_closed']);
    // Review R3-1: the other parent, who had the move to answer, is told once; the parent who
    // cancelled is not.
    expect((await notices(sql, f.parent2, p.id)).filter((n) => n.type === 'lesson_change_closed')).toHaveLength(1);
    expect((await notices(sql, f.parent, p.id)).map((n) => n.type)).not.toContain('lesson_change_closed');
    expect((await notices(sql, f.t, original)).map((n) => n.type)).toContain('lesson_cancelled');
    expect(await answerProposal(sql, f.parent2, p.id, 'accept')).toMatchObject({ ok: false });
  });

  it('DEF-TL4-08: the teacher cancels the original: the parent’s open move closes; both parents are told once; the teacher (who acted) is not', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(7 * 60));
    const r = await moveByParent(sql, f, original, at(DAY / MIN + 420));
    if (!r.ok) throw new Error(r.reason);
    expect(await cancelLesson(sql, { id: f.t, role: 'teacher' }, original)).toEqual({ ok: true });
    expect(await statusOf(sql, r.id)).toEqual({ status: 'declined', close_reason: 'original_cancelled' });
    for (const who of [f.parent, f.parent2])
      expect((await notices(sql, who, r.id)).filter((n) => n.type === 'lesson_change_closed')).toHaveLength(1);
    expect((await notices(sql, f.t, r.id)).map((n) => n.type)).not.toContain('lesson_change_closed');
  });

  it('DEF-TL4-08: AA Pro closes for a deactivated teacher: the original and its move both close without error, the move once', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(8 * 60));
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN + 480));
    if (!p.ok) throw new Error(p.reason);
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${f.t}`;
    await sql.begin((tx) => closeLessonsWithoutLink(tx, { teacherId: f.t }));
    expect(await statusOf(sql, original)).toEqual({ status: 'cancelled', close_reason: 'teacher_deactivated' });
    expect((await statusOf(sql, p.id)).status).toBe('declined');
    for (const who of [f.parent, f.parent2])
      expect((await notices(sql, who, p.id)).filter((n) => n.type === 'lesson_change_closed')).toHaveLength(1);
  });

  it('DEF-TL4-08 atomicity: a cancellation and an acceptance racing: exactly one wins, never both; no deadlock reaches the user', async () => {
    for (let i = 0; i < 6; i += 1) {
      const f = await family(sql);
      const original = await booked(sql, f, at(9 * 60 + i * 60));
      const p = await moveByTeacher(sql, f, original, at(DAY / MIN + 540 + i * 60));
      if (!p.ok) throw new Error(p.reason);
      const [c, a] = await Promise.all([
        cancelLesson(sql, { id: f.parent2, role: 'parent' }, original),
        answerProposal(sql, f.parent, p.id, 'accept'),
      ]);
      const o = await statusOf(sql, original);
      const m = await statusOf(sql, p.id);
      if (c.ok) {
        expect(a.ok).toBe(false);
        expect(o).toEqual({ status: 'cancelled', close_reason: null });
        expect(m).toEqual({ status: 'declined', close_reason: 'original_cancelled' });
      } else {
        expect(a).toEqual({ ok: true });
        expect(c).toEqual({ ok: false, reason: 'closed' });
        expect(o).toEqual({ status: 'cancelled', close_reason: 'rescheduled' });
        expect(m.status).toBe('confirmed');
      }
    }
  });

  it('F-2: a parent’s move can’t get planned chapters at acceptance; the database refusal maps to a plain reason; ordinary requests unchanged', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(16 * 60));
    const r = await moveByParent(sql, f, original, at(DAY / MIN + 960));
    if (!r.ok) throw new Error(r.reason);
    expect(
      await answerLesson(sql, f.t, r.id, 'accept', '', new Date(), {
        planned: [{ chapterId: '00000000-0000-4000-8000-000000000001', intent: null }],
      }),
    ).toEqual({ ok: false, reason: 'move_chapters' });
    // Straight to the database (bypassing the app): refused with the F-2 message, mapped the same way.
    const err = await sql
      .begin(async (tx) => {
        await tx`UPDATE lessons SET status = 'confirmed' WHERE id = ${r.id}`;
        await tx`INSERT INTO lesson_chapters (lesson_id, position, source, topic) VALUES (${r.id}, 5, 'planned', 'x')`;
      })
      .catch((e: unknown) => e);
    expect(moveFailureFromDb(err)).toBe('move_chapters');
    expect(await statusOf(sql, original)).toEqual({ status: 'confirmed', close_reason: null });
    expect(await answerLesson(sql, f.t, r.id, 'accept')).toEqual({ ok: true });
  });
});

describe('TL-4 app vs the consolidated SQL: independent re-review R2-1 and R2-2', () => {
  it('R2-1: removing the teacher (deactivation sweep) when the original sorts BEFORE its open move: no abort; both close; the move once', async () => {
    // Repeat until the uuid order is original < move (the order that aborted before the fix).
    for (let i = 0; i < 12; i += 1) {
      const f = await family(sql);
      const original = await booked(sql, f, at(18 * 60));
      const p = await moveByTeacher(sql, f, original, at(DAY / MIN + 1080));
      if (!p.ok) throw new Error(p.reason);
      if (original > p.id) continue;
      await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${f.t}`;
      await sql.begin((tx) => closeLessonsWithoutLink(tx, { teacherId: f.t }));
      expect(await statusOf(sql, original)).toEqual({ status: 'cancelled', close_reason: 'teacher_deactivated' });
      expect(await statusOf(sql, p.id)).toEqual({ status: 'declined', close_reason: 'original_cancelled' });
      for (const who of [f.parent, f.parent2]) {
        const closedNotes = (await notices(sql, who, p.id)).filter((n) => n.type === 'lesson_change_closed');
        expect(closedNotes).toHaveLength(1);
      }
      return;
    }
    throw new Error('no original < move order produced in 12 tries');
  });

  it('R2-1: a parent removing the link (link_ended) closes a parent’s open move and its original without abort, in either order', async () => {
    for (let i = 0; i < 4; i += 1) {
      const f = await family(sql);
      const original = await booked(sql, f, at(20 * 60 + i * 60));
      const r = await moveByParent(sql, f, original, at(DAY / MIN + 1200 + i * 60));
      if (!r.ok) throw new Error(r.reason);
      await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE teacher_id = ${f.t} AND student_id = ${f.child}`;
      await sql.begin((tx) => closeLessonsWithoutLink(tx, { teacherId: f.t }));
      expect((await statusOf(sql, original)).status).toBe('cancelled');
      expect((await statusOf(sql, r.id)).status).toBe('declined');
    }
  });

  it('R2-3: cancelling a lesson with an open move takes the acceptance lock order (time locks before any row), so it can’t deadlock with an acceptance', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(24 * 60));
    const p = await moveByTeacher(sql, f, original, at(DAY / MIN + 1440));
    if (!p.ok) throw new Error(p.reason);
    // Session A holds the teacher and child time locks, as an acceptance does first.
    const a = await sql.reserve();
    const probe = await sql.reserve();
    try {
      await a`BEGIN`;
      await a`SELECT pg_advisory_xact_lock(hashtextextended(${`aa_pro.lesson_times.teacher:${f.t}`}, 0))`;
      await a`SELECT pg_advisory_xact_lock(hashtextextended(${`aa_pro.lesson_times.child:${f.child}`}, 0))`;
      const cancel = cancelLesson(sql, { id: f.parent, role: 'parent' }, original);
      // The cancellation waits on the time locks...
      let waiting = false;
      for (let i = 0; i < 50 && !waiting; i += 1) {
        const [w] = await probe<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        waiting = w!.n > 0;
        if (!waiting) await new Promise((r) => setTimeout(r, 100));
      }
      expect(waiting).toBe(true);
      // ...holding no row lock yet: an acceptance could take both rows now.
      await probe`BEGIN`;
      await expect(
        probe`SELECT 1 FROM lessons WHERE id IN (${original}, ${p.id}) FOR UPDATE NOWAIT`,
      ).resolves.toHaveLength(2);
      await probe`ROLLBACK`;
      await a`ROLLBACK`;
      expect(await cancel).toEqual({ ok: true });
    } finally {
      await a`ROLLBACK`.catch(() => {});
      await probe`ROLLBACK`.catch(() => {});
      a.release();
      probe.release();
    }
    expect(await statusOf(sql, p.id)).toEqual({ status: 'declined', close_reason: 'original_cancelled' });
  });

  it('R2-2: the overlap sweep leaves a move that overlaps only its own original (teacher DEF-TL4-07, and a parent’s); another overlap still closes', async () => {
    const f = await family(sql);
    const original = await booked(sql, f, at(26 * 60), 40);
    const teacherMove = await moveByTeacher(sql, f, original, at(26 * 60 + 30));
    if (!teacherMove.ok) throw new Error(teacherMove.reason);
    const g = await family(sql);
    const gOriginal = await booked(sql, g, at(28 * 60), 40);
    const parentMove = await moveByParent(sql, g, gOriginal, at(28 * 60 + 30));
    if (!parentMove.ok) throw new Error(parentMove.reason);
    await sql.begin((tx) => closeLeftoverOverlaps(tx, new Date()));
    expect((await statusOf(sql, teacherMove.id)).status).toBe('proposed');
    expect((await statusOf(sql, parentMove.id)).status).toBe('requested');
    // Both can still be accepted and swap.
    expect(await answerProposal(sql, f.parent, teacherMove.id, 'accept')).toEqual({ ok: true });
    expect(await answerLesson(sql, g.t, parentMove.id, 'accept')).toEqual({ ok: true });
    // A move over ANOTHER confirmed lesson (here: of the same child, another teacher) still closes.
    const h = await family(sql);
    const hOriginal = await booked(sql, h, at(30 * 60), 30);
    const hMove = await moveByParent(sql, h, hOriginal, at(DAY / MIN + 1800));
    if (!hMove.ok) throw new Error(hMove.reason);
    const otherTeacher = await teacher(sql, 'Mr Iyer');
    await activeLink(sql, { teacher: otherTeacher, child: h.child, parent: h.parent, subjects: ['maths'] });
    const blocker = await booked(sql, { ...h, t: otherTeacher }, at(DAY / MIN + 1800), 30);
    expect((await statusOf(sql, blocker)).status).toBe('confirmed');
    await sql.begin((tx) => closeLeftoverOverlaps(tx, new Date()));
    expect(await statusOf(sql, hMove.id)).toEqual({ status: 'declined', close_reason: 'time_no_longer_free' });
  });
});

// =========================================================================== review R3 (controlled order)
/**
 * Independent re-review, findings R3-1 to R3-3, and the R2-1/R2-3 tests with BOTH lesson-id orders
 * fixed (lessons_lock_pair and the sweep lock the lower id first, so id order decides who waits for
 * whom). Lessons are written straight to the database with chosen ids; races are forced with a gate
 * session; deadlocks are counted from pg_stat_database, because retrying() hides them.
 */
describe('TL-4 app vs the consolidated SQL: review R3-1 to R3-3, both id orders fixed', () => {
  const idWith = (first: string) => {
    const h = (first + uniq() + uniq() + uniq() + uniq()).slice(0, 32);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  const ORDERS = [
    ['original < move', '1', 'f'],
    ['move < original', 'f', '1'],
  ] as const;
  let slot = 0;
  /** A fresh start time per lesson, so nothing overlaps between tests. */
  const next = () => at((2 * DAY) / MIN + (slot += 90));
  async function confirmedRaw(f: Fam, id: string) {
    const start = next();
    await sql`INSERT INTO lessons (id, teacher_id, student_id, subject, starts_at, minutes, status, proposed_by)
              VALUES (${id}, ${f.t}, ${f.child}, 'maths', ${start}, 30, 'proposed', ${f.t})`;
    await sql`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent} WHERE id = ${id}`;
    return id;
  }
  async function teacherMoveRaw(f: Fam, o: string, id: string) {
    await sql`INSERT INTO lessons (id, teacher_id, student_id, subject, starts_at, minutes, status, proposed_by, replaces_lesson_id)
              VALUES (${id}, ${f.t}, ${f.child}, 'maths', ${next()}, 30, 'proposed', ${f.t}, ${o})`;
    return id;
  }
  async function parentMoveRaw(f: Fam, o: string, id: string) {
    await sql`INSERT INTO lessons (id, teacher_id, student_id, subject, starts_at, minutes, status, requested_by, replaces_lesson_id)
              VALUES (${id}, ${f.t}, ${f.child}, 'maths', ${next()}, 30, 'requested', ${f.parent}, ${o})`;
    return id;
  }
  /** Past its reply deadline but not yet swept (database triggers off for this one setup write). */
  async function makeOverdue(id: string) {
    await sql.begin(async (t) => {
      await t.unsafe('SET LOCAL session_replication_role = replica');
      await t`UPDATE lessons SET requested_at = now() - interval '50 hours', reply_deadline = now() - interval '2 hours'
              WHERE id = ${id}`;
    });
  }
  const closedNotices = async (entity: string, recipient: string) =>
    (await notices(sql, recipient, entity)).filter((n) => n.type === 'lesson_change_closed').length;
  async function deadlocks() {
    await new Promise((r) => setTimeout(r, 1200)); // statistics are flushed at most once a second
    await sql`SELECT pg_stat_clear_snapshot()`;
    return Number(
      (await sql<{ n: string }[]>`SELECT deadlocks::text AS n FROM pg_stat_database WHERE datname = ${name}`)[0]!.n,
    );
  }
  async function waiting(n: number) {
    await expect
      .poll(
        async () =>
          (
            await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity
                                       WHERE datname = ${name} AND wait_event_type = 'Lock'`
          )[0]!.n,
        { timeout: 10_000, interval: 25 },
      )
      .toBeGreaterThanOrEqual(n);
  }
  const settle = <T>(p: Promise<T>) =>
    p.then(
      (v) => ({ v }),
      (e: Error) => ({ e: e.message }),
    );

  for (const [label, o1, m1] of ORDERS) {
    it(`R2-1 / R3-1, ${label}: the deactivation sweep closes the original and the teacher's move without abort; each parent is told about the move exactly once`, async () => {
      const f = await family(sql);
      const o = await confirmedRaw(f, idWith(o1));
      const m = await teacherMoveRaw(f, o, idWith(m1));
      expect(o < m).toBe(label === 'original < move');
      await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${f.t}`;
      await sql.begin((tx) => closeLessonsWithoutLink(tx, { teacherId: f.t }));
      expect(await statusOf(sql, o)).toEqual({ status: 'cancelled', close_reason: 'teacher_deactivated' });
      expect((await statusOf(sql, m)).status).toBe('declined');
      for (const p of [f.parent, f.parent2]) expect(await closedNotices(m, p)).toBe(1);
      expect(await closedNotices(m, f.t)).toBe(0); // the deactivated teacher is not told
    });

    it(`R2-1 / R3-1, ${label}: link removal closes the original and a parent's move without abort; the teacher and each parent are told about the move exactly once`, async () => {
      const f = await family(sql);
      const o = await confirmedRaw(f, idWith(o1));
      const m = await parentMoveRaw(f, o, idWith(m1));
      await sql.begin(async (tx) => {
        await tx`UPDATE teacher_student_links SET status = 'removed', removed_at = now()
                 WHERE teacher_id = ${f.t} AND student_id = ${f.child}`;
        await closeLessonsWithoutLink(tx, { studentId: f.child });
      });
      expect(await statusOf(sql, o)).toEqual({ status: 'cancelled', close_reason: 'link_ended' });
      expect((await statusOf(sql, m)).status).toBe('declined');
      for (const p of [f.t, f.parent, f.parent2]) expect(await closedNotices(m, p)).toBe(1);
    });

    for (const first of ['cancel', 'accept'] as const) {
      it(`R2-3, ${label}, ${first} first (forced with a gate on the original): no deadlock; exactly one wins`, async () => {
        const f = await family(sql);
        const o = await confirmedRaw(f, idWith(o1));
        const m = await teacherMoveRaw(f, o, idWith(m1));
        const before = await deadlocks();
        const g = await sql.reserve();
        let c: unknown;
        let a: unknown;
        try {
          await g`BEGIN`;
          await g`SELECT 1 FROM lessons WHERE id = ${o} FOR UPDATE`;
          const doCancel = () => settle(cancelLesson(sql, { id: f.parent2, role: 'parent' }, o));
          const doAccept = () => settle(answerProposal(sql, f.parent, m, 'accept'));
          const p1 = first === 'cancel' ? doCancel() : doAccept();
          await waiting(1);
          const p2 = first === 'cancel' ? doAccept() : doCancel();
          await waiting(2);
          await g`ROLLBACK`;
          const [x, y] = await Promise.all([p1, p2]);
          [c, a] = first === 'cancel' ? [x, y] : [y, x];
        } finally {
          await g`ROLLBACK`.catch(() => {});
          g.release();
        }
        if (first === 'cancel') {
          expect(c).toEqual({ v: { ok: true } });
          expect(await statusOf(sql, m)).toEqual({ status: 'declined', close_reason: 'original_cancelled' });
        } else {
          expect(a).toEqual({ v: { ok: true } });
          expect(c).toEqual({ v: { ok: false, reason: 'closed' } });
          expect(await statusOf(sql, o)).toEqual({ status: 'cancelled', close_reason: 'rescheduled' });
        }
        expect(await deadlocks()).toBe(before);
      });
    }
  }

  it('R3-2: a new move proposal that expires an overdue move, racing a cancellation: no deadlock; refused as "changed meanwhile", not "too soon"', async () => {
    const f = await family(sql);
    const o = await confirmedRaw(f, idWith('8'));
    const old = await teacherMoveRaw(f, o, idWith('8'));
    await makeOverdue(old);
    const before = await deadlocks();
    const g = await sql.reserve();
    let res: unknown;
    try {
      // The gate holds the teacher and child time locks, as an acceptance in progress would.
      await g`BEGIN`;
      await g`SELECT lessons_lock_times(${f.t}, ${f.child})`;
      const pc = settle(cancelLesson(sql, { id: f.parent2, role: 'parent' }, o));
      await waiting(1);
      const start = next();
      const pp = settle(
        proposeLesson(sql, f.t, {
          replacesLessonId: o,
          childId: '',
          subject: '',
          date: ymd(start),
          time: hm(start),
          minutes: '30',
        }),
      );
      await waiting(2);
      await g`ROLLBACK`;
      res = await Promise.all([pc, pp]);
    } finally {
      await g`ROLLBACK`.catch(() => {});
      g.release();
    }
    expect(res).toEqual([{ v: { ok: true } }, { v: { ok: false, reason: 'original_changed' } }]);
    expect(await deadlocks()).toBe(before);
    expect(await statusOf(sql, old)).toEqual({ status: 'declined', close_reason: 'original_cancelled' });
  });

  it('R3-2: a parent move request that expires an overdue move, racing a cancellation: no deadlock; refused as "changed meanwhile"', async () => {
    const f = await family(sql);
    const o = await confirmedRaw(f, idWith('1'));
    const old = await teacherMoveRaw(f, o, idWith('f'));
    await makeOverdue(old);
    const start = next();
    const before = await deadlocks();
    const g = await sql.reserve();
    let res: unknown;
    try {
      await g`BEGIN`;
      await g`SELECT lessons_lock_times(${f.t}, ${f.child})`;
      const pc = settle(cancelLesson(sql, { id: f.parent2, role: 'parent' }, o));
      await waiting(1);
      const pr = settle(
        requestLesson(sql, f.parent, {
          replacesLessonId: o,
          childId: '',
          teacherId: '',
          subject: '',
          minutes: '30',
          startsAt: start.toISOString(),
          priceMinor: '30000',
          currency: 'INR',
          basis: 'listed',
        }),
      );
      await waiting(2);
      await g`ROLLBACK`;
      res = await Promise.all([pc, pr]);
    } finally {
      await g`ROLLBACK`.catch(() => {});
      g.release();
    }
    expect(res).toEqual([{ v: { ok: true } }, { v: { ok: false, reason: 'original_changed' } }]);
    expect(await deadlocks()).toBe(before);
  });

  for (const [label, o1, m1] of ORDERS) {
    it(`R3-3, ${label}: the deactivation sweep and a cancellation, with an OVERDUE open move: no deadlock; one closes the lesson, the other finds it closed`, async () => {
      const f = await family(sql);
      const o = await confirmedRaw(f, idWith(o1));
      const m = await teacherMoveRaw(f, o, idWith(m1));
      await makeOverdue(m);
      await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${f.t}`;
      const before = await deadlocks();
      const g = await sql.reserve();
      let res: unknown;
      try {
        // Gate on the original: the sweep queues first, then the cancellation.
        await g`BEGIN`;
        await g`SELECT 1 FROM lessons WHERE id = ${o} FOR UPDATE`;
        const ps = settle(sql.begin((tx) => closeLessonsWithoutLink(tx, { teacherId: f.t })));
        await waiting(1);
        const pc = settle(cancelLesson(sql, { id: f.parent2, role: 'parent' }, o));
        await waiting(2);
        await g`ROLLBACK`;
        res = await Promise.all([ps, pc]);
      } finally {
        await g`ROLLBACK`.catch(() => {});
        g.release();
      }
      expect(res).toEqual([{ v: 1 }, { v: { ok: false, reason: 'closed' } }]);
      expect(await statusOf(sql, o)).toEqual({ status: 'cancelled', close_reason: 'teacher_deactivated' });
      expect(await statusOf(sql, m)).toEqual({ status: 'declined', close_reason: 'original_cancelled' });
      expect(await deadlocks()).toBe(before);
    });
  }
  for (const [label, o1, m1] of ORDERS) {
    it(`R4-1, ${label}: a new move that expires an overdue one, racing the deactivation sweep: no deadlock; the sweep completes`, async () => {
      const f = await family(sql);
      const o = await confirmedRaw(f, idWith(o1));
      const old = await teacherMoveRaw(f, o, idWith(m1));
      expect(o < old).toBe(label === 'original < move');
      await makeOverdue(old);
      const before = await deadlocks();
      const g = await sql.reserve();
      let res: unknown;
      try {
        // The gate holds 0034's per-teacher-and-child proposal lock, which the new move's INSERT takes
        // after the app has expired the overdue move. Before R4-1 the move row was then held while the
        // sweep, locking in id order, took the original: a cycle when the original's id sorts first.
        await g`BEGIN`;
        await g`SELECT pg_advisory_xact_lock(hashtextextended(${'aa_pro.lesson_proposals:' + f.t + ':' + f.child}, 0))`;
        const start = next();
        const pp = settle(
          proposeLesson(sql, f.t, {
            replacesLessonId: o,
            childId: '',
            subject: '',
            date: ymd(start),
            time: hm(start),
            minutes: '30',
          }),
        );
        await waiting(1);
        const ps = settle(
          sql.begin(async (tx) => {
            await tx`UPDATE accounts SET status = 'deactivated' WHERE id = ${f.t}`;
            return closeLessonsWithoutLink(tx, { teacherId: f.t });
          }),
        );
        await waiting(2);
        await g`ROLLBACK`;
        res = { sweep: await ps, propose: await pp };
      } finally {
        await g`ROLLBACK`.catch(() => {});
        g.release();
      }
      expect((res as { sweep: { e?: string } }).sweep.e).toBeUndefined();
      expect(await deadlocks()).toBe(before);
      expect(await statusOf(sql, o)).toEqual({ status: 'cancelled', close_reason: 'teacher_deactivated' });
      expect((await statusOf(sql, old)).status).toBe('expired');
    });
  }
  for (const [label, o1, m1] of ORDERS) {
    it(`R5-2, ${label}: a new move that expires an overdue one, racing a parent's link removal: no deadlock; all-or-nothing`, async () => {
      const f = await family(sql);
      // The gate: the first lesson in the removal sweep's id-ordered pass, held by another session,
      // so the removal holds the link and waits in its sweep while the new move arrives.
      const gate = await confirmedRaw(f, idWith('0'));
      const o = await confirmedRaw(f, idWith(o1));
      const old = await teacherMoveRaw(f, o, idWith(m1));
      await makeOverdue(old);
      const before = await deadlocks();
      const g = await sql.reserve();
      let res: unknown;
      try {
        await g`BEGIN`;
        await g`SELECT 1 FROM lessons WHERE id = ${gate} FOR UPDATE`;
        const pr = settle(removeTeacher(sql, f.parent, f.t));
        await waiting(1);
        const start = next();
        const pm = settle(
          proposeLesson(sql, f.t, {
            replacesLessonId: o,
            childId: '',
            subject: '',
            date: ymd(start),
            time: hm(start),
            minutes: '30',
          }),
        );
        await new Promise((r) => setTimeout(r, 1500));
        await g`ROLLBACK`;
        res = { remove: await pr, move: await pm };
      } finally {
        await g`ROLLBACK`.catch(() => {});
        g.release();
      }
      expect(await deadlocks()).toBe(before);
      const r = res as { remove: { v?: { ok: boolean }; e?: string } };
      expect(r.remove.e).toBeUndefined();
      // The removal went through completely: the link ended and its lessons closed.
      const [link] = await sql<
        { status: string }[]
      >`SELECT status FROM teacher_student_links WHERE teacher_id = ${f.t} AND student_id = ${f.child}`;
      expect(link!.status).not.toBe('active');
      expect((await statusOf(sql, o)).status).toBe('cancelled');
    });
  }
});
