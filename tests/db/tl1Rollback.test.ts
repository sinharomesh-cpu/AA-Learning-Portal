import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-1 (0032) migration and rollback on throw-away databases only: apply every migration, add a
 * sample lesson with chapters next to other data, run the prepared revert (db/rollback), check that
 * only lesson_chapters and its two functions are gone and every other row is untouched, then apply
 * 0032 again. Also: two builds migrating at the same moment apply 0032 exactly once. Nothing here
 * touches any shared database, and migrations 0027-0031 are not modified.
 */
const admin = testDb();
const name = `tl1rb_${uniq()}`;
let sql: postgres.Sql;

const objects = async () => ({
  table: (await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'lesson_chapters'`).length,
  functions: (
    await sql<{ p: string }[]>`SELECT proname AS p FROM pg_proc WHERE proname LIKE 'lesson_chapters%' ORDER BY 1`
  ).map((r) => r.p),
});
const GUARDS = {
  table: 1,
  triggers: ['lesson_chapters_before_delete', 'lesson_chapters_before_write'],
  functions: ['lesson_chapters_before_delete', 'lesson_chapters_before_write'],
};
const guards = async () => ({
  ...(await objects()),
  triggers: (
    await sql<{ t: string }[]>`
      SELECT tgname AS t FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'lesson_chapters' AND NOT t.tgisinternal ORDER BY 1`
  ).map((r) => r.t),
});
const revertSql = () => readFile(new URL('../../db/rollback/0032_revert_lesson_chapters.sql', import.meta.url), 'utf8');
/** Runs each top-level statement on its own (as plain `psql -f` does), carrying on after errors. */
const runEachStatement = async (text: string) => {
  const statements: string[] = [];
  let current = '';
  let inBody = false;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('--') && !inBody) continue;
    current += line + '\n';
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inBody = !inBody;
    if (!inBody && line.trimEnd().endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }
  const errors: string[] = [];
  for (const s of statements) {
    try {
      await sql.unsafe(s);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return errors;
};
const counts = async () =>
  (
    await sql<{ c: string }[]>`
      SELECT concat_ws(',', (SELECT count(*) FROM lessons), (SELECT count(*) FROM books),
                       (SELECT count(*) FROM book_chapters), (SELECT count(*) FROM book_children),
                       (SELECT count(*) FROM accounts), (SELECT count(*) FROM schema_migrations)) AS c`
  )[0]!.c;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
  url.pathname = `/${name}`;
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await migrate(sql);
});
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

describe('TL-1 rollback (0032)', () => {
  it('reverts cleanly, removes only lesson_chapters, keeps lessons and books, and can be applied again', async () => {
    expect(await objects()).toEqual({
      table: 1,
      functions: ['lesson_chapters_before_delete', 'lesson_chapters_before_write'],
    });
    // Sample data (rules skipped for this transaction only: this test is about the revert).
    const p = { id: await createAdult(sql, 'parent') };
    const t = { id: await createAdult(sql, 'teacher') };
    const k = { id: await createChild(sql, p.id) };
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      const [b] = await tx<{ id: string }[]>`
        INSERT INTO books (owner_id, title, subject, form, status) VALUES (${p.id}, 'Book', 'maths', 'chapter_files', 'published')
        RETURNING id`;
      const [c] = await tx<{ id: string }[]>`
        INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, 1, 'One') RETURNING id`;
      const [l] = await tx<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                             reply_deadline, currency, rate_minor, price_minor, price_basis)
        VALUES (${t.id}, ${k.id}, ${p.id}, 'maths', date_trunc('hour', now()) + interval '3 days', 30,
                date_trunc('hour', now()) + interval '3 days 30 minutes', now(), now() + interval '48 hours',
                'INR', 60000, 30000, 'listed') RETURNING id`;
      await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id, label) VALUES (${l!.id}, 1, ${c!.id}, 'Book · 1. One')`;
    });
    const before = await counts();
    const migrated = (await sql<{ name: string }[]>`SELECT name FROM schema_migrations ORDER BY name`).map(
      (r) => r.name,
    );
    expect(migrated.at(-1)).toBe('0032_lesson_chapters.sql');

    const revert = await readFile(
      new URL('../../db/rollback/0032_revert_lesson_chapters.sql', import.meta.url),
      'utf8',
    );
    await sql.begin((tx) => tx.unsafe(revert));
    expect(await objects()).toEqual({ table: 0, functions: [] });
    // Lessons, books, chapters, assignments, accounts and the migration record are untouched.
    expect(await counts()).toBe(before);
    // 0029's lesson rules are still in place and unchanged.
    expect(
      (
        await sql<
          { t: string }[]
        >`SELECT tgname AS t FROM pg_trigger WHERE tgrelid = 'lessons'::regclass AND NOT tgisinternal ORDER BY 1`
      ).map((r) => r.t),
    ).toEqual(['lessons_before_insert', 'lessons_before_update', 'lessons_drop_link_on_cancel']);

    const forward = await readFile(new URL('../../db/migrations/0032_lesson_chapters.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(forward));
    expect(await objects()).toEqual({
      table: 1,
      functions: ['lesson_chapters_before_delete', 'lesson_chapters_before_write'],
    });
    expect(await counts()).toBe(before);
  });

  it('review F1: run statement by statement, ignoring errors, while another table refers to lesson_chapters, it changes nothing', async () => {
    // The unsafe way to run it (plain psql -f: no single transaction, carries on after errors).
    // Whatever happens, lesson_chapters must never be left without its two guard triggers.
    await sql`CREATE TABLE tl1_dependent (lesson_id uuid, lesson_position smallint,
                FOREIGN KEY (lesson_id, lesson_position) REFERENCES lesson_chapters (lesson_id, position))`;
    try {
      const errors = await runEachStatement(await revertSql());
      expect(errors[0]).toMatch(/revert 0033 \(TL-2\) first/);
      // The guard refuses; DROP TABLE refuses (another table depends on it); both DROP FUNCTIONs
      // refuse (the table's triggers still use them).
      expect(errors.length).toBe(4);
      expect(await guards()).toEqual(GUARDS);
    } finally {
      await sql`DROP TABLE tl1_dependent`;
    }
  });

  it('review F1: after a revert, deleting 0032s migration record lets the runner apply the same file again', async () => {
    await sql.begin(async (tx) => tx.unsafe(await revertSql()));
    expect(await guards()).toEqual({ table: 0, triggers: [], functions: [] });
    const before = await counts();
    await sql`DELETE FROM schema_migrations WHERE name = '0032_lesson_chapters.sql'`;
    expect(await migrate(sql)).toEqual(['0032_lesson_chapters.sql']);
    expect(await guards()).toEqual(GUARDS);
    const file = await readFile(new URL('../../db/migrations/0032_lesson_chapters.sql', import.meta.url), 'utf8');
    const [row] = await sql<
      { checksum: string }[]
    >`SELECT checksum FROM schema_migrations WHERE name = '0032_lesson_chapters.sql'`;
    expect(row!.checksum).toBe(createHash('sha256').update(file).digest('hex'));
    expect(await counts()).toBe(before);
    // A second run applies nothing.
    expect(await migrate(sql)).toEqual([]);
  });

  it('0032 is applied exactly once when two builds migrate at the same moment', async () => {
    const { mkdtemp, readdir, copyFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const src = new URL('../../db/migrations/', import.meta.url).pathname;
    const upTo31 = await mkdtemp(join(tmpdir(), 'tl1-'));
    for (const f of await readdir(src)) if (f < '0032') await copyFile(join(src, f), join(upTo31, f));
    const name2 = `tl1c_${uniq()}`;
    await admin.unsafe(`CREATE DATABASE ${name2}`);
    const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
    url.pathname = `/${name2}`;
    const a = postgres(url.toString(), { max: 1, onnotice: () => {} });
    const b = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      await migrate(a, { dir: upTo31 }); // the shared test database as it is today: 0001-0031
      const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
      expect([...ra, ...rb]).toEqual(['0032_lesson_chapters.sql']);
    } finally {
      await a.end();
      await b.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name2} WITH (FORCE)`);
    }
  });
});
