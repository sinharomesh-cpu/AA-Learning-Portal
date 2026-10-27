import postgres from 'postgres';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { setAccountActive } from '@/server/admin';
import { answerLesson, cancelLesson, requestLesson, withdrawLesson } from '@/server/lessons';
import { removeTeacher, updateTeacherLinks } from '@/server/teacherLinks';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-2 migration 0033 (owner approval in principle of TL2-1 to TL2-8, 25 Oct 2026, 23:30 IST, with
 * safeguards 1-6), tested at the database level ONLY: no TL-2 application code exists yet. Every
 * material-request write here is plain SQL, exactly what future server code would send; the
 * database must refuse anything outside the approved rules whatever is sent. Lessons are made with
 * the existing, unchanged lesson actions. Synthetic data only, on the throw-away database.
 */
const sql = testDb();
afterAll(() => sql.end());

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR);
const at = (offsetMin: number) => new Date(BASE.getTime() + offsetMin * MIN);

async function teacher() {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC' WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, 0, 1440)`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', 60000, 30)`;
  return id;
}
/** Two parents of one child, linked to a teacher in maths (and optionally more subjects). */
async function family(t?: string, subjects = ['maths']) {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher());
  await activeLink(sql, { teacher: tid, child, parent, subjects });
  return { parent, parent2, child, t: tid };
}
type Fam = Awaited<ReturnType<typeof family>>;
async function book(
  owner: string,
  child: string | null,
  o: { title?: string; subject?: string; status?: 'draft' | 'published'; chapters?: string[] } = {},
) {
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status)
    VALUES (${owner}, ${o.title ?? 'Maths book'}, ${o.subject ?? 'maths'}, 'chapter_files', ${o.status ?? 'published'})
    RETURNING id`;
  const chapters: string[] = [];
  for (const [i, title] of (o.chapters ?? ['Fractions', 'Decimals']).entries()) {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${title}) RETURNING id`;
    chapters.push(c!.id);
  }
  if (child) await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child})`;
  return { id: b!.id, chapters };
}
let slot = 0;
/** A new lesson request (existing, unchanged action), optionally with TL-1 chapters; returns its id. */
async function lesson(f: Fam, extra: { chapterIds?: string[] } = {}) {
  const start = at(60 * slot++);
  const r = await requestLesson(sql, f.parent, {
    childId: f.child,
    teacherId: f.t,
    subject: 'maths',
    priceMinor: '30000',
    currency: 'INR',
    basis: 'listed',
    startsAt: start.toISOString(),
    minutes: '30',
    ...extra,
  });
  if (!r.ok) throw new Error(`request refused: ${r.reason}`);
  return r.id;
}
/** A confirmed lesson starting `min` minutes from now (database clock), triggers skipped for the insert only. */
async function lessonIn(f: Fam, min: number, minutes = 10) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${f.parent}, 'maths', s, ${minutes}, s + make_interval(mins => ${minutes}), s - interval '3 days',
             s - interval '3 days' + interval '48 hours', 'confirmed', s - interval '3 days' + interval '1 minute',
             'INR', 60000, ${(60000 * minutes) / 60}, 'listed'
      FROM (SELECT date_trunc('minute', now()) + make_interval(mins => ${min}) AS s) x
      RETURNING id`;
    return r!.id;
  });
}
/** Moves a lesson's whole timeline into the past (test-only time travel; every lesson rule still holds). */
const endLesson = (id: string) =>
  sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`UPDATE lessons SET requested_at = requested_at - interval '10 days', reply_deadline = reply_deadline - interval '10 days',
             confirmed_at = confirmed_at - interval '10 days', starts_at = starts_at - interval '10 days',
             ends_at = ends_at - interval '10 days' WHERE id = ${id}`;
  });

// ---- the SQL that future server code would send ----
const raise = (
  db: postgres.Sql,
  lessonId: string,
  by: string | null,
  o: { position?: number; description?: string; note?: string } = {},
) =>
  db<{ id: string }[]>`
    INSERT INTO material_requests (lesson_id, raised_by, lesson_position, description, note)
    VALUES (${lessonId}, ${by}, ${o.position ?? null}, ${o.position ? null : (o.description ?? 'The workbook')}, ${o.note ?? null})
    RETURNING id`.then((r: { id: string }[]) => r[0]!.id);
const share = (id: string, parent: string, bookId: string | null, chapterId: string | null = null) =>
  sql`UPDATE material_requests SET status = 'shared', closed_by = 'parent', closed_by_account = ${parent},
             shared_book_id = ${bookId}, shared_chapter_id = ${chapterId} WHERE id = ${id}`;
const unavailable = (id: string, parent: string, note: string | null = null) =>
  sql`UPDATE material_requests SET status = 'unavailable', closed_by = 'parent', closed_by_account = ${parent},
             answer_note = ${note} WHERE id = ${id}`;
const withdraw = (id: string, teacherId: string) =>
  sql`UPDATE material_requests SET status = 'no_longer_needed', closed_by = 'teacher', closed_by_account = ${teacherId}
      WHERE id = ${id}`;
const req = async (id: string) =>
  (await sql<Record<string, unknown>[]>`SELECT * FROM material_requests WHERE id = ${id}`)[0]!;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? 'err';
  }
};
/** Safeguards 1 and 3: the lesson row and every access-related row, as one fingerprint. */
const fingerprint = async (f: Fam, lessonId: string) =>
  (
    await sql<{ h: string }[]>`
      SELECT md5(concat_ws('|',
        (SELECT l::text FROM lessons l WHERE l.id = ${lessonId}),
        (SELECT string_agg(c::text, ';' ORDER BY c.position) FROM lesson_chapters c WHERE c.lesson_id = ${lessonId}),
        (SELECT string_agg(b::text, ';' ORDER BY b.id) FROM books b WHERE b.owner_id IN (${f.parent}, ${f.parent2})),
        (SELECT string_agg(c::text, ';' ORDER BY c.id) FROM book_chapters c JOIN books b ON b.id = c.book_id
           WHERE b.owner_id IN (${f.parent}, ${f.parent2})),
        (SELECT string_agg(k::text, ';' ORDER BY k.book_id) FROM book_children k WHERE k.student_id = ${f.child}),
        (SELECT string_agg(t::text, ';' ORDER BY t.id) FROM teacher_student_links t WHERE t.student_id = ${f.child}),
        (SELECT string_agg(m::text, ';' ORDER BY m.teacher_id) FROM meeting_link_permissions m WHERE m.student_id = ${f.child}),
        (SELECT string_agg(m::text, ';') FROM lesson_meeting_links m WHERE m.lesson_id = ${lessonId}),
        (SELECT string_agg(k::text, ';') FROM lessons_kept k WHERE k.lesson_id = ${lessonId}))) AS h`
  )[0]!.h;

// ---------------------------------------------------------------------------------------------
describe('TL-2 (0033): raising a material request', () => {
  it('the lesson’s linked teacher may ask on a requested or a confirmed lesson; the database sets state and time', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l1 = await lesson(f, { chapterIds: [b.chapters[0]!] });
    const r1 = await raise(sql, l1, f.t, { position: 1, note: '  Please bring it  ' });
    expect(await req(r1)).toMatchObject({
      status: 'open',
      lesson_position: 1,
      description: null,
      note: 'Please bring it',
    });
    const l2 = await lesson(f);
    expect((await answerLesson(sql, f.t, l2, 'accept')).ok).toBe(true);
    const r2 = await raise(sql, l2, f.t, { description: '  Grammar workbook ' });
    expect(await req(r2)).toMatchObject({ status: 'open', description: 'Grammar workbook', closed_at: null });
    // A request that tries to arrive already answered is reset to open, or refused by the state rule.
    expect(
      await code(sql`INSERT INTO material_requests (lesson_id, raised_by, description, status, closed_by, closed_at)
                     VALUES (${l2}, ${f.t}, 'x', 'shared', 'parent', now())`),
    ).toBe('23514');
  });

  it('asks for exactly one thing: a chapter on THIS lesson or a description (1-200), never both or neither', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const withCh = await lesson(f, { chapterIds: [b.chapters[0]!] });
    const plain = await lesson(f);
    expect(await code(raise(sql, plain, f.t, { position: 1 }))).toBe('23503'); // no chapter 1 on that lesson
    expect(await code(sql`INSERT INTO material_requests (lesson_id, raised_by) VALUES (${withCh}, ${f.t})`)).toBe(
      '23514',
    );
    expect(
      await code(
        sql`INSERT INTO material_requests (lesson_id, raised_by, lesson_position, description) VALUES (${withCh}, ${f.t}, 1, 'x')`,
      ),
    ).toBe('23514');
    expect(await code(raise(sql, plain, f.t, { description: '   ' }))).toBe('23514');
    expect(await code(raise(sql, plain, f.t, { description: 'x'.repeat(201) }))).toBe('23514');
    expect(await code(raise(sql, plain, f.t, { description: 'ok', note: 'x'.repeat(301) }))).toBe('23514');
  });

  it('refuses everyone else: a parent, the child, another teacher, an unlinked or unapproved teacher, no author', async () => {
    const f = await family();
    const l = await lesson(f);
    const other = await teacher();
    await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['science'] });
    for (const who of [f.parent, f.child, other, null]) expect(await code(raise(sql, l, who))).toBe('42501');
    // The lesson's own teacher, once no longer approved.
    const l2 = await lesson(f);
    await sql`UPDATE teacher_profiles SET approval_status = 'changes_requested' WHERE account_id = ${f.t}`;
    expect(await code(raise(sql, l2, f.t))).toBe('42501');
    await sql`UPDATE teacher_profiles SET approval_status = 'approved' WHERE account_id = ${f.t}`;
    expect(await code(raise(sql, l2, f.t))).toBe('ok');
  });

  it('refuses a lesson that is declined, withdrawn, cancelled or has ended', async () => {
    const f = await family();
    const d = await lesson(f);
    await answerLesson(sql, f.t, d, 'decline');
    const w = await lesson(f);
    await withdrawLesson(sql, f.parent, w);
    const c = await lesson(f);
    await answerLesson(sql, f.t, c, 'accept');
    await cancelLesson(sql, { id: f.parent, role: 'parent' }, c);
    const e = await lesson(f);
    await answerLesson(sql, f.t, e, 'accept');
    await endLesson(e);
    for (const id of [d, w, c, e]) expect(await code(raise(sql, id, f.t))).toBe('23514');
  });
});

describe('TL-2 (0033): at most five open requests per lesson (safeguard 2: database-enforced)', () => {
  it('a sixth open request is refused; closing one frees a place', async () => {
    const f = await family();
    const l = await lesson(f);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await raise(sql, l, f.t, { description: `Item ${i}` }));
    expect(await code(raise(sql, l, f.t, { description: 'Item 6' }))).toBe('23514');
    await withdraw(ids[0]!, f.t);
    expect(await code(raise(sql, l, f.t, { description: 'Item 6' }))).toBe('ok');
    expect(await code(raise(sql, l, f.t, { description: 'Item 7' }))).toBe('23514');
  });

  it('two requests sent at the same moment on separate connections cannot make a sixth', async () => {
    const f = await family();
    const l = await lesson(f);
    for (let i = 0; i < 4; i++) await raise(sql, l, f.t, { description: `Item ${i}` });
    const url = inject('databaseUrl');
    const a = postgres(url, { max: 1, onnotice: () => {} });
    const b = postgres(url, { max: 1, onnotice: () => {} });
    try {
      const results = await Promise.all([
        code(a.begin((tx) => raise(tx as unknown as postgres.Sql, l, f.t, { description: 'A' }))),
        code(b.begin((tx) => raise(tx as unknown as postgres.Sql, l, f.t, { description: 'B' }))),
      ]);
      expect(results.sort()).toEqual(['23514', 'ok']);
    } finally {
      await a.end();
      await b.end();
    }
    const open = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM material_requests WHERE lesson_id = ${l} AND status = 'open'`;
    expect(open[0]!.n).toBe(5);
  });
});

