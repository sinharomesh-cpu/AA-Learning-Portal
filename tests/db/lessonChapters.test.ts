import { afterAll, describe, expect, it } from 'vitest';
import { chaptersForRequest } from '@/server/books';
import {
  answerLesson,
  cancelLesson,
  lessonsForParent,
  lessonsForStudent,
  lessonsForTeacher,
  requestLesson,
  withdrawLesson,
} from '@/server/lessons';
import { removeTeacher, updateTeacherLinks } from '@/server/teacherLinks';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-1 (owner, 25 Oct 2026, 21:18 IST; D-TLS-6, -7, -10, -15, -19) and migration 0032: a parent
 * may name up to five chapters from the family's published books shared with the child in the
 * lesson's subject, or one topic, when requesting a lesson. Everything else about the request is
 * unchanged. Synthetic data only, on the throw-away database; the database clock decides.
 */
const sql = testDb();
afterAll(() => sql.end());

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR);
const at = (offsetMin: number) => new Date(BASE.getTime() + offsetMin * MIN);

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

/** Two parents of one child (Kiran), linked to a teacher in maths (and optionally science). */
async function family(t?: string, subjects = ['maths']) {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE accounts SET display_name = 'Kiran' WHERE id = ${child}`;
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher());
  await activeLink(sql, { teacher: tid, child, parent, subjects });
  return { parent, parent2, child, t: tid };
}

/** A book of separate chapters owned by `owner`, optionally assigned to `child`. */
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
  for (const [i, title] of (o.chapters ?? ['Fractions', 'Decimals', 'Shapes', 'Time', 'Money', 'Data']).entries()) {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${title}) RETURNING id`;
    chapters.push(c!.id);
  }
  if (child) await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child})`;
  return { id: b!.id, chapters };
}

const price = (start: Date, minutes = 30) => ({
  priceMinor: String(Math.floor((60000 * minutes * 2 + 60) / 120)),
  currency: 'INR',
  basis: 'listed',
  startsAt: start.toISOString(),
  minutes: String(minutes),
});
type Fam = { parent: string; child: string; t: string };
const ask = (f: Fam, start: Date, extra: { chapterIds?: unknown; topic?: unknown } = {}, parent = f.parent) =>
  requestLesson(sql, parent, { childId: f.child, teacherId: f.t, subject: 'maths', ...price(start), ...extra });
async function asked(f: Fam, start: Date, extra: { chapterIds?: unknown; topic?: unknown } = {}) {
  const r = await ask(f, start, extra);
  if (!r.ok) throw new Error(`request refused: ${r.reason}`);
  return r.id;
}
const rowsOf = (lesson: string) =>
  sql<Array<{ position: number; book_chapter_id: string | null; topic: string | null; label: string; source: string }>>`
    SELECT position, book_chapter_id, topic, label, source FROM lesson_chapters WHERE lesson_id = ${lesson} ORDER BY position`;
const lessonCount = async (child: string) =>
  (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lessons WHERE student_id = ${child}`)[0]!.n;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? 'err';
  }
};
/** Every row a TL-1 action could possibly touch outside lesson_chapters, as one fingerprint. */
const fingerprint = async (f: Fam) =>
  (
    await sql<{ h: string }[]>`
      SELECT md5(concat_ws('|',
        (SELECT string_agg(concat_ws(',', id, status, archived_at, title, subject), ';' ORDER BY id) FROM books WHERE owner_id = ${f.parent}),
        (SELECT string_agg(concat_ws(',', c.id, c.title, c.archived_at, c.complete), ';' ORDER BY c.id)
           FROM book_chapters c JOIN books b ON b.id = c.book_id WHERE b.owner_id = ${f.parent}),
        (SELECT string_agg(concat_ws(',', book_id, student_id), ';' ORDER BY book_id) FROM book_children WHERE student_id = ${f.child}),
        (SELECT string_agg(concat_ws(',', id, status, array_to_string(subjects, '+')), ';' ORDER BY id)
           FROM teacher_student_links WHERE student_id = ${f.child}),
        (SELECT string_agg(concat_ws(',', teacher_id, withdrawn_at), ';' ORDER BY teacher_id)
           FROM meeting_link_permissions WHERE student_id = ${f.child}))) AS h`
  )[0]!.h;

