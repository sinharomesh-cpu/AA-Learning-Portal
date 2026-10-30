import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { migrationsBefore, testDb, uniq } from './helpers';

/**
 * The M1 rollback plan works: on a separate throw-away database, apply every migration, add a
 * sample lesson and lesson notification next to other data, run the prepared revert
 * (db/rollback), check the schema is back to how 0028 left it with other data untouched, then
 * apply 0029's SQL again. Nothing here touches any shared database.
 */
const admin = testDb();
const name = `m1rb_${uniq()}`;
let sql: postgres.Sql;

const entityCheck = async () =>
  (
    await sql<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'notifications_entity_type_check'`
  )[0]!.def;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
  url.pathname = `/${name}`;
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  // TL-3 (0034, TL3-6 Option D) ships no rollback and closes the rollback chain: the older revert
  // scripts are exercised on a database at 0033 (they refuse once 0034 is applied; tl3Proposals.test).
  await migrate(sql, { dir: await migrationsBefore('0034') });
});

afterAll(async () => {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

describe('M1 rollback (0029)', () => {
  it('reverts cleanly, removes lessons and lesson notifications only, and can be applied again', async () => {
    const before = await entityCheck();
    expect(before).toContain("'lesson'");
    const [p] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('parent', 'active', ${`p-${uniq()}@example.com`}, 'P')
      RETURNING id`;
    const [t] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('teacher', 'active', ${`t-${uniq()}@example.com`}, 'T')
      RETURNING id`;
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, username, display_name) VALUES ('student', 'active', ${`c${uniq()}-1234`}, 'C')
      RETURNING id`;
    // A sample lesson row (inserted with triggers off: this test is about the revert, not the rules).
    const lesson = await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      const [l] = await tx<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, reply_deadline,
                             currency, rate_minor, price_minor, price_basis)
        VALUES (${t!.id}, ${c!.id}, ${p!.id}, 'maths', date_trunc('minute', now()) + interval '3 days', 30,
                date_trunc('minute', now()) + interval '3 days 30 minutes', now() + interval '48 hours', 'INR', 60000, 30000, 'listed')
        RETURNING id`;
      return l!.id;
    });
    const note = (entity: string, id: string) => sql`
      INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
      VALUES (${p!.id}, 'update', 'sample_note', 'Sample', '/parent', ${entity}, ${id}, ${`${entity}:${uniq()}`})`;
    await note('lesson', lesson);
    await note('assignment', lesson);

    // Rollbacks run newest first: TL-2 (0033), TL-1 (0032), M3 (0031) and M2 (0030) depend on lessons, so they
    // are reverted before M1.
    const revertTl2 = await readFile(
      new URL('../../db/rollback/0033_revert_material_requests.sql', import.meta.url),
      'utf8',
    );
    await sql.begin((tx) => tx.unsafe(revertTl2));
    // With TL-2 reverted, the list is 0029's own again: that is what re-applying 0029 must restore.
    const before29 = await entityCheck();
    expect(before29).toContain("'lesson'");
    expect(before29).not.toContain('material_request');
    const revertTl1 = await readFile(
      new URL('../../db/rollback/0032_revert_lesson_chapters.sql', import.meta.url),
      'utf8',
    );
    await sql.begin((tx) => tx.unsafe(revertTl1));
    const revertM3 = await readFile(new URL('../../db/rollback/0031_revert_kept_lessons.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(revertM3));
    const revertM2 = await readFile(
      new URL('../../db/rollback/0030_revert_meeting_links.sql', import.meta.url),
      'utf8',
    );
    await sql.begin((tx) => tx.unsafe(revertM2));
    const revert = await readFile(new URL('../../db/rollback/0029_revert_lessons.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(revert));
    expect(await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'lessons'`).toHaveLength(0);
    expect(await sql`SELECT 1 FROM pg_proc WHERE proname LIKE 'lessons\\_%'`).toHaveLength(0);
    expect(await entityCheck()).not.toContain("'lesson'");
    expect((await sql`SELECT entity_type FROM notifications`).map((r) => r.entity_type)).toEqual(['assignment']);
    expect(await sql`SELECT 1 FROM accounts WHERE id IN ${sql([p!.id, t!.id, c!.id])}`).toHaveLength(3);
    // Kept on purpose (see the rollback file): btree_gist, and 0029's row in schema_migrations.
    expect(await sql`SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'`).toHaveLength(1);

    const forward = await readFile(new URL('../../db/migrations/0029_lessons.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(forward));
    expect(await entityCheck()).toBe(before29);
    expect(await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'lessons'`).toHaveLength(1);
  });
});