describe('TL-2 (0033): answering (safeguard 1: never wider access)', () => {
  it('either active parent shares a book or a chapter the teacher can already view; the database writes the label', async () => {
    const f = await family();
    const b = await book(f.parent, f.child, { title: 'Maths Practice' });
    const l = await lesson(f);
    const r1 = await raise(sql, l, f.t);
    await share(r1, f.parent2, b.id);
    expect(await req(r1)).toMatchObject({ status: 'shared', shared_label: 'Maths Practice', closed_by: 'parent' });
    const r2 = await raise(sql, l, f.t);
    await share(r2, f.parent, b.id, b.chapters[1]!);
    expect(await req(r2)).toMatchObject({ status: 'shared', shared_label: 'Maths Practice · 2. Decimals' });
    // A label sent by the application is ignored.
    const r3 = await raise(sql, l, f.t);
    await sql`UPDATE material_requests SET status = 'shared', closed_by = 'parent', closed_by_account = ${f.parent},
              shared_book_id = ${b.id}, shared_label = 'Invented' WHERE id = ${r3}`;
    expect((await req(r3)).shared_label).toBe('Maths Practice');
  });

  it('refuses any book the teacher cannot view now: draft, archived, not assigned, other subject, another family’s', async () => {
    const f = await family();
    const stranger = await createAdult(sql, 'parent');
    const draft = await book(f.parent, f.child, { status: 'draft' });
    const archived = await book(f.parent, f.child);
    await sql`UPDATE books SET archived_at = now() WHERE id = ${archived.id}`;
    const unassigned = await book(f.parent, null);
    const science = await book(f.parent, f.child, { subject: 'science' });
    const theirs = await book(stranger, null);
    // A forged cross-family assignment (the existing book_children rule refuses it, so it is planted
    // with triggers skipped): the share check must still refuse the book on its own.
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO book_children (book_id, student_id) VALUES (${theirs.id}, ${f.child})`;
    });
    const l = await lesson(f);
    const r = await raise(sql, l, f.t);
    for (const bk of [draft, archived, unassigned, science, theirs])
      expect(await code(share(r, f.parent, bk.id))).toBe('42501');
    expect(await code(share(r, f.parent, null))).toBe('42501');
    // A chapter of a different book, an archived chapter, an unfinished chapter.
    const good = await book(f.parent, f.child, { chapters: ['Live', 'Archived', 'Unfinished'] });
    await sql`UPDATE book_chapters SET archived_at = now() WHERE id = ${good.chapters[1]}`;
    await sql`UPDATE book_chapters SET complete = false WHERE id = ${good.chapters[2]}`;
    for (const ch of [draft.chapters[0]!, good.chapters[1]!, good.chapters[2]!])
      expect(await code(share(r, f.parent, good.id, ch))).toBe('42501');
    expect((await req(r)).status).toBe('open');
  });

  it('refuses when the teacher is no longer approved, on a still-confirmed lesson: sharing never grants access', async () => {
    const f = await family(undefined, ['maths', 'science']);
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    await answerLesson(sql, f.t, l, 'accept');
    const r = await raise(sql, l, f.t);
    // Simulate a teacher whose subject approval lapsed while the lesson is still confirmed.
    await sql`UPDATE teacher_profiles SET approval_status = 'changes_requested' WHERE account_id = ${f.t}`;
    expect(await code(share(r, f.parent, b.id))).toBe('42501');
    expect(await code(unavailable(r, f.parent, 'We do not have it'))).toBe('ok');
    expect(await req(r)).toMatchObject({ status: 'unavailable', answer_note: 'We do not have it' });
  });

  it('only an active parent of the child answers: not the teacher, the child, another family, or a removed parent', async () => {
    const f = await family();
    const g = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    const r = await raise(sql, l, f.t);
    for (const who of [f.t, f.child, g.parent]) {
      expect(await code(share(r, who, b.id))).toBe('42501');
      expect(await code(unavailable(r, who))).toBe('42501');
    }
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE parent_id = ${f.parent2} AND student_id = ${f.child}`;
    expect(await code(unavailable(r, f.parent2))).toBe('42501');
    // A parent cannot use "no longer needed", and AA Pro cannot close a request on a live lesson.
    expect(
      await code(sql`UPDATE material_requests SET status = 'no_longer_needed', closed_by = 'parent', closed_by_account = ${f.parent}
                     WHERE id = ${r}`),
    ).toBe('23514');
    expect(
      await code(sql`UPDATE material_requests SET status = 'no_longer_needed', closed_by = 'aa_pro' WHERE id = ${r}`),
    ).toBe('23514');
    expect((await req(r)).status).toBe('open');
  });

  it('only the lesson’s teacher may withdraw; a parent cannot answer after the lesson ended', async () => {
    const f = await family();
    const other = await teacher();
    const l = await lesson(f);
    const r = await raise(sql, l, f.t);
    expect(await code(withdraw(r, other))).toBe('42501');
    expect(await code(withdraw(r, f.parent))).toBe('42501');
    await withdraw(r, f.t);
    expect(await req(r)).toMatchObject({ status: 'no_longer_needed', closed_by: 'teacher', close_reason: null });
    const l2 = await lesson(f);
    await answerLesson(sql, f.t, l2, 'accept');
    const r2 = await raise(sql, l2, f.t);
    await endLesson(l2);
    expect(await code(unavailable(r2, f.parent))).toBe('23514');
  });
});

