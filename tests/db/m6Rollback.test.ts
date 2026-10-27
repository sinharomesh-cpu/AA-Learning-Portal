import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { testDb, uniq } from './helpers';

/**
 * The M6 rollback plan works: on a throw-away database, apply every migration, add a sample book
 * with a chapter, run the prepared revert (db/rollback), check the schema is back to how 0027 left
 * it, then apply 0028's SQL again. Nothing here touches any shared database.
 */
const admin = testDb();
const name = `m6rb_${uniq()}`;
let sql: postgres.Sql;

const tables = async () =>
  (
    await sql<{ t: string }[]>`
      SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('books', 'book_children', 'book_chapters', 'book_chapter_files')
      ORDER BY 1`
  ).map((r) => r.t);

const columns = async () =>
  (
    await sql<{ c: string }[]>`
      SELECT table_name || '.' || column_name AS c FROM information_schema.columns
      WHERE (table_name = 'worksheets' AND column_name = 'source_chapter_id')
         OR (table_name = 'assignments' AND column_name = 'book_chapter_id') ORDER BY 1`
  ).map((r) => r.c);

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

describe('M6 rollback (0028)', () => {
  it('reverts cleanly, removes book files, keeps other files, and can be applied again', async () => {
    expect(await tables()).toHaveLength(4);
    expect(await columns()).toHaveLength(2);
    const [p] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('parent', 'active', ${`p-${uniq()}@example.com`}, 'P')
      RETURNING id`;
    const pdf = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1');
    const file = async (purpose: string) =>
      (
        await sql<{ id: string }[]>`
          INSERT INTO stored_files (owner_id, purpose, file_name, media_type, byte_size, sha256, body)
          VALUES (${p!.id}, ${purpose}, 'x.pdf', 'application/pdf', ${pdf.length}, ${randomBytes(32)}, ${pdf}) RETURNING id`
      )[0]!.id;
    const bookFile = await file('book');
    const pageFile = await file('submission_page');
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO books (owner_id, title, subject, form, split, file_id, page_count)
      VALUES (${p!.id}, 'Sample', 'maths', 'single_pdf', 'chapters', ${bookFile}, 10) RETURNING id`;
    await sql`INSERT INTO book_chapters (book_id, number, title, first_page, last_page) VALUES (${b!.id}, 1, 'One', 1, 5)`;

    // TL-1 (0032) refers to book_chapters, so it is reverted first.
    const revertTl1 = await readFile(
      new URL('../../db/rollback/0032_revert_lesson_chapters.sql', import.meta.url),
      'utf8',
    );
    await sql.begin((tx) => tx.unsafe(revertTl1));
    const revert = await readFile(new URL('../../db/rollback/0028_revert_books.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(revert));
    expect(await tables()).toEqual([]);
    expect(await columns()).toEqual([]);
    expect((await sql`SELECT id FROM stored_files`).map((r) => r.id)).toEqual([pageFile]);
    const [c] = await sql<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'stored_files_purpose_check'`;
    expect(c!.def).not.toContain('book');
    const [s] = await sql<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'worksheets_source_pages'`;
    expect(s!.def).not.toContain('chapter');
    expect(await sql`SELECT 1 FROM pg_proc WHERE proname LIKE 'book%check'`).toHaveLength(0);

    const forward = await readFile(new URL('../../db/migrations/0028_books.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(forward));
    expect(await tables()).toHaveLength(4);
  });
});
