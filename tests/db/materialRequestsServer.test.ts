import postgres from 'postgres';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { getBookForViewer } from '@/server/books';
import { answerLesson, cancelLesson, requestLesson } from '@/server/lessons';
import {
  closeEndedMaterialRequests,
  markMaterialUnavailable,
  materialRequestsFor,
  openMaterialRequestCount,
  requestMaterial,
  shareMaterial,
  shareOptions,
  withdrawMaterialRequest,
} from '@/server/materialRequests';
import { listNotifications, openNotification } from '@/server/notifications/queries';
import { runSharedSweep } from '@/server/notifications/sweep';
import { removeTeacher } from '@/server/teacherLinks';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-2 application layer (scope authorised 26 Oct 2026, 08:15 IST): the server functions behind
 * My schedule, Family calendar and Family home. These are the APPLICATION checks (who may see and
 * do what, in-app notifications, the home count, the sweep), separate from the database-level
 * tests of migration 0033 in materialRequests.test.ts. Synthetic data only, on the throw-away
 * database.
 */
const sql = testDb();
afterAll(() => sql.end());

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * 60 * MIN);
let slot = 0;

async function teacher(name = 'Ms Rao') {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC', display_name = ${name} WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, 0, 1440)`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', 60000, 30)`;
  return id;
}
async function family(t?: string, subjects = ['maths'], childName = 'Kiran') {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE accounts SET display_name = ${childName} WHERE id = ${child}`;
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']}, grade = 5 WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher());
  await activeLink(sql, { teacher: tid, child, parent, subjects });
  return { parent, parent2, child, t: tid };
}
type Fam = Awaited<ReturnType<typeof family>>;
async function book(owner: string, child: string | null, title = 'Maths Practice', subject = 'maths') {
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${owner}, ${title}, ${subject}, 'chapter_files', 'published')
    RETURNING id`;
  const chapters: string[] = [];
  for (const [i, t] of ['Fractions', 'Decimals'].entries()) {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${t}) RETURNING id`;
    chapters.push(c!.id);
  }
  if (child) await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child})`;
  return { id: b!.id, chapters };
}
async function lesson(f: Fam, chapterIds: string[] = []) {
  const start = new Date(BASE.getTime() + 60 * MIN * slot++);
  const r = await requestLesson(sql, f.parent, {
    childId: f.child,
    teacherId: f.t,
    subject: 'maths',
    priceMinor: '30000',
    currency: 'INR',
    basis: 'listed',
    startsAt: start.toISOString(),
    minutes: '30',
    chapterIds,
  });
  if (!r.ok) throw new Error(`request refused: ${r.reason}`);
  return r.id;
}
/** A confirmed lesson starting `min` minutes from now (database clock); triggers skipped for this insert only. */
const lessonIn = (f: Fam, min: number) =>
  sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${f.parent}, 'maths', s, 10, s + interval '10 minutes', s - interval '3 days',
             s - interval '3 days' + interval '48 hours', 'confirmed', s - interval '3 days' + interval '1 minute',
             'INR', 60000, 10000, 'listed'
      FROM (SELECT date_trunc('minute', now()) + make_interval(mins => ${min}) AS s) x
      RETURNING id`;
    return r!.id;
  });
const endLesson = (id: string) =>
  sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`UPDATE lessons SET requested_at = requested_at - interval '10 days', reply_deadline = reply_deadline - interval '10 days',
             confirmed_at = confirmed_at - interval '10 days', starts_at = starts_at - interval '10 days',
             ends_at = ends_at - interval '10 days' WHERE id = ${id}`;
  });
let item = 0;
/** Each call asks for a different item by default (an identical open request is a "duplicate"). */
const ask = async (f: Fam, l: string, o: { position?: string; description?: string; note?: string } = {}) => {
  const r = await requestMaterial(sql, f.t, { lessonId: l, description: `Workbook ${++item}`, ...o });
  if (!r.ok) throw new Error(`ask refused: ${r.reason}`);
  return r.id;
};
const notes = (entity: string) =>
  sql<Array<{ recipient_id: string; kind: string; type: string; title: string; body: string; href: string }>>`
    SELECT recipient_id, kind, type, title, body, href FROM notifications WHERE entity_type = 'material_request'
      AND entity_id = ${entity} ORDER BY recipient_id, type`;