describe('TL-2 (0033): final states and history (TL2-1)', () => {
  it('an answered request never changes again; nothing about a request is editable; rows are kept with the lesson', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    const r = await raise(sql, l, f.t);
    await share(r, f.parent, b.id);
    expect(await code(unavailable(r, f.parent))).toBe('23514');
    expect(await code(withdraw(r, f.t))).toBe('23514');
    expect(await code(sql`UPDATE material_requests SET status = 'open' WHERE id = ${r}`)).toBe('23514');
    expect(await code(sql`UPDATE material_requests SET shared_label = 'Other' WHERE id = ${r}`)).toBe('23514');
    const o = await raise(sql, l, f.t);
    expect(await code(sql`UPDATE material_requests SET description = 'Changed' WHERE id = ${o}`)).toBe('23514');
    expect(await code(sql`UPDATE material_requests SET lesson_id = ${await lesson(f)} WHERE id = ${o}`)).toBe('23514');
    expect(await code(sql`DELETE FROM material_requests WHERE id = ${r}`)).toBe('23514');
    // The book later deleted: the reference clears, the label stays as history.
    await sql`DELETE FROM book_children WHERE book_id = ${b.id}`;
    await sql`DELETE FROM book_chapters WHERE book_id = ${b.id}`;
    await sql`DELETE FROM books WHERE id = ${b.id}`;
    expect(await req(r)).toMatchObject({ status: 'shared', shared_book_id: null, shared_label: 'Maths book' });
  });
});

