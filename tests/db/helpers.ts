import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';

export type Sql = postgres.Sql<Record<string, unknown>>;

export function testDb(): Sql {
  return postgres(inject('databaseUrl'), { max: 2, onnotice: () => {} });
}

/** Unique synthetic suffix so tests never depend on an empty table. */
export const uniq = () => randomBytes(4).toString('hex');

/** Four digits for synthetic child usernames such as "kiran-4821". */
const digits = () => String(Math.floor(1000 + Math.random() * 9000));

export async function createAdult(sql: Sql, role: 'parent' | 'teacher' | 'superadmin', status = 'active') {
  // There is only ever one Super Admin (migration 0005); tests share it.
  if (role === 'superadmin') {
    const [existing] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE role = 'superadmin'`;
    if (existing) return existing.id;
  }
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name)
    VALUES (${role}, ${status}, ${`${role}-${uniq()}@example.com`}, ${`Test ${role}`})
    RETURNING id`;
  return row!.id;
}

export async function createChild(sql: Sql, parentId: string) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, username, display_name)
    VALUES ('student', 'active', ${`child${uniq()}-${digits()}`}, 'Test child')
    RETURNING id`;
  await sql`INSERT INTO student_profiles (account_id, grade, subjects) VALUES (${row!.id}, 5, ${['maths']})`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parentId}, ${row!.id})`;
  return row!.id;
}

/**
 * An accepted teacher–child link (CR-12): since migration 0020 a link starts as a request and
 * becomes active only when the teacher accepts it, so fixtures go through the same two steps.
 */
export async function activeLink(
  sql: Sql,
  link: { teacher: string; child: string; parent: string; subjects: string[] },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects,
                                       requested_at, expires_at)
    VALUES (${link.teacher}, ${link.child}, ${link.parent}, 'parent_added', 'requested', ${link.subjects},
            now(), now() + interval '14 days')
    RETURNING id`;
  await sql`UPDATE teacher_student_links SET status = 'active', answered_at = now() WHERE id = ${row!.id}`;
  return row!.id;
}

/**
 * A temporary copy of db/migrations holding only the files before `prefix` (e.g. '0034'), for
 * tests that need a database as it was before a later migration.
 */
export async function migrationsBefore(prefix: string): Promise<string> {
  const { mkdtemp, readdir, copyFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const src = new URL('../../db/migrations/', import.meta.url).pathname;
  const dir = await mkdtemp(join(tmpdir(), `before-${prefix}-`));
  for (const f of await readdir(src)) if (f < prefix) await copyFile(join(src, f), join(dir, f));
  return dir;
}
