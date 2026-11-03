import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * Fixes for the independent technical review of the TL-4 SQL (PR #142, review of 3 Nov 2026):
 * F-1 (DEF-TL4-07), F-2, F-4, F-6, F-7, F-8. F-5 (DEF-TL4-08) is in tl4Final.test.ts. Each test
 * failed against the draft as reviewed (b0981ab / 3bcc6db) and passes with the fix. Throw-away
 * databases, synthetic data only.
 */
const DRAFT = new URL('../../db/drafts/tl4_lesson_changes.sql', import.meta.url);
const ROLLBACK = new URL('../../db/drafts/tl4_lesson_changes_rollback.sql', import.meta.url);
const M0034 = new URL('../../db/migrations/0034_teacher_proposals.sql', import.meta.url);

const admin = testDb();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BASE = Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR;
const at = (ms: number) => new Date(BASE + ms);
type Q = postgres.TransactionSql;

async function newDb() {
  const name = `tl4rf_${uniq()}`;
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
  u.pathname = `/${name}`;
  const sql = postgres(u.toString(), { max: 10, onnotice: () => {} });
  await migrate(sql);
  await sql.unsafe(await readFile(DRAFT, 'utf8'));
  return { name, url: u.toString(), sql };
}

let D: Awaited<ReturnType<typeof newDb>>;
let sql: postgres.Sql;
beforeAll(async () => {
  D = await newDb();
  sql = D.sql;
});
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${D.name} WITH (FORCE)`);
  await admin.end();
});

function kit(sql: postgres.Sql) {
  async function teacher() {
    const t = await createAdult(sql, 'teacher');
    const owner = await createAdult(sql, 'superadmin');
    await sql`UPDATE accounts SET time_zone = 'UTC' WHERE id = ${t}`;
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
              VALUES (${t}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
    for (const d of [1, 2, 3, 4, 5, 6, 7])
      await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${t}, ${d}, 0, 1440)`;
    await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
              VALUES (${`t-${uniq()}ab`}, ${t}, true, 'INR', 60000, 30)`;
    return t;
  }
  async function family() {
    const t = await teacher();
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    const link = await activeLink(sql, { teacher: t, child, parent, subjects: ['maths'] });
    return { teacher: t, parent, child, link };
  }
  type F = Awaited<ReturnType<typeof family>>;
  async function confirmed(f: F, start: Date, minutes = 30, chapters: string[] = []) {
    const id = await sql.begin(async (t) => {
      const [l] = await t<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by)
        VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, ${minutes}, 'proposed', ${f.teacher}) RETURNING id`;
      for (const [i, c] of chapters.entries())
        await t`INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id) VALUES (${l!.id}, ${i + 1}, 'planned', ${c})`;
      return l!.id;
    });
    await sql`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent} WHERE id = ${id}`;
    return id;
  }
  const proposeChange = (f: F, o: string, start: Date, minutes = 30, c: postgres.Sql | Q = sql) =>
    c<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by, replaces_lesson_id)
      VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, ${minutes}, 'proposed', ${f.teacher}, ${o}) RETURNING id`.then(
      (r) => r[0]!.id,
    );
  const requestChange = (f: F, o: string, start: Date, minutes = 30) =>
    sql<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, requested_by, replaces_lesson_id)
      VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, ${minutes}, 'requested', ${f.parent}, ${o}) RETURNING id`.then(
      (r) => r[0]!.id,
    );
  async function accept(c: Q, f: F, o: string, r: string) {
    await c`SELECT 1 FROM teacher_student_links WHERE id = ${f.link} FOR SHARE`;
    await c`SELECT lessons_lock_pair(${o}, ${r})`;
    if ((await c`SELECT 1 FROM lessons WHERE id = ${r} AND status = 'requested'`).length)
      return c`UPDATE lessons SET status = 'confirmed' WHERE id = ${r} RETURNING id`;
    return c`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent} WHERE id = ${r} RETURNING id`;
  }
  const st = async (id: string) =>
    (
      await sql<
        { status: string; close_reason: string | null }[]
      >`SELECT status, close_reason FROM lessons WHERE id = ${id}`
    )[0]!;
  async function book(f: F, titles: string[]) {
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO books (owner_id, title, subject, form, status) VALUES (${f.parent}, 'Maths (sample)', 'maths', 'chapter_files', 'published')
      RETURNING id`;
    const ch: string[] = [];
    for (const [i, t] of titles.entries())
      ch.push(
        (
          await sql<
            { id: string }[]
          >`INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${t}) RETURNING id`
        )[0]!.id,
      );
    await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${f.child})`;
    return ch;
  }
  const ask = async (f: F, l: string, what: string) =>
    (
      await sql<{ id: string }[]>`
        INSERT INTO material_requests (lesson_id, raised_by, description) VALUES (${l}, ${f.teacher}, ${what}) RETURNING id`
    )[0]!.id;
  return { teacher, family, confirmed, proposeChange, requestChange, accept, st, book, ask };
}