describe('TL-2 (0033): audit references can be cleared only by a real deletion (ON DELETE SET NULL)', () => {
  const blank = (id: string, col: 'closed_by_account' | 'shared_book_id' | 'shared_chapter_id' | 'raised_by') =>
    sql.unsafe(`UPDATE material_requests SET ${col} = NULL WHERE id = $1`, [id]);
  const swap = (
    id: string,
    col: 'closed_by_account' | 'shared_book_id' | 'shared_chapter_id' | 'raised_by',
    v: string,
  ) => sql.unsafe(`UPDATE material_requests SET ${col} = $2 WHERE id = $1`, [id, v]);

  it('a direct UPDATE cannot blank or swap who asked, who answered, or what was shared, while those rows exist', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const other = await book(f.parent, f.child, { title: 'Other book' });
    const l = await lesson(f);
    const shared = await raise(sql, l, f.t);
    await share(shared, f.parent2, b.id, b.chapters[0]!);
    const unav = await raise(sql, l, f.t);
    await unavailable(unav, f.parent);
    const withdrawn = await raise(sql, l, f.t);
    await withdraw(withdrawn, f.t);
    const open = await raise(sql, l, f.t);
    const history = async () =>
      sql`SELECT id, raised_by, status, closed_at, closed_by, closed_by_account, shared_book_id, shared_chapter_id,
                 shared_label, answer_note FROM material_requests WHERE lesson_id = ${l} ORDER BY id`;
    const before = await history();
    for (const col of ['closed_by_account', 'shared_book_id', 'shared_chapter_id', 'raised_by'] as const)
      expect(await code(blank(shared, col))).toBe('23514');
    for (const id of [unav, withdrawn]) {
      expect(await code(blank(id, 'closed_by_account'))).toBe('23514');
      expect(await code(blank(id, 'raised_by'))).toBe('23514');
    }
    expect(await code(blank(open, 'raised_by'))).toBe('23514');
    // Swapping to another real row is refused too.
    expect(await code(swap(shared, 'closed_by_account', f.parent))).toBe('23514');
    expect(await code(swap(shared, 'shared_book_id', other.id))).toBe('23514');
    expect(await code(swap(shared, 'shared_chapter_id', b.chapters[1]!))).toBe('23514');
    expect(await code(swap(open, 'raised_by', f.parent))).toBe('23514');
    // And clearing a reference while answering (open -> shared) is refused as well.
    expect(
      await code(sql`UPDATE material_requests SET status = 'unavailable', closed_by = 'parent', closed_by_account = ${f.parent},
                     raised_by = NULL WHERE id = ${open}`),
    ).toBe('23514');
    expect(await history()).toEqual(before);
  });

  it('a real deletion of the chapter, the book or the answering parent still clears the reference; the rest is kept', async () => {
    const f = await family();
    const b = await book(f.parent, f.child, { title: 'Maths Practice' });
    const l = await lesson(f);
    const r = await raise(sql, l, f.t);
    await share(r, f.parent2, b.id, b.chapters[0]!);
    const kept = { status: 'shared', closed_by: 'parent', shared_label: 'Maths Practice · 1. Fractions' };
    await sql`DELETE FROM book_chapters WHERE id = ${b.chapters[0]!}`;
    expect(await req(r)).toMatchObject({
      ...kept,
      shared_chapter_id: null,
      shared_book_id: b.id,
      closed_by_account: f.parent2,
    });
    await sql`DELETE FROM book_children WHERE book_id = ${b.id}`;
    await sql`DELETE FROM book_chapters WHERE book_id = ${b.id}`;
    await sql`DELETE FROM books WHERE id = ${b.id}`;
    expect(await req(r)).toMatchObject({ ...kept, shared_book_id: null, closed_by_account: f.parent2 });
    await sql`DELETE FROM accounts WHERE id = ${f.parent2}`;
    const after = await req(r);
    expect(after).toMatchObject({ ...kept, closed_by_account: null, raised_by: f.t });
    expect(after.closed_at).not.toBeNull();
  });
});