// ---------------------------------------------------------------------------------------------
describe('TL-1: which chapters a parent may name (chaptersForRequest = what 0032 accepts)', () => {
  it('only live, complete chapters of the family’s published books assigned to this child in the subject', async () => {
    const f = await family();
    const good = await book(f.parent, f.child, { title: 'Maths Practice', chapters: ['Fractions', 'Decimals'] });
    await book(f.parent, f.child, { title: 'Draft maths', status: 'draft' });
    await book(f.parent, f.child, { title: 'Science book', subject: 'science' });
    await book(f.parent, null, { title: 'Not assigned' });
    const archived = await book(f.parent, f.child, { title: 'Archived book' });
    await sql`UPDATE books SET archived_at = now() WHERE id = ${archived.id}`;
    const mixed = await book(f.parent, f.child, { title: 'Mixed', chapters: ['Live', 'Archived', 'Unfinished'] });
    await sql`UPDATE book_chapters SET archived_at = now() WHERE id = ${mixed.chapters[1]}`;
    await sql`UPDATE book_chapters SET complete = false WHERE id = ${mixed.chapters[2]}`;
    // The second parent sees the same list; a stranger and the teacher see nothing.
    const list = await chaptersForRequest(sql, f.parent, f.child, 'maths');
    expect(list.map((c) => c.label)).toEqual([
      'Maths Practice · 1. Fractions',
      'Maths Practice · 2. Decimals',
      'Mixed · 1. Live',
    ]);
    expect(list.map((c) => c.id)).toEqual([good.chapters[0], good.chapters[1], mixed.chapters[0]]);
    expect(await chaptersForRequest(sql, f.parent2, f.child, 'maths')).toHaveLength(3);
    const stranger = await createAdult(sql, 'parent');
    expect(await chaptersForRequest(sql, stranger, f.child, 'maths')).toEqual([]);
    expect(await chaptersForRequest(sql, f.t, f.child, 'maths')).toEqual([]);
    expect(await chaptersForRequest(sql, f.parent, f.child, 'not-a-subject')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-1: requesting with chapters or a topic', () => {
  it('1, 3 and 5 chapters, in the parent’s order, labelled by the database from the parent’s titles', async () => {
    const f = await family();
    const b = await book(f.parent, f.child, { title: 'Maths Practice' });
    const one = await asked(f, at(0), { chapterIds: [b.chapters[1]] });
    expect(await rowsOf(one)).toEqual([
      {
        position: 1,
        book_chapter_id: b.chapters[1],
        topic: null,
        label: 'Maths Practice · 2. Decimals',
        source: 'requested',
      },
    ]);
    const three = await asked(f, at(60), { chapterIds: [b.chapters[2], b.chapters[0], b.chapters[4]] });
    expect((await rowsOf(three)).map((r) => r.label)).toEqual([
      'Maths Practice · 3. Shapes',
      'Maths Practice · 1. Fractions',
      'Maths Practice · 5. Money',
    ]);
    const five = await asked(f, at(120), { chapterIds: b.chapters.slice(0, 5) });
    expect(await rowsOf(five)).toHaveLength(5);
  });

  it('one topic, trimmed; the database writes the label', async () => {
    const f = await family();
    const id = await asked(f, at(0), { topic: '   fractions   revision  ' });
    expect(await rowsOf(id)).toEqual([
      {
        position: 1,
        book_chapter_id: null,
        topic: 'fractions revision',
        label: 'fractions revision',
        source: 'requested',
      },
    ]);
  });

  it('nothing chosen: no rows, and the lesson row is exactly what it was before TL-1', async () => {
    const f = await family();
    const plain = await asked(f, at(0));
    const empty = await asked(f, at(60), { chapterIds: [], topic: '' });
    expect(await rowsOf(plain)).toEqual([]);
    expect(await rowsOf(empty)).toEqual([]);
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'lessons' ORDER BY ordinal_position`;
    expect(cols.map((c) => c.column_name)).not.toContain('chapters'); // lessons itself is unchanged
    const [a, b] = await sql<
      Record<string, unknown>[]
    >`SELECT * FROM lessons WHERE id IN (${plain}, ${empty}) ORDER BY starts_at`;
    for (const k of [
      'status',
      'subject',
      'minutes',
      'currency',
      'price_minor',
      'price_basis',
      'requested_by',
      'closed_by',
    ])
      expect(b![k]).toEqual(a![k]);
  });

  it('refused, with nothing saved: 6 chapters, a duplicate, chapter and topic together, a long topic, bad ids', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const before = await lessonCount(f.child);
    for (const extra of [
      { chapterIds: b.chapters.slice(0, 6) },
      { chapterIds: [b.chapters[0], b.chapters[0]] },
      { chapterIds: [b.chapters[0]], topic: 'and a topic' },
      { topic: 'x'.repeat(121) },
      { chapterIds: ['not-a-uuid'] },
      { chapterIds: [{ id: b.chapters[0] }] },
    ]) {
      expect(await ask(f, at(0), extra), JSON.stringify(extra)).toEqual({ ok: false, reason: 'chapters' });
    }
    expect(await lessonCount(f.child)).toBe(before);
    // 120 characters is fine.
    expect((await ask(f, at(0), { topic: 'y'.repeat(120) })).ok).toBe(true);
  });

  it('refused, with no lesson created: chapters that are not shared with this child in this subject', async () => {
    const f = await family();
    const other = await family(f.t); // another family with the same teacher
    const draft = await book(f.parent, f.child, { status: 'draft' });
    const science = await book(f.parent, f.child, { subject: 'science' });
    const unassigned = await book(f.parent, null);
    const theirs = await book(other.parent, other.child, { title: 'Their book' });
    const archived = await book(f.parent, f.child);
    await sql`UPDATE book_chapters SET archived_at = now() WHERE id = ${archived.chapters[0]}`;
    const fp = await fingerprint(f);
    const before = await lessonCount(f.child);
    for (const id of [
      draft.chapters[0],
      science.chapters[0],
      unassigned.chapters[0],
      theirs.chapters[0],
      archived.chapters[0],
    ]) {
      expect(await ask(f, at(0), { chapterIds: [id] })).toEqual({ ok: false, reason: 'chapters' });
    }
    expect(await lessonCount(f.child)).toBe(before);
    expect(await fingerprint(f)).toBe(fp); // nothing else changed either
    // A stranger can't request at all (unchanged rule), with or without chapters.
    const stranger = await createAdult(sql, 'parent');
    expect((await ask(f, at(0), { chapterIds: [theirs.chapters[0]] }, stranger)).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-1: the database is the second line of defence (0032)', () => {
  it('chapters only inside the request’s own transaction, never later, never on another status', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await asked(f, at(0));
    expect(
      await code(
        sql`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id) VALUES (${id}, 1, ${b.chapters[0]})`,
      ),
    ).toBe('23514');
    expect(await code(sql`INSERT INTO lesson_chapters (lesson_id, position, topic) VALUES (${id}, 1, 'later')`)).toBe(
      '23514',
    );
    expect((await answerLesson(sql, f.t, id, 'accept')).ok).toBe(true);
    expect(await code(sql`INSERT INTO lesson_chapters (lesson_id, position, topic) VALUES (${id}, 1, 'after')`)).toBe(
      '23514',
    );
    expect(await rowsOf(id)).toEqual([]);
  });

  it('rows never change; a caller’s label and source are replaced; chapters and a topic never mix', async () => {
    const f = await family();
    const b = await book(f.parent, f.child, { title: 'Maths Practice' });
    const id = await asked(f, at(0), { chapterIds: [b.chapters[0]] });
    expect(await code(sql`UPDATE lesson_chapters SET label = 'Invented' WHERE lesson_id = ${id}`)).toBe('23514');
    expect(await code(sql`UPDATE lesson_chapters SET book_chapter_id = ${b.chapters[1]} WHERE lesson_id = ${id}`)).toBe(
      '23514',
    );
    // Never deleted on their own while the lesson exists (D-TLS-15).
    expect(await code(sql`DELETE FROM lesson_chapters WHERE lesson_id = ${id}`)).toBe('23514');
    expect(await rowsOf(id)).toHaveLength(1);
    // Inside a request's own transaction (the only place rows can be added), straight SQL:
    const mixed = await code(
      sql.begin(async (tx) => {
        const [l] = await tx<{ id: string }[]>`
          INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, currency, price_minor, price_basis)
          VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${at(60)}, 30, 'INR', 30000, 'listed') RETURNING id`;
        await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id, label, source)
                 VALUES (${l!.id}, 1, ${b.chapters[0]}, 'Invented', 'requested')`;
        const [r] = await tx<{ label: string }[]>`SELECT label FROM lesson_chapters WHERE lesson_id = ${l!.id}`;
        expect(r!.label).toBe('Maths Practice · 1. Fractions');
        await tx`INSERT INTO lesson_chapters (lesson_id, position, topic) VALUES (${l!.id}, 2, 'a topic too')`;
      }),
    );
    expect(mixed).toBe('23514');
    expect(
      await code(
        sql.begin(async (tx) => {
          const [l] = await tx<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, currency, price_minor, price_basis)
        VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${at(120)}, 30, 'INR', 30000, 'listed') RETURNING id`;
          await tx`INSERT INTO lesson_chapters (lesson_id, position, topic, source) VALUES (${l!.id}, 1, 'planned?', 'planned')`;
        }),
      ),
    ).toBe('ok'); // a caller's 'planned' is replaced by 'requested' (teacher planning is a later phase)
    expect((await sql`SELECT source FROM lesson_chapters WHERE topic = 'planned?'`).map((r) => r.source)).toEqual([
      'requested',
    ]);
    // A sixth row, and a duplicate chapter, are refused by the table itself.
    expect(
      await code(
        sql.begin(async (tx) => {
          const [l] = await tx<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, currency, price_minor, price_basis)
        VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${at(180)}, 30, 'INR', 30000, 'listed') RETURNING id`;
          await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id) VALUES (${l!.id}, 6, ${b.chapters[0]})`;
        }),
      ),
    ).toBe('23514');
    expect(
      await code(
        sql.begin(async (tx) => {
          const [l] = await tx<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, currency, price_minor, price_basis)
        VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${at(240)}, 30, 'INR', 30000, 'listed') RETURNING id`;
          await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id) VALUES (${l!.id}, 1, ${b.chapters[0]})`;
          await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id) VALUES (${l!.id}, 2, ${b.chapters[0]})`;
        }),
      ),
    ).toBe('23505');
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-1: a request with chapters lives exactly like one without', () => {
  it('accept, cancel, decline and withdraw behave as before; notices carry no chapter text', async () => {
    const f = await family();
    const b = await book(f.parent, f.child, { title: 'Maths Practice' });
    const a = await asked(f, at(0), { chapterIds: [b.chapters[0]] });
    expect(await answerLesson(sql, f.t, a, 'accept')).toEqual({ ok: true });
    expect(await cancelLesson(sql, { id: f.parent2, role: 'parent' }, a)).toEqual({ ok: true });
    const d = await asked(f, at(60), { topic: 'Long division' });
    expect(await answerLesson(sql, f.t, d, 'decline', 'Not this week')).toEqual({ ok: true });
    const w = await asked(f, at(120), { chapterIds: [b.chapters[1]] });
    expect(await withdrawLesson(sql, f.parent2, w)).toEqual({ ok: true });
    // Chapters stay as history on closed lessons.
    for (const id of [a, d, w]) expect(await rowsOf(id)).toHaveLength(1);
    const texts = await sql<{ t: string }[]>`
      SELECT title || ' ' || body AS t FROM notifications WHERE entity_type = 'lesson' AND entity_id IN (${a}, ${d}, ${w})`;
    expect(texts.length).toBeGreaterThan(0);
    for (const n of texts) {
      expect(n.t).not.toContain('Maths Practice');
      expect(n.t).not.toContain('Long division');
    }
    const teacherNotes = await sql<{ t: string }[]>`
      SELECT title || ' ' || body AS t FROM notifications WHERE recipient_id = ${f.t} AND entity_id IN (${a}, ${d}, ${w})`;
    for (const n of teacherNotes) expect(n.t).not.toContain('Kiran');
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-1: who sees the chapters (D-TLS-10, D-TLS-19)', () => {
  it('both parents and the teacher (with reader links); the child only once confirmed; nobody else', async () => {
    const f = await family();
    const b = await book(f.parent, f.child, { title: 'Maths Practice' });
    const id = await asked(f, at(0), { chapterIds: [b.chapters[0], b.chapters[1]] });
    const labels = ['Maths Practice · 1. Fractions', 'Maths Practice · 2. Decimals'];
    for (const p of [f.parent, f.parent2]) {
      const l = (await lessonsForParent(sql, p)).find((x) => x.id === id)!;
      expect(l.chapters.map((c) => c.label)).toEqual(labels);
      expect(l.chapters.every((c) => c.shared && c.href === null)).toBe(true); // parents get no reader link here
    }
    const tl = (await lessonsForTeacher(sql, f.t)).find((x) => x.id === id)!;
    expect(tl.chapters.map((c) => [c.label, c.shared, c.href])).toEqual([
      [labels[0], true, `/books/${b.id}?chapter=${b.chapters[0]}`],
      [labels[1], true, `/books/${b.id}?chapter=${b.chapters[1]}`],
    ]);
    // The child: nothing while it is a request; titles once confirmed.
    expect((await lessonsForStudent(sql, f.child)).find((x) => x.id === id)).toBeUndefined();
    await answerLesson(sql, f.t, id, 'accept');
    const kl = (await lessonsForStudent(sql, f.child)).find((x) => x.id === id)!;
    expect(kl.chapters.map((c) => c.label)).toEqual(labels);
    expect(kl.chapters.every((c) => c.href === null)).toBe(true);
    // Another family, another teacher: the lesson isn't in their lists at all.
    const stranger = await family();
    expect((await lessonsForParent(sql, stranger.parent)).some((x) => x.id === id)).toBe(false);
    expect((await lessonsForTeacher(sql, stranger.t)).some((x) => x.id === id)).toBe(false);
    expect((await lessonsForStudent(sql, stranger.child)).some((x) => x.id === id)).toBe(false);
  });

  it('“No longer shared” when the book is unpublished, archived, unassigned or the chapter archived; labels kept', async () => {
    const f = await family();
    const b = await book(f.parent, f.child, { title: 'Maths Practice' });
    const ids: string[] = [];
    for (const i of [0, 1, 2, 3]) ids.push(await asked(f, at(i * 60), { chapterIds: [b.chapters[i]] }));
    const shared = async () =>
      (await lessonsForTeacher(sql, f.t))
        .filter((x) => ids.includes(x.id))
        .map((x) => [x.chapters[0]!.label, x.chapters[0]!.shared, x.chapters[0]!.href !== null]);
    expect((await shared()).every(([, s, h]) => s && h)).toBe(true);
    await sql`UPDATE book_chapters SET archived_at = now() WHERE id = ${b.chapters[0]}`;
    expect((await shared())[0]).toEqual(['Maths Practice · 1. Fractions', false, false]);
    await sql`UPDATE books SET status = 'draft' WHERE id = ${b.id}`;
    expect((await shared()).every(([, s, h]) => !s && !h)).toBe(true);
    await sql`UPDATE books SET status = 'published', archived_at = now() WHERE id = ${b.id}`;
    expect((await shared()).every(([, s]) => !s)).toBe(true);
    await sql`UPDATE books SET archived_at = NULL WHERE id = ${b.id}`;
    await sql`DELETE FROM book_children WHERE book_id = ${b.id}`;
    expect((await shared()).every(([, s]) => !s)).toBe(true);
    // Labels are never touched, for parents either.
    const parentView = (await lessonsForParent(sql, f.parent)).filter((x) => ids.includes(x.id));
    expect(parentView.map((x) => x.chapters[0]!.label)).toEqual([
      'Maths Practice · 1. Fractions',
      'Maths Practice · 2. Decimals',
      'Maths Practice · 3. Shapes',
      'Maths Practice · 4. Time',
    ]);
  });

  it('a chapter or book deleted outright: the reference is cleared by the database, the label stays', async () => {
    const f = await family();
    const b = await book(f.parent, f.child, { title: 'Maths Practice' });
    const id = await asked(f, at(0), { chapterIds: [b.chapters[0], b.chapters[1]] });
    await sql`DELETE FROM book_chapters WHERE id = ${b.chapters[0]}`;
    expect(await rowsOf(id)).toMatchObject([
      { position: 1, book_chapter_id: null, label: 'Maths Practice · 1. Fractions' },
      { position: 2, book_chapter_id: b.chapters[1] },
    ]);
    await sql`DELETE FROM books WHERE id = ${b.id}`;
    expect((await rowsOf(id)).map((r) => [r.book_chapter_id, r.label])).toEqual([
      [null, 'Maths Practice · 1. Fractions'],
      [null, 'Maths Practice · 2. Decimals'],
    ]);
    const tl = (await lessonsForTeacher(sql, f.t)).find((x) => x.id === id)!;
    expect(tl.chapters.every((c) => !c.shared && c.href === null)).toBe(true);
  });

  it('teacher link or subject ends: the request closes as before (link ended), chapters kept as history', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await asked(f, at(0), { chapterIds: [b.chapters[0]] });
    await updateTeacherLinks(sql, f.parent, f.t, [{ childId: f.child, subjects: ['science'] }]);
    const [l] = await sql<
      { status: string; close_reason: string }[]
    >`SELECT status, close_reason FROM lessons WHERE id = ${id}`;
    expect(l).toEqual({ status: 'declined', close_reason: 'link_ended' });
    expect(await rowsOf(id)).toHaveLength(1);
    await removeTeacher(sql, f.parent, f.t);
    expect((await lessonsForTeacher(sql, f.t)).some((x) => x.id === id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-1: rows go only with their lesson', () => {
  it('deleting the lesson itself (as an account removal would) removes its chapters', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await asked(f, at(0), { chapterIds: [b.chapters[0]] });
    await sql`DELETE FROM notifications WHERE entity_type = 'lesson' AND entity_id = ${id}`;
    await sql`DELETE FROM lessons WHERE id = ${id}`;
    expect(await rowsOf(id)).toEqual([]);
  });
});

describe('TL-1: no side effects', () => {
  it('requests with chapters change no book, assignment, link or permission', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    await sql`INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by) VALUES (${f.t}, ${f.child}, ${f.parent})`;
    const fp = await fingerprint(f);
    const id = await asked(f, at(0), { chapterIds: b.chapters.slice(0, 3) });
    await answerLesson(sql, f.t, id, 'accept');
    await asked(f, at(120), { topic: 'Times tables' });
    expect(await fingerprint(f)).toBe(fp);
  });
});
