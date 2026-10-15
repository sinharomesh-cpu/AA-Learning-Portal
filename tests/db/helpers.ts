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