describe('TL-2 (0033): automatic closure follows the lesson lifecycle (TL2-7, safeguard 4)', () => {
  it('declined, withdrawn and cancelled lessons close their open requests; answered ones stay as they were', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const d = await lesson(f);
    const rd = await raise(sql, d, f.t);
    const rdShared = await raise(sql, d, f.t);
    await share(rdShared, f.parent, b.id);
    await answerLesson(sql, f.t, d, 'decline');
    expect(await req(rd)).toMatchObject({
      status: 'no_longer_needed',
      closed_by: 'aa_pro',
      close_reason: 'lesson_closed',
    });
    expect((await req(rdShared)).status).toBe('shared');
    const w = await lesson(f);
    const rw = await raise(sql, w, f.t);
    await withdrawLesson(sql, f.parent2, w);
    expect((await req(rw)).close_reason).toBe('lesson_closed');
    const c = await lesson(f);
    await answerLesson(sql, f.t, c, 'accept');
    const rc = await raise(sql, c, f.t);
    await cancelLesson(sql, { id: f.t, role: 'teacher' }, c);
    expect((await req(rc)).close_reason).toBe('lesson_closed');
  });

  it('an expired lesson request closes its open requests', async () => {
    const f = await family();
    const l = await lesson(f);
    const r = await raise(sql, l, f.t);
    // Test-only: make the request overdue, then run the existing expiry function (unchanged, 0029).
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lessons SET requested_at = now() - interval '49 hours',
               reply_deadline = LEAST(now() - interval '1 hour', starts_at - interval '2 hours') WHERE id = ${l}`;
    });
    await sql`SELECT lessons_expire_overdue()`;
    expect((await sql`SELECT status FROM lessons WHERE id = ${l}`)[0]!.status).toBe('expired');
    expect(await req(r)).toMatchObject({ status: 'no_longer_needed', close_reason: 'lesson_closed' });
  });

  it('removing the teacher: closed lessons close their requests; a lesson kept under OC-53 keeps them open until it ends', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const later = await lesson(f);
    await answerLesson(sql, f.t, later, 'accept');
    const pending = await lesson(f);
    const soon = await lessonIn(f, 10); // starts in 10 minutes: kept under OC-53 Option A
    const rLater = await raise(sql, later, f.t);
    const rPending = await raise(sql, pending, f.t);
    const rSoon = await raise(sql, soon, f.t);
    await removeTeacher(sql, f.parent, f.t);
    expect((await sql`SELECT status FROM lessons WHERE id = ${soon}`)[0]!.status).toBe('confirmed');
    expect((await req(rLater)).close_reason).toBe('lesson_closed');
    expect((await req(rPending)).close_reason).toBe('lesson_closed');
    expect((await req(rSoon)).status).toBe('open');
    // The teacher can no longer view anything, so a share is refused; "unavailable" is still possible.
    expect(await code(share(rSoon, f.parent, b.id))).toBe('42501');
    // And no new request on the kept lesson (the teacher is no longer linked).
    expect(await code(raise(sql, soon, f.t))).toBe('42501');
    // Once the kept lesson has ended, the sweep closes it as "lesson ended"; a second run finds nothing.
    await endLesson(soon);
    const swept = (await sql<{ id: string }[]>`SELECT material_requests_close_ended() AS id`).map((x) => x.id);
    expect(swept).toContain(rSoon);
    expect(await req(rSoon)).toMatchObject({
      status: 'no_longer_needed',
      closed_by: 'aa_pro',
      close_reason: 'lesson_ended',
    });
    const again = (await sql<{ id: string }[]>`SELECT material_requests_close_ended() AS id`).map((x) => x.id);
    expect(again).not.toContain(rSoon);
  });

  it('a teacher deactivated by an admin (D3A-13): cancelled and declined lessons close their requests', async () => {
    const f = await family();
    const pending = await lesson(f);
    const confirmed = await lesson(f);
    await answerLesson(sql, f.t, confirmed, 'accept');
    const rp = await raise(sql, pending, f.t);
    const rc = await raise(sql, confirmed, f.t);
    const owner = await createAdult(sql, 'superadmin');
    expect(await setAccountActive(sql, owner, f.t, { active: false, reason: 'Test deactivation' })).toEqual({
      ok: true,
    });
    expect(await req(rp)).toMatchObject({
      status: 'no_longer_needed',
      closed_by: 'aa_pro',
      close_reason: 'lesson_closed',
    });
    expect(await req(rc)).toMatchObject({
      status: 'no_longer_needed',
      closed_by: 'aa_pro',
      close_reason: 'lesson_closed',
    });
  });

  it('unticking the subject closes that subject’s lessons and so their requests', async () => {
    const f = await family(undefined, ['maths', 'science']);
    const l = await lesson(f);
    const r = await raise(sql, l, f.t);
    await updateTeacherLinks(sql, f.parent, f.t, [{ childId: f.child, subjects: ['science'] }]);
    expect(await req(r)).toMatchObject({ status: 'no_longer_needed', close_reason: 'lesson_closed' });
  });
});

describe('TL-2 (0033): a request never changes the lesson or anyone’s access (safeguards 1 and 3)', () => {
  it('lesson, chapters, books, assignments, links and meeting permissions are byte-identical across every transition', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const notAssigned = await book(f.parent, null);
    const l = await lesson(f, { chapterIds: [b.chapters[0]!] });
    await answerLesson(sql, f.t, l, 'accept');
    // A live meeting-link permission and a saved meeting link (0030), so both are really compared.
    await sql`INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by) VALUES (${f.t}, ${f.child}, ${f.parent})`;
    await sql`INSERT INTO lesson_meeting_links (lesson_id, url, set_by)
              VALUES (${l}, 'https://us02web.zoom.us/wc/join/81234567890?pwd=abc123', ${f.t})`;
    const before = await fingerprint(f, l);
    expect(before).not.toBeNull();
    const parts = await sql<{ p: number; m: number }[]>`
      SELECT (SELECT count(*)::int FROM meeting_link_permissions WHERE student_id = ${f.child}) AS p,
             (SELECT count(*)::int FROM lesson_meeting_links WHERE lesson_id = ${l}) AS m`;
    expect(parts[0]).toEqual({ p: 1, m: 1 });
    const r1 = await raise(sql, l, f.t, { position: 1 });
    const r2 = await raise(sql, l, f.t);
    const r3 = await raise(sql, l, f.t);
    const r4 = await raise(sql, l, f.t);
    await share(r1, f.parent, b.id, b.chapters[0]!);
    await unavailable(r2, f.parent2, 'Not at home');
    await withdraw(r3, f.t);
    expect(await code(share(r4, f.parent, notAssigned.id))).toBe('42501'); // refused: never assigns the book
    expect(await fingerprint(f, l)).toBe(before);
  });

  it('the same holds for a requested (not yet confirmed) lesson', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const l = await lesson(f);
    const before = await fingerprint(f, l);
    const r1 = await raise(sql, l, f.t);
    const r2 = await raise(sql, l, f.t);
    await share(r1, f.parent, b.id);
    await unavailable(r2, f.parent);
    await code(share(await raise(sql, l, f.t), f.parent, null));
    expect(await fingerprint(f, l)).toBe(before);
  });

  it('notifications may point at a material request (in-app list only)', async () => {
    const f = await family();
    const l = await lesson(f);
    const r = await raise(sql, l, f.t);
    expect(
      await code(sql`INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
                     VALUES (${f.parent}, 'action', 'material_requested', 'Material requested', '/parent/calendar',
                             'material_request', ${r}, ${`material_requested:${r}`})`),
    ).toBe('ok');
    expect(
      await code(sql`INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
                     VALUES (${f.parent}, 'update', 'x_note', 'X', '/parent', 'material_thing', ${r}, ${`x:${uniq()}`})`),
    ).toBe('23514');
  });
});