describe('F-1 / DEF-TL4-07: a teacher’s move may overlap its own original, and nothing else', () => {
  it('a proposal overlapping only its original is allowed and the swap commits', async () => {
    const k = kit(sql);
    const f = await k.family();
    const o = await k.confirmed(f, at(DAY));
    const r = await k.proposeChange(f, o, at(DAY + 15 * MIN));
    await sql.begin((t) => k.accept(t, f, o, r));
    expect(await k.st(o)).toEqual({ status: 'cancelled', close_reason: 'rescheduled' });
    expect((await k.st(r)).status).toBe('confirmed');
  });

  it('same start, longer lesson (only the length changes) is allowed', async () => {
    const k = kit(sql);
    const f = await k.family();
    const o = await k.confirmed(f, at(DAY + 3 * HOUR), 30);
    const r = await k.proposeChange(f, o, at(DAY + 3 * HOUR), 40);
    await sql.begin((t) => k.accept(t, f, o, r));
    expect((await k.st(r)).status).toBe('confirmed');
  });

  it('still refused over another confirmed lesson of the same teacher (another child)', async () => {
    const k = kit(sql);
    const f = await k.family();
    const parent2 = await createAdult(sql, 'parent');
    const child2 = await createChild(sql, parent2);
    const link2 = await activeLink(sql, { teacher: f.teacher, child: child2, parent: parent2, subjects: ['maths'] });
    const f2 = { teacher: f.teacher, parent: parent2, child: child2, link: link2 };
    const o = await k.confirmed(f, at(DAY + 6 * HOUR));
    await k.confirmed(f2, at(DAY + 7 * HOUR));
    await expect(k.proposeChange(f, o, at(DAY + 6 * HOUR + 45 * MIN))).rejects.toThrow(/overlaps a confirmed lesson/);
  });

  it('still refused over another confirmed lesson of the same child (another teacher)', async () => {
    const k = kit(sql);
    const f = await k.family();
    const t2 = await k.teacher();
    const link2 = await activeLink(sql, { teacher: t2, child: f.child, parent: f.parent, subjects: ['maths'] });
    const g = { ...f, teacher: t2, link: link2 };
    const o = await k.confirmed(f, at(DAY + 9 * HOUR));
    await k.confirmed(g, at(DAY + 10 * HOUR));
    await expect(k.proposeChange(f, o, at(DAY + 9 * HOUR + 45 * MIN))).rejects.toThrow(/overlaps a confirmed lesson/);
  });

  it('still refused when it overlaps the original AND a second lesson of the same teacher and child', async () => {
    const k = kit(sql);
    const f = await k.family();
    const o = await k.confirmed(f, at(DAY + 12 * HOUR));
    await k.confirmed(f, at(DAY + 13 * HOUR));
    // 12:25-13:05 overlaps the original (to 12:30) and the other lesson (from 13:00).
    await expect(k.proposeChange(f, o, at(DAY + 12 * HOUR + 25 * MIN), 40)).rejects.toThrow(
      /overlaps a confirmed lesson/,
    );
  });

  it('pointing the change at another family’s lesson does not borrow the exception', async () => {
    const k = kit(sql);
    const f = await k.family();
    const other = await k.family();
    const foreign = await k.confirmed(other, at(2 * DAY));
    await expect(k.proposeChange(f, foreign, at(2 * DAY))).rejects.toThrow(/same teacher, child and subject/);
  });

  it('an ordinary (non-move) proposal over a confirmed lesson is still refused', async () => {
    const k = kit(sql);
    const f = await k.family();
    await k.confirmed(f, at(3 * DAY));
    await expect(
      sql`INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by)
          VALUES (${f.teacher}, ${f.child}, 'maths', ${at(3 * DAY + 15 * MIN)}, 30, 'proposed', ${f.teacher})`,
    ).rejects.toThrow(/overlaps a confirmed lesson/);
  });

  it('lessons_before_insert is 0034’s body with exactly one predicate added', async () => {
    const fn = (s: string) => {
      const a = s.indexOf('CREATE OR REPLACE FUNCTION lessons_before_insert()');
      expect(a).toBeGreaterThanOrEqual(0);
      return s.slice(a, s.indexOf('END $$;', a) + 7);
    };
    const draft = fn(await readFile(DRAFT, 'utf8'));
    const added = '\n                 AND x.id IS DISTINCT FROM NEW.replaces_lesson_id';
    expect(draft).toContain(added);
    expect(draft.replace(added, '')).toBe(fn(await readFile(M0034, 'utf8')));
  });
});