const lessonRow = async (id: string) => (await sql`SELECT l::text AS r FROM lessons l WHERE l.id = ${id}`)[0]!.r;
const outbox = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM email_outbox`)[0]!.n;

// ---------------------------------------------------------------------------------------------
describe('TL-2 server: the teacher asks (requestMaterial)', () => {
  it('the lesson’s teacher asks; each active parent gets one in-app action notice; nothing is emailed', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f, [b.chapters[0]!]);
    const emails = await outbox();
    const before = await lessonRow(l);
    const id = await ask(f, l, { position: '1', description: undefined, note: 'Bring it please' });
    const n = await notes(id);
    expect(n.map((x) => x.recipient_id).sort()).toEqual([f.parent, f.parent2].sort());
    for (const x of n) {
      expect(x).toMatchObject({ kind: 'action', type: 'material_requested', href: '/parent/calendar' });
      expect(x.title).toContain('asked for material for Kiran');
      // No typed text (the teacher's note) is copied into a notification.
      expect(`${x.title} ${x.body}`).not.toContain('Bring it please');
      expect(`${x.title} ${x.body}`.toLowerCase()).not.toMatch(/email|whatsapp|sent to your phone/);
    }
    expect(await outbox()).toBe(emails);
    expect(await lessonRow(l)).toBe(before);
    // A repeated notice for the same event is never duplicated.
    expect(await notes(id)).toHaveLength(2);
  });

  it('refuses bad input before the database: both or neither, a bad position, too long, not text', async () => {
    const f = await family();
    const l = await lesson(f);
    const cases = [
      { position: '1', description: 'x' },
      { position: '', description: '' },
      { position: '6', description: null },
      { position: '1.5', description: null },
      { position: null, description: 'x'.repeat(201) },
      { position: null, description: 'ok', note: 'x'.repeat(301) },
      { position: null, description: 42 },
    ];
    for (const c of cases)
      expect(await requestMaterial(sql, f.t, { lessonId: l, ...c })).toEqual({ ok: false, reason: 'invalid' });
    expect(await sql`SELECT 1 FROM material_requests WHERE lesson_id = ${l}`).toHaveLength(0);
  });

  it('anyone but the lesson’s teacher gets "not found": another teacher, a parent, the child, a bad id', async () => {
    const f = await family();
    const other = await teacher('Mr Iyer');
    await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['science'] });
    const l = await lesson(f);
    for (const who of [other, f.parent, f.child])
      expect(await requestMaterial(sql, who, { lessonId: l, description: 'x' })).toEqual({
        ok: false,
        reason: 'not_found',
      });
    expect(await requestMaterial(sql, f.t, { lessonId: 'not-a-uuid', description: 'x' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await sql`SELECT 1 FROM material_requests WHERE lesson_id = ${l}`).toHaveLength(0);
  });

  it('one request per item: a repeated or simultaneous identical request is refused as "duplicate"; another item is fine', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f, [b.chapters[0]!]);
    expect((await requestMaterial(sql, f.t, { lessonId: l, position: '1' })).ok).toBe(true);
    expect(await requestMaterial(sql, f.t, { lessonId: l, position: '1' })).toEqual({ ok: false, reason: 'duplicate' });
    expect((await requestMaterial(sql, f.t, { lessonId: l, description: 'Ruler' })).ok).toBe(true);
    expect(await requestMaterial(sql, f.t, { lessonId: l, description: '  ruler ' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
    // Two identical requests at the same moment (two tabs, a double click): exactly one is created.
    const both = await Promise.all([
      requestMaterial(sql, f.t, { lessonId: l, description: 'Graph paper' }),
      requestMaterial(sql, f.t, { lessonId: l, description: 'Graph paper' }),
    ]);
    expect(both.map((r) => (r.ok ? 'ok' : r.reason)).sort()).toEqual(['duplicate', 'ok']);
    const rows = await sql`SELECT coalesce(description, lesson_position::text) AS w FROM material_requests
                           WHERE lesson_id = ${l} ORDER BY created_at`;
    expect(rows.map((r) => r.w)).toEqual(['1', 'Ruler', 'Graph paper']);
    // Each parent got exactly one notice per request.
    const [{ n }] =
      (await sql`SELECT count(*)::int AS n FROM notifications n JOIN material_requests m ON m.id = n.entity_id
                               WHERE m.lesson_id = ${l} AND n.type = 'material_requested'`) as unknown as [
        { n: number },
      ];
    expect(n).toBe(6);
    // Once it is answered or withdrawn, the same item may be asked for again.
    const [first] = await sql<
      { id: string }[]
    >`SELECT id FROM material_requests WHERE lesson_id = ${l} AND lesson_position = 1`;
    await withdrawMaterialRequest(sql, f.t, first!.id);
    expect((await requestMaterial(sql, f.t, { lessonId: l, position: '1' })).ok).toBe(true);
  });

  it('the sixth open request says "limit"; a closed lesson says "closed"', async () => {
    const f = await family();
    const l = await lesson(f);
    for (let i = 0; i < 5; i++) await ask(f, l);
    expect(await requestMaterial(sql, f.t, { lessonId: l, description: 'x' })).toEqual({ ok: false, reason: 'limit' });
    const c = await lesson(f);
    await answerLesson(sql, f.t, c, 'decline');
    expect(await requestMaterial(sql, f.t, { lessonId: c, description: 'x' })).toEqual({ ok: false, reason: 'closed' });
  });
});

describe('TL-2 server: parents answer (shareMaterial, markMaterialUnavailable)', () => {
  it('either parent shares; only the teacher is told, without the child’s name; the lesson is unchanged', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    const id = await ask(f, l);
    const before = await lessonRow(l);
    expect(await shareMaterial(sql, f.parent2, { requestId: id, bookId: b.id, chapterId: b.chapters[1] })).toEqual({
      ok: true,
      id,
    });
    const t = (await notes(id)).filter((x) => x.type === 'material_shared');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ recipient_id: f.t, kind: 'update', href: '/teacher/schedule' });
    expect(`${t[0]!.title} ${t[0]!.body}`).not.toContain('Kiran');
    expect(t[0]!.title).toContain('Maths, Grade 5');
    expect(await lessonRow(l)).toBe(before);
    // A second answer: closed.
    expect(await markMaterialUnavailable(sql, f.parent, { requestId: id })).toEqual({ ok: false, reason: 'closed' });
  });

  it('a book the teacher can’t view is "not shareable"; another family, the teacher or the child get "not found"', async () => {
    const f = await family();
    const g = await family();
    const notAssigned = await book(f.parent, null);
    const l = await lesson(f);
    const id = await ask(f, l);
    expect(await shareMaterial(sql, f.parent, { requestId: id, bookId: notAssigned.id })).toEqual({
      ok: false,
      reason: 'not_shareable',
    });
    expect(await shareMaterial(sql, f.parent, { requestId: id, bookId: 'nope' })).toEqual({
      ok: false,
      reason: 'not_shareable',
    });
    const theirs = await book(g.parent, g.child);
    for (const who of [g.parent, f.t, f.child])
      expect(await shareMaterial(sql, who, { requestId: id, bookId: theirs.id })).toEqual({
        ok: false,
        reason: 'not_found',
      });
    expect(await markMaterialUnavailable(sql, g.parent, { requestId: id })).toEqual({ ok: false, reason: 'not_found' });
    expect((await sql`SELECT status FROM material_requests WHERE id = ${id}`)[0]!.status).toBe('open');
  });

  it('"not available" with a note: the teacher is told; the note itself is never in a notification', async () => {
    const f = await family();
    const l = await lesson(f);
    const id = await ask(f, l);
    expect(await markMaterialUnavailable(sql, f.parent, { requestId: id, note: 'We lent it to a cousin' })).toEqual({
      ok: true,
      id,
    });
    const t = (await notes(id)).filter((x) => x.type === 'material_unavailable');
    expect(t).toHaveLength(1);
    expect(`${t[0]!.title} ${t[0]!.body}`).not.toContain('cousin');
    expect(await markMaterialUnavailable(sql, f.parent, { requestId: id, note: 'x'.repeat(301) })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('only the lesson’s teacher withdraws; the parents’ notice then reads "No longer needed"', async () => {
    const f = await family();
    const other = await teacher('Mr Iyer');
    const l = await lesson(f);
    const id = await ask(f, l);
    const label = async () =>
      (await listNotifications(sql, f.parent, { view: 'page' })).items.find((n) => n.type === 'material_requested')!
        .label;
    expect(await label()).toBe('Needs your reply');
    expect(await withdrawMaterialRequest(sql, other, id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await withdrawMaterialRequest(sql, f.parent, id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await withdrawMaterialRequest(sql, f.t, id)).toEqual({ ok: true, id });
    expect(await label()).toBe('No longer needed');
    expect(await withdrawMaterialRequest(sql, f.t, id)).toEqual({ ok: false, reason: 'closed' });
  });

  it('the parents’ notice reads "Done" once shared', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    const id = await ask(f, l);
    await shareMaterial(sql, f.parent, { requestId: id, bookId: b.id });
    const n = (await listNotifications(sql, f.parent2, { view: 'page' })).items.find(
      (x) => x.type === 'material_requested',
    )!;
    expect(n.label).toBe('Done');
  });
});

describe('TL-2 server: who sees requests (materialRequestsFor; TL2-6, cross-family isolation)', () => {
  it('the lesson’s teacher and the child’s active parents see them; nobody else, whatever lesson ids are sent', async () => {
    const f = await family();
    const g = await family();
    const other = await teacher('Mr Iyer');
    await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['science'] });
    const l = await lesson(f);
    const id = await ask(f, l);
    const seen = async (who: string, role: 'parent' | 'teacher' | 'student') =>
      ((await materialRequestsFor(sql, { id: who, role }, [l])).get(l) ?? []).map((r) => r.id);
    expect(await seen(f.t, 'teacher')).toEqual([id]);
    expect(await seen(f.parent, 'parent')).toEqual([id]);
    expect(await seen(f.parent2, 'parent')).toEqual([id]);
    expect(await seen(g.parent, 'parent')).toEqual([]);
    expect(await seen(other, 'teacher')).toEqual([]);
    expect(await seen(f.child, 'student')).toEqual([]);
    // Claiming another role does not help: a parent id as "teacher", a teacher id as "parent".
    expect(await seen(f.parent, 'teacher')).toEqual([]);
    expect(await seen(f.t, 'parent')).toEqual([]);
    // A revoked parent, and a teacher no longer approved, see nothing.
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE parent_id = ${f.parent2} AND student_id = ${f.child}`;
    expect(await seen(f.parent2, 'parent')).toEqual([]);
    await sql`UPDATE teacher_profiles SET approval_status = 'changes_requested' WHERE account_id = ${f.t}`;
    expect(await seen(f.t, 'teacher')).toEqual([]);
    await sql`UPDATE teacher_profiles SET approval_status = 'approved' WHERE account_id = ${f.t}`;
  });

  it('teacher link to shared material only while they can view it; parents never get a link; ended = no longer needed', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    await answerLesson(sql, f.t, l, 'accept');
    const id = await ask(f, l);
    await shareMaterial(sql, f.parent, { requestId: id, bookId: b.id, chapterId: b.chapters[0] });
    const view = async (who: string, role: 'parent' | 'teacher') =>
      (await materialRequestsFor(sql, { id: who, role }, [l])).get(l)![0]!;
    expect(await view(f.t, 'teacher')).toMatchObject({
      status: 'shared',
      sharedLabel: 'Maths Practice · 1. Fractions',
      sharedHref: `/books/${b.id}?chapter=${b.chapters[0]}`,
      sharedNoLongerVisible: false,
    });
    expect(await view(f.parent, 'parent')).toMatchObject({ sharedHref: null, sharedNoLongerVisible: false });
    await sql`UPDATE books SET status = 'draft' WHERE id = ${b.id}`;
    expect(await view(f.t, 'teacher')).toMatchObject({ sharedHref: null, sharedNoLongerVisible: true });
    // An open request on a lesson that has ended reads "no longer needed" before the sweep runs.
    const l2 = await lesson(f);
    await answerLesson(sql, f.t, l2, 'accept');
    const open = await ask(f, l2);
    await endLesson(l2);
    const v = (await materialRequestsFor(sql, { id: f.parent, role: 'parent' }, [l2])).get(l2)![0]!;
    expect(v).toMatchObject({ id: open, status: 'no_longer_needed', canAnswer: false });
  });

  it('share options are only books the teacher can view now; another family gets none', async () => {
    const f = await family();
    const g = await family();
    const ok = await book(f.parent, f.child, 'Maths Practice');
    await book(f.parent, null, 'Not assigned');
    await book(f.parent, f.child, 'Science book', 'science');
    const l = await lesson(f);
    const id = await ask(f, l);
    const opts = await shareOptions(sql, f.parent, id);
    expect(opts.map((o) => o.title)).toEqual(['Maths Practice']);
    expect(opts[0]!.chapters.map((c) => c.label)).toEqual([
      'Maths Practice · 1. Fractions',
      'Maths Practice · 2. Decimals',
    ]);
    expect(opts[0]!.bookId).toBe(ok.id);
    expect(await shareOptions(sql, g.parent, id)).toEqual([]);
    expect(await shareOptions(sql, f.t, id)).toEqual([]);
  });

  it('the notification of another family’s request can’t be opened, and a revoked parent sees it redacted', async () => {
    const f = await family();
    const g = await family();
    const l = await lesson(f);
    const id = await ask(f, l);
    const [mine] = await sql<{ id: string }[]>`
      SELECT id FROM notifications WHERE entity_id = ${id} AND recipient_id = ${f.parent2}`;
    expect(await openNotification(sql, g.parent, mine!.id)).toEqual({ ok: false, reason: 'not_found' });
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE parent_id = ${f.parent2} AND student_id = ${f.child}`;
    const item = (await listNotifications(sql, f.parent2, { view: 'page' })).items.find((x) => x.id === mine!.id)!;
    expect(item.redacted).toBe(true);
    expect(item.href).toBeNull();
  });
});

describe('TL-2 server: the parent home count and the sweep', () => {
  it('counts open requests on the parent’s own children’s live lessons only', async () => {
    const f = await family();
    const g = await family(f.t, ['maths'], 'Asha');
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    const a = await ask(f, l);
    await ask(f, l);
    await ask(g, await lesson(g));
    expect(await openMaterialRequestCount(sql, f.parent)).toBe(2);
    expect(await openMaterialRequestCount(sql, f.parent2)).toBe(2);
    expect(await openMaterialRequestCount(sql, g.parent)).toBe(1);
    expect(await openMaterialRequestCount(sql, f.t)).toBe(0);
    await shareMaterial(sql, f.parent, { requestId: a, bookId: b.id });
    expect(await openMaterialRequestCount(sql, f.parent)).toBe(1);
    // A cancelled lesson closes its requests; an ended lesson is not counted even before the sweep.
    const c = await lesson(f);
    await answerLesson(sql, f.t, c, 'accept');
    await ask(f, c);
    expect(await openMaterialRequestCount(sql, f.parent)).toBe(2);
    await cancelLesson(sql, { id: f.parent, role: 'parent' }, c);
    expect(await openMaterialRequestCount(sql, f.parent)).toBe(1);
    await answerLesson(sql, f.t, l, 'accept');
    await endLesson(l);
    expect(await openMaterialRequestCount(sql, f.parent)).toBe(0);
  });

  it('the shared sweep closes open requests on ended lessons, once', async () => {
    const f = await family();
    const l = await lesson(f);
    await answerLesson(sql, f.t, l, 'accept');
    const id = await ask(f, l);
    await endLesson(l);
    await sql`UPDATE notification_throttles SET last_run_at = now() - interval '5 minutes' WHERE name = 'shared_sweep'`;
    const r = await runSharedSweep(sql, 'http://localhost');
    expect(r.ran).toBe(true);
    expect(r.materialRequests).toBeGreaterThanOrEqual(1);
    expect((await sql`SELECT status, close_reason FROM material_requests WHERE id = ${id}`)[0]).toEqual({
      status: 'no_longer_needed',
      close_reason: 'lesson_ended',
    });
    expect(await closeEndedMaterialRequests(sql)).toBe(0);
  });
});

describe('TL-2 decision record: the two edge cases (owner, 26 Oct 2026, 10:37 IST)', () => {
  it('edge case 1, OC-53 kept lesson: open requests stay until it ends; the parent may say "not available" but cannot share; the removed teacher cannot ask', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const kept = await lessonIn(f, 10); // starts in 10 minutes: kept under OC-53 Option A
    const r1 = await ask(f, kept);
    const r2 = await ask(f, kept);
    expect(await removeTeacher(sql, f.parent, f.t)).toEqual({ ok: true });
    expect((await sql`SELECT 1 FROM lessons_kept WHERE lesson_id = ${kept}`).length).toBe(1);
    // Both requests are still open and still count on the parent's home.
    expect((await sql`SELECT status FROM material_requests WHERE id IN ${sql([r1, r2])}`).map((r) => r.status)).toEqual(
      ['open', 'open'],
    );
    expect(await openMaterialRequestCount(sql, f.parent)).toBe(2);
    // Sharing is refused (the teacher can no longer view the book); nothing is offered to share.
    expect(await shareOptions(sql, f.parent, r1)).toEqual([]);
    expect(await shareMaterial(sql, f.parent, { requestId: r1, bookId: b.id })).toEqual({
      ok: false,
      reason: 'not_shareable',
    });
    // "Not available" is accepted, and the teacher is told in AA Pro only if still active and approved (they are).
    expect(await markMaterialUnavailable(sql, f.parent, { requestId: r1, note: 'Not needed now' })).toEqual({
      ok: true,
      id: r1,
    });
    // The removed teacher cannot raise a new request on the kept lesson.
    expect(await requestMaterial(sql, f.t, { lessonId: kept, description: 'Another book' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect((await sql`SELECT count(*)::int AS n FROM material_requests WHERE lesson_id = ${kept}`)[0]!.n).toBe(2);
    // When the kept lesson ends, the remaining open request closes as "lesson ended".
    await endLesson(kept);
    expect(await closeEndedMaterialRequests(sql)).toBeGreaterThanOrEqual(1);
    expect((await sql`SELECT status, close_reason FROM material_requests WHERE id = ${r2}`)[0]).toEqual({
      status: 'no_longer_needed',
      close_reason: 'lesson_ended',
    });
    expect((await sql`SELECT status FROM material_requests WHERE id = ${r1}`)[0]!.status).toBe('unavailable');
  });

  it('edge case 2: an answer recorded just before a cancellation grants nothing; the reader and its page files refuse a teacher no longer authorised', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    await answerLesson(sql, f.t, l, 'accept');
    const r = await ask(f, l);
    // The parent's share is recorded first (as if it won a race with the cancellation)...
    expect((await shareMaterial(sql, f.parent, { requestId: r, bookId: b.id, chapterId: b.chapters[0] })).ok).toBe(
      true,
    );
    // ...and while the teacher is still linked, the reader allows them under the existing sharing
    // rule (OC-41) that applied before any request: the request itself added nothing.
    expect(await getBookForViewer(sql, f.t, b.id)).not.toBeNull();
    // Then the parent removes the teacher: the lesson is cancelled (OC-53: more than 30 minutes away).
    expect(await removeTeacher(sql, f.parent, f.t)).toEqual({ ok: true });
    expect((await sql`SELECT status FROM lessons WHERE id = ${l}`)[0]!.status).toBe('cancelled');
    // The answer stays as history ("shared" is final), but the teacher can no longer open anything.
    expect((await sql`SELECT status FROM material_requests WHERE id = ${r}`)[0]!.status).toBe('shared');
    expect(await getBookForViewer(sql, f.t, b.id)).toBeNull();
    // (The page files apply the same rule, mayReadFile; books.test.ts proves a teacher whose link
    // ended is refused both the reader and the stored page files.)
    // No link to it is offered to the teacher any more.
    const v = (await materialRequestsFor(sql, { id: f.t, role: 'teacher' }, [l])).get(l) ?? [];
    expect(v.every((x) => x.sharedHref === null)).toBe(true);
  });
});

describe('independent review (27 Oct 2026): F4 to F6 and the F3 timing case', () => {
  it('F4: past its reply deadline a requested lesson is no longer live: no new request, no share, no "not available", and nothing is notified', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    const r = await ask(f, l);
    const [row] = await sql<{ deadline: Date }[]>`SELECT reply_deadline AS deadline FROM lessons WHERE id = ${l}`;
    const deadline = row!.deadline;
    const late = new Date(deadline.getTime() + MIN); // the expiry sweep has not run yet: still 'requested'
    expect((await sql`SELECT status FROM lessons WHERE id = ${l}`)[0]!.status).toBe('requested');
    // The screens already say "No longer needed" at this time...
    expect((await materialRequestsFor(sql, { id: f.parent, role: 'parent' }, [l], late)).get(l)![0]).toMatchObject({
      status: 'no_longer_needed',
      canAnswer: false,
    });
    const notices = (await sql`SELECT count(*)::int AS n FROM notifications WHERE entity_type = 'material_request'`)[0]!
      .n;
    // ...and now the server agrees, even if the actions are called directly.
    expect(await shareMaterial(sql, f.parent, { requestId: r, bookId: b.id }, late)).toEqual({
      ok: false,
      reason: 'closed',
    });
    expect(await markMaterialUnavailable(sql, f.parent, { requestId: r }, late)).toEqual({
      ok: false,
      reason: 'closed',
    });
    expect(await requestMaterial(sql, f.t, { lessonId: l, description: 'Late ask' }, late)).toEqual({
      ok: false,
      reason: 'closed',
    });
    expect((await sql`SELECT status FROM material_requests WHERE lesson_id = ${l}`).map((x) => x.status)).toEqual([
      'open',
    ]);
    expect((await sql`SELECT count(*)::int AS n FROM notifications WHERE entity_type = 'material_request'`)[0]!.n).toBe(
      notices,
    );
    // Control: before the deadline the same share is accepted (business rule unchanged).
    expect(await shareMaterial(sql, f.parent, { requestId: r, bookId: b.id })).toEqual({ ok: true, id: r });
  });

  it('F5: a teacher who is no longer approved, or no longer linked, cannot withdraw; on an OC-53 kept lesson they still can', async () => {
    const f = await family();
    const l = await lesson(f);
    await answerLesson(sql, f.t, l, 'accept');
    const r = await ask(f, l);
    await sql`UPDATE teacher_profiles SET approval_status = 'changes_requested' WHERE account_id = ${f.t}`;
    expect(await withdrawMaterialRequest(sql, f.t, r)).toEqual({ ok: false, reason: 'not_found' });
    await sql`UPDATE teacher_profiles SET approval_status = 'approved' WHERE account_id = ${f.t}`;
    // Link ended outside a removal (no cancellation, no kept record): not on their schedule, so no withdrawal.
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE teacher_id = ${f.t} AND student_id = ${f.child}`;
    expect(await withdrawMaterialRequest(sql, f.t, r)).toEqual({ ok: false, reason: 'not_found' });
    expect((await sql`SELECT status FROM material_requests WHERE id = ${r}`)[0]!.status).toBe('open');
    // OC-53 kept lesson (EC-1): still on the removed teacher's schedule, so they may still withdraw.
    const g = await family();
    const kept = await lessonIn(g, 10);
    const rk = await ask(g, kept);
    expect(await removeTeacher(sql, g.parent, g.t)).toEqual({ ok: true });
    expect(await withdrawMaterialRequest(sql, g.t, rk)).toEqual({ ok: true, id: rk });
  });

  it('F6: a teacher reads requests only on lessons that are on their schedule, whatever ids are sent', async () => {
    const f = await family();
    const l = await lesson(f);
    await answerLesson(sql, f.t, l, 'accept');
    const r = await ask(f, l);
    expect(await markMaterialUnavailable(sql, f.parent, { requestId: r, note: 'Private family note' })).toMatchObject({
      ok: true,
    });
    expect((await materialRequestsFor(sql, { id: f.t, role: 'teacher' }, [l])).get(l)).toHaveLength(1);
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE teacher_id = ${f.t} AND student_id = ${f.child}`;
    // No longer linked and not kept: nothing, including the parent's typed answer.
    expect((await materialRequestsFor(sql, { id: f.t, role: 'teacher' }, [l])).size).toBe(0);
    // A kept lesson stays visible to its removed teacher (OC-53), as on My schedule.
    const g = await family();
    const kept = await lessonIn(g, 10);
    await ask(g, kept);
    expect(await removeTeacher(sql, g.parent, g.t)).toEqual({ ok: true });
    expect((await materialRequestsFor(sql, { id: g.t, role: 'teacher' }, [kept])).get(kept)).toHaveLength(1);
  });
  // F3 (accepted limitation, owner 27 Oct 2026 18:16 IST, only once proven harmless): a parent's
  // share and a cancellation of the same lesson at the same moment. Whichever transaction takes
  // the request row first wins; the end state is exactly one of the two serial orders, never a
  // mixture, and the request grants no access either way.
  const pid = async (db: postgres.Sql) => (await db<{ p: number }[]>`SELECT pg_backend_pid() AS p`)[0]!.p;
  /** Waits until `waiter` is blocked by `holder` specifically (not by any other lock in the database). */
  const blocked = async (waiter: number, holder: number) => {
    for (let i = 0; i < 200; i++) {
      const [w] = await sql<{ ok: boolean }[]>`SELECT ${holder}::int = ANY (pg_blocking_pids(${waiter}::int)) AS ok`;
      if (w!.ok) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('the second transaction never waited for the first');
  };
  const raceSetup = async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const control = await book(f.parent, f.child, 'Never shared');
    const l = await lesson(f);
    await answerLesson(sql, f.t, l, 'accept');
    const r = await ask(f, l);
    const other = await ask(f, l);
    return { f, b, control, l, r, other };
  };
  const finalState = async (l: string, r: string, other: string, t: string) => ({
    lesson: (await sql`SELECT status FROM lessons WHERE id = ${l}`)[0]!.status,
    rows: (await sql`SELECT count(*)::int AS n FROM material_requests WHERE lesson_id = ${l}`)[0]!.n,
    request: (await sql`SELECT status, closed_by, close_reason FROM material_requests WHERE id = ${r}`)[0],
    other: (await sql`SELECT status, closed_by, close_reason FROM material_requests WHERE id = ${other}`)[0],
    sharedNotices: (
      await sql`SELECT count(*)::int AS n FROM notifications
                WHERE recipient_id = ${t} AND type = 'material_shared' AND entity_id = ${r}`
    )[0]!.n,
  });

  it('F3, share wins the race: the end state equals "share, then cancel"; no duplicate, no lost row, no extra access', async () => {
    const { f, b, control, l, r, other } = await raceSetup();
    const url = inject('databaseUrl');
    const a = postgres(url, { max: 1, onnotice: () => {} });
    const c = postgres(url, { max: 1, onnotice: () => {} });
    const [pa, pc] = [await pid(a), await pid(c)];
    try {
      let release!: () => void;
      const hold = new Promise<void>((res) => (release = res));
      let shared: unknown;
      const share = a.begin(async (tx) => {
        shared = await shareMaterial(tx as unknown as postgres.Sql, f.parent, { requestId: r, bookId: b.id });
        await hold; // the share holds the request row, uncommitted
      });
      while (shared === undefined) await new Promise((res) => setTimeout(res, 10));
      expect(shared).toEqual({ ok: true, id: r });
      const cancel = cancelLesson(c, { id: f.parent, role: 'parent' }, l);
      await blocked(pc, pa); // the cancellation's close trigger waits for the share's request row
      release();
      await share;
      expect(await cancel).toEqual({ ok: true });
    } finally {
      await a.end();
      await c.end();
    }
    const raced = await finalState(l, r, other, f.t);
    expect(raced).toEqual({
      lesson: 'cancelled',
      rows: 2,
      request: { status: 'shared', closed_by: 'parent', close_reason: null },
      other: { status: 'no_longer_needed', closed_by: 'aa_pro', close_reason: 'lesson_closed' },
      sharedNotices: 1,
    });
    // The same two steps one after the other give exactly the same state.
    const s2 = await raceSetup();
    expect((await shareMaterial(sql, s2.f.parent, { requestId: s2.r, bookId: s2.b.id })).ok).toBe(true);
    expect(await cancelLesson(sql, { id: s2.f.parent, role: 'parent' }, s2.l)).toEqual({ ok: true });
    expect(await finalState(s2.l, s2.r, s2.other, s2.f.t)).toEqual(raced);
    // No authorisation gained: the teacher's access to the shared book is exactly their access to a
    // book of the same child that was never shared (OC-41 linking rule; the request adds nothing).
    expect((await getBookForViewer(sql, f.t, b.id)) === null).toBe(
      (await getBookForViewer(sql, f.t, control.id)) === null,
    );
  });

  it('F3, cancellation wins the race: the share is refused as closed; nothing is shared and the teacher is told nothing', async () => {
    const { f, b, l, r, other } = await raceSetup();
    const url = inject('databaseUrl');
    const a = postgres(url, { max: 1, onnotice: () => {} });
    const c = postgres(url, { max: 1, onnotice: () => {} });
    const [pa, pc] = [await pid(a), await pid(c)];
    try {
      let release!: () => void;
      const hold = new Promise<void>((res) => (release = res));
      let cancelled = false;
      const cancel = c.begin(async (tx) => {
        // The statement cancelLesson runs; its close trigger takes the open request rows.
        await tx`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${l}`;
        cancelled = true;
        await hold;
      });
      while (!cancelled) await new Promise((res) => setTimeout(res, 10));
      const share = shareMaterial(a, f.parent, { requestId: r, bookId: b.id });
      await blocked(pa, pc); // the share waits for the cancellation's lock on the request row
      release();
      await cancel;
      expect(await share).toEqual({ ok: false, reason: 'closed' });
    } finally {
      await a.end();
      await c.end();
    }
    expect(await finalState(l, r, other, f.t)).toEqual({
      lesson: 'cancelled',
      rows: 2,
      request: { status: 'no_longer_needed', closed_by: 'aa_pro', close_reason: 'lesson_closed' },
      other: { status: 'no_longer_needed', closed_by: 'aa_pro', close_reason: 'lesson_closed' },
      sharedNotices: 0,
    });
  });
});
