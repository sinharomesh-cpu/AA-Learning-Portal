import { afterAll, describe, expect, it } from 'vitest';
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
const endLesson = (id: string) =>
  sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`UPDATE lessons SET requested_at = requested_at - interval '10 days', reply_deadline = reply_deadline - interval '10 days',
             confirmed_at = confirmed_at - interval '10 days', starts_at = starts_at - interval '10 days',
             ends_at = ends_at - interval '10 days' WHERE id = ${id}`;
  });
const ask = async (f: Fam, l: string, o: { position?: string; description?: string; note?: string } = {}) => {
  const r = await requestMaterial(sql, f.t, { lessonId: l, description: 'Workbook', ...o });
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