describe('F-2 (Q-B): a move’s chapters are its own or the original’s, never a mix', () => {
  it('a teacher accepting a parent’s move cannot add planned chapters; nothing changes', async () => {
    const k = kit(sql);
    const f = await k.family();
    const ch = await k.book(f, ['Fractions (sample)', 'Decimals (sample)', 'Shapes (sample)']);
    const o = await k.confirmed(f, at(8 * DAY), 30, [ch[0]!]);
    const r = await k.requestChange(f, o, at(9 * DAY));
    await expect(
      sql.begin(async (t) => {
        await k.accept(t, f, o, r);
        await t`INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id) VALUES (${r}, 2, 'planned', ${ch[2]!})`;
      }),
    ).rejects.toThrow(/chapters come with the move itself/);
    expect((await k.st(o)).status).toBe('confirmed');
    expect((await k.st(r)).status).toBe('requested');
    expect(await sql`SELECT 1 FROM lesson_chapters WHERE lesson_id = ${r}`).toHaveLength(0);
  });

  it('the swap still copies the original’s planned chapters (C1), and a teacher’s move still brings its own (C2)', async () => {
    const k = kit(sql);
    const f = await k.family();
    const ch = await k.book(f, ['Fractions (sample)', 'Decimals (sample)']);
    const o1 = await k.confirmed(f, at(10 * DAY), 30, [ch[0]!]);
    const r1 = await k.requestChange(f, o1, at(10 * DAY + 2 * HOUR));
    await sql.begin((t) => k.accept(t, f, o1, r1));
    expect(await sql`SELECT book_chapter_id FROM lesson_chapters WHERE lesson_id = ${r1} ORDER BY position`).toEqual([
      { book_chapter_id: ch[0]! },
    ]);
    const o2 = await k.confirmed(f, at(11 * DAY), 30, [ch[0]!]);
    const r2 = await sql.begin(async (t) => {
      const id = await k.proposeChange(f, o2, at(11 * DAY + 2 * HOUR), 30, t);
      await t`INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id) VALUES (${id}, 1, 'planned', ${ch[1]!})`;
      return id;
    });
    await sql.begin((t) => k.accept(t, f, o2, r2));
    expect(await sql`SELECT book_chapter_id FROM lesson_chapters WHERE lesson_id = ${r2} ORDER BY position`).toEqual([
      { book_chapter_id: ch[1]! },
    ]);
  });
});

describe('F-8: the swap’s chapter-copy exception applies only to a move without chapters of its own', () => {
  it('inside the swap transaction, an original chapter cannot be added to a move that brought its own', async () => {
    const k = kit(sql);
    const f = await k.family();
    const ch = await k.book(f, ['Fractions (sample)', 'Decimals (sample)', 'Shapes (sample)']);
    const o = await k.confirmed(f, at(12 * DAY), 30, [ch[0]!, ch[1]!]);
    const r = await sql.begin(async (t) => {
      const id = await k.proposeChange(f, o, at(13 * DAY), 30, t);
      await t`INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id) VALUES (${id}, 1, 'planned', ${ch[2]!})`;
      return id;
    });
    await expect(
      sql.begin(async (t) => {
        await k.accept(t, f, o, r);
        await t`INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id, label, intent)
                SELECT ${r}, position, source, book_chapter_id, label, intent FROM lesson_chapters
                WHERE lesson_id = ${o} AND position = 2`;
      }),
    ).rejects.toThrow();
    expect((await k.st(o)).status).toBe('confirmed');
    expect(await sql`SELECT position FROM lesson_chapters WHERE lesson_id = ${r}`).toHaveLength(1);
  });
});

