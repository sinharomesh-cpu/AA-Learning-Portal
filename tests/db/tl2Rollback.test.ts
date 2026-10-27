import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-2 (0033) migration and rollback on throw-away databases only: apply every migration, add a
 * sample material request and notifications next to other data, run the prepared revert
 * (db/rollback), check that only TL-2's objects (and notifications pointing at a material request)
 * are gone and every other row and lesson rule is untouched, then apply 0033 again. Also: two builds
 * migrating at the same moment apply 0033 exactly once. Nothing here touches any shared database,
 * and migrations 0001-0032 are not modified.
 */
const admin = testDb();
const name = `tl2rb_${uniq()}`;
let sql: postgres.Sql;

const objects = async () => ({
  table: (await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'material_requests'`).length,
  functions: (
    await sql<{ p: string }[]>`
      SELECT proname AS p FROM pg_proc
      WHERE proname LIKE 'material_requests%' OR proname = 'lessons_close_material_requests' ORDER BY 1`
  ).map((r) => r.p),
  lessonTriggers: (
    await sql<{ t: string }[]>`
      SELECT tgname AS t FROM pg_trigger WHERE tgrelid = 'lessons'::regclass AND NOT tgisinternal ORDER BY 1`
  ).map((r) => r.t),
  entityCheck: (
    await sql<{ d: string }[]>`
      SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'notifications_entity_type_check'`
  )[0]!.d,
});
const counts = async () =>
  (
    await sql<{ c: string }[]>`
      SELECT concat_ws(',', (SELECT count(*) FROM lessons), (SELECT count(*) FROM lesson_chapters),
                       (SELECT count(*) FROM books), (SELECT count(*) FROM book_chapters),
                       (SELECT count(*) FROM book_children), (SELECT count(*) FROM accounts),
                       (SELECT count(*) FROM notifications WHERE entity_type <> 'material_request'),
                       (SELECT count(*) FROM schema_migrations)) AS c`
  )[0]!.c;
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
  for (const st of statements) {
    try {
      await sql.unsafe(st);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return errors;
};
const LESSON_TRIGGERS_0032 = ['lessons_before_insert', 'lessons_before_update', 'lessons_drop_link_on_cancel'];

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

describe('TL-2 rollback (0033)', () => {
  it('reverts cleanly, removes only TL-2, keeps lessons, chapters, books and other notifications, and can be applied again', async () => {
    const before0 = await objects();
    expect(before0.table).toBe(1);
    expect(before0.functions).toEqual([
      'lessons_close_material_requests',
      'material_requests_before_delete',
      'material_requests_before_write',
      'material_requests_close_ended',
      'material_requests_parent_ok',
      'material_requests_teacher_can_view',
    ]);
    expect(before0.lessonTriggers).toEqual([...LESSON_TRIGGERS_0032, 'lessons_close_material_requests'].sort());
    expect(before0.entityCheck).toContain('material_request');

    // Sample data (rules skipped for this transaction only: this test is about the revert).
    const p = await createAdult(sql, 'parent');
    const t = await createAdult(sql, 'teacher');
    const k = await createChild(sql, p);
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      const [b] = await tx<{ id: string }[]>`
        INSERT INTO books (owner_id, title, subject, form, status) VALUES (${p}, 'Book', 'maths', 'chapter_files', 'published')
        RETURNING id`;
      const [c] = await tx<{ id: string }[]>`
        INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, 1, 'One') RETURNING id`;
      const [l] = await tx<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                             reply_deadline, currency, rate_minor, price_minor, price_basis)
        VALUES (${t}, ${k}, ${p}, 'maths', date_trunc('hour', now()) + interval '3 days', 30,
                date_trunc('hour', now()) + interval '3 days 30 minutes', now(), now() + interval '48 hours',
                'INR', 60000, 30000, 'listed') RETURNING id`;
      await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id, label) VALUES (${l!.id}, 1, ${c!.id}, 'Book · 1. One')`;
      const [m] = await tx<{ id: string }[]>`
        INSERT INTO material_requests (lesson_id, raised_by, lesson_position) VALUES (${l!.id}, ${t}, 1) RETURNING id`;
      for (const [entity, id] of [
        ['material_request', m!.id],
        ['lesson', l!.id],
      ] as const)
        await tx`INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
                 VALUES (${p}, 'update', 'sample_note', 'Sample', '/parent', ${entity}, ${id}, ${`${entity}:${uniq()}`})`;
    });
    const before = await counts();
    const migrated = (await sql<{ name: string }[]>`SELECT name FROM schema_migrations ORDER BY name`).map(
      (r) => r.name,
    );
    expect(migrated.at(-1)).toBe('0033_material_requests.sql');

    const revert = await readFile(
      new URL('../../db/rollback/0033_revert_material_requests.sql', import.meta.url),
      'utf8',
    );
    await sql.begin((tx) => tx.unsafe(revert));
    const after = await objects();
    expect(after).toEqual({
      table: 0,
      functions: [],
      // 0029-0032's lesson rules are still in place and unchanged.
      lessonTriggers: LESSON_TRIGGERS_0032,
      entityCheck: expect.not.stringContaining('material_request'),
    });
    expect(after.entityCheck).toContain("'lesson'");
    // Lessons, chapters, books, accounts, other notifications and the migration record are untouched.
    expect(await counts()).toBe(before);
    expect(
      (
        await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE entity_type = 'material_request'`
      )[0]!.n,
    ).toBe(0);

    const forward = await readFile(new URL('../../db/migrations/0033_material_requests.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(forward));
    expect(await objects()).toEqual(before0);
    expect(await counts()).toBe(before);
  });

  it('review F1: the 0032 rollback, run statement by statement while 0033 is applied, changes nothing', async () => {
    // The reviewer's scenario: plain psql -f (no single transaction, carries on after errors).
    const tl1Guards = async () =>
      (
        await sql<{ t: string }[]>`
          SELECT tgname AS t FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = 'lesson_chapters' AND NOT t.tgisinternal
          UNION ALL SELECT proname FROM pg_proc WHERE proname LIKE 'lesson_chapters%' ORDER BY 1`
      ).map((r) => r.t);
    const beforeTl1 = await tl1Guards();
    expect(beforeTl1).toEqual([
      'lesson_chapters_before_delete',
      'lesson_chapters_before_delete',
      'lesson_chapters_before_write',
      'lesson_chapters_before_write',
    ]);
    const beforeTl2 = await objects();
    const before = await counts();
    const revert = await readFile(
      new URL('../../db/rollback/0032_revert_lesson_chapters.sql', import.meta.url),
      'utf8',
    );
    const errors = await runEachStatement(revert);
    expect(errors[0]).toMatch(/revert 0033 \(TL-2\) first/);
    expect(errors.length).toBe(4);
    expect(await tl1Guards()).toEqual(beforeTl1);
    expect(await objects()).toEqual(beforeTl2);
    expect(await counts()).toBe(before);
  });

  it('0033 is applied exactly once when two builds migrate at the same moment', async () => {
    const { mkdtemp, readdir, copyFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const src = new URL('../../db/migrations/', import.meta.url).pathname;
    const upTo32 = await mkdtemp(join(tmpdir(), 'tl2-'));
    for (const f of await readdir(src)) if (f < '0033') await copyFile(join(src, f), join(upTo32, f));
    const name2 = `tl2c_${uniq()}`;
    await admin.unsafe(`CREATE DATABASE ${name2}`);
    const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
    url.pathname = `/${name2}`;
    const a = postgres(url.toString(), { max: 1, onnotice: () => {} });
    const b = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      await migrate(a, { dir: upTo32 }); // 0001-0032: the shared test database once TL-1 is approved
      const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
      expect([...ra, ...rb]).toEqual(['0033_material_requests.sql']);
    } finally {
      await a.end();
      await b.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name2} WITH (FORCE)`);
    }
  });
});
