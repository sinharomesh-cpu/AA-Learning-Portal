import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { testDb, uniq } from './helpers';

/**
 * The M3 rollback plan works (readiness pack §3.3): on a throw-away database, apply every
 * migration, add a sample worksheet, run the prepared revert (db/rollback), check the schema is
 * back to how 0026 left it, then apply 0027's SQL again. Nothing here touches any shared database.
 */
const admin = testDb();
const name = `m3rb_${uniq()}`;
let sql: postgres.Sql;

const tables = async () =>
  (
    await sql<{ t: string }[]>`
      SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('worksheets', 'worksheet_questions', 'assignments', 'questions',
        'assignment_targets', 'answers', 'assignment_events', 'assignment_resources') ORDER BY 1`
  ).map((r) => r.t);

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

describe('M3 rollback (0027)', () => {
  it('reverts cleanly and can be applied again', async () => {
    expect(await tables()).toHaveLength(8);
    const [t] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('teacher', 'active', ${`t-${uniq()}@example.com`}, 'T')
      RETURNING id`;
    await sql`INSERT INTO worksheets (teacher_id, kind, title, grade, board, subject) VALUES (${t!.id}, 'handwritten', 'x', 5, 'CBSE', 'science')`;

    const revert = await readFile(
      new URL('../../db/rollback/0027_revert_worksheets_homework.sql', import.meta.url),
      'utf8',
    );
    await sql.begin((tx) => tx.unsafe(revert));
    expect(await tables()).toEqual([]);
    const [c] = await sql<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'notifications_entity_type_check'`;
    expect(c!.def).not.toContain('assignment');
    const cols =
      await sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'teacher_resources' AND column_name = 'resource_type'`;
    expect(cols).toHaveLength(0);
    const fns =
      await sql`SELECT 1 FROM pg_proc WHERE proname IN ('worksheet_ready_check', 'valid_question_type', 'answers_check')`;
    expect(fns).toHaveLength(0);

    const forward = await readFile(
      new URL('../../db/migrations/0027_worksheets_homework.sql', import.meta.url),
      'utf8',
    );
    await sql.begin((tx) => tx.unsafe(forward));
    expect(await tables()).toHaveLength(8);
  });
});