describe('F-6: an overdue change that no sweep has closed does not block a new one', () => {
  it('the overdue change is expired and the new change is created', async () => {
    const k = kit(sql);
    const f = await k.family();
    const o = await k.confirmed(f, at(20 * DAY));
    const r = await k.proposeChange(f, o, at(19 * DAY));
    await sql.begin(async (t) => {
      await t.unsafe('SET LOCAL session_replication_role = replica');
      await t`UPDATE lessons SET requested_at = now() - interval '50 hours', reply_deadline = now() - interval '2 hours' WHERE id = ${r}`;
    });
    const r2 = await k.proposeChange(f, o, at(18 * DAY));
    expect((await k.st(r)).status).toBe('expired');
    expect((await k.st(r2)).status).toBe('proposed');
  });
});

describe('F-7: the per-parent rule is checked on the real counts after the swap’s writes', () => {
  it('a stray extra open request written during the swap is caught: after 6 > max(5, before 5); nothing changes', async () => {
    const k = kit(sql);
    const f = await k.family();
    const o = await k.confirmed(f, at(22 * DAY));
    const other = await k.confirmed(f, at(23 * DAY));
    await k.ask(f, o, 'Carried (sample)');
    for (const n of [1, 2, 3, 4]) await k.ask(f, other, `Other ${n} (sample)`);
    const before = (await sql<{ n: number }[]>`SELECT tl4_parent_open_count(${f.parent}) AS n`)[0]!.n;
    expect(before).toBe(5);
    const r = await k.proposeChange(f, o, at(22 * DAY + 2 * HOUR));
    // Fault injection on this throw-away database only: a defect that writes one more open request
    // for the child while the swap copies a request (the kind of bug the re-count exists to catch).
    const fn = `f7_fault_${uniq()}`;
    await sql.unsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        IF NEW.logical_request_id <> NEW.id THEN
          INSERT INTO material_requests (lesson_id, raised_by, description) VALUES ('${other}', NEW.raised_by, 'Injected (sample)');
        END IF;
        RETURN NULL;
      END $f$`);
    await sql.unsafe(`CREATE TRIGGER ${fn} AFTER INSERT ON material_requests FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      await expect(sql.begin((t) => k.accept(t, f, o, r))).rejects.toThrow(
        /material_request_parent_limit.*before 5, after 6/,
      );
    } finally {
      await sql.unsafe(`DROP TRIGGER ${fn} ON material_requests`);
      await sql.unsafe(`DROP FUNCTION ${fn}()`);
    }
    expect((await k.st(o)).status).toBe('confirmed');
    expect((await k.st(r)).status).toBe('proposed');
    expect((await sql<{ n: number }[]>`SELECT tl4_parent_open_count(${f.parent}) AS n`)[0]!.n).toBe(5);
    // Without the fault the same move is accepted (the real effect is 0).
    await sql.begin((t) => k.accept(t, f, o, r));
    expect((await k.st(r)).status).toBe('confirmed');
  });
});

describe('F-4: the rollback locks before it checks', () => {
  it('a change in flight when the rollback starts is waited for, then the rollback refuses and changes nothing', async () => {
    const d = await newDb();
    const mon = postgres(d.url, { max: 1, onnotice: () => {} });
    try {
      const k = kit(d.sql);
      const f = await k.family();
      const o = await k.confirmed(f, at(20 * DAY));
      const s = await d.sql.reserve();
      await s`BEGIN`;
      await k.proposeChange(f, o, at(10 * DAY), 30, s as unknown as Q);
      const rb = new Promise<string>((res) => {
        execFile('psql', ['-X', '-q', '-d', d.url, '-f', ROLLBACK.pathname], (_e, so, se) => res(so + se));
      });
      await expect
        .poll(
          async () =>
            (
              await mon`SELECT 1 FROM pg_stat_activity WHERE datname = ${d.name} AND wait_event_type = 'Lock'
                        AND query LIKE '%TL-4 rollback%'`
            ).length,
          { timeout: 10_000, interval: 50 },
        )
        .toBe(1);
      await s`COMMIT`;
      s.release();
      expect(await rb).toMatch(/rollback refused/);
      expect(
        await d.sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'lessons' AND column_name = 'replaces_lesson_id'`,
      ).toHaveLength(1);
      expect(await d.sql`SELECT 1 FROM lessons WHERE replaces_lesson_id = ${o} AND status = 'proposed'`).toHaveLength(
        1,
      );
    } finally {
      await mon.end();
      await d.sql.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${d.name} WITH (FORCE)`);
    }
  });
});
