import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, migrate } from '../../scripts/db-migrate.mjs';
import { testDb } from './helpers';

const sql = testDb();
afterAll(() => sql.end());

describe('migration runner', () => {
  it('records every migration and does nothing on a second run', async () => {
    const rows = await sql<{ name: string }[]>`SELECT name FROM schema_migrations ORDER BY name`;
    expect(rows.map((r) => r.name)).toContain('0001_foundation.sql');
    expect(await migrate(sql)).toEqual([]);
  });

  it('refuses a migration that was changed after it was applied', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'aa-mig-'));
    await cp(MIGRATIONS_DIR, dir, { recursive: true });
    await writeFile(path.join(dir, '0001_foundation.sql'), '-- edited\n', { flag: 'a' });
    await expect(migrate(sql, { dir })).rejects.toThrow(/was changed after it was applied/);
  });

  it('rolls back a failing migration completely', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'aa-mig-'));
    await cp(MIGRATIONS_DIR, dir, { recursive: true });
    await writeFile(
      path.join(dir, '9999_broken.sql'),
      'CREATE TABLE zz_partial (id int);\nSELECT * FROM no_such_table;\n',
    );
    await expect(migrate(sql, { dir })).rejects.toThrow(/no_such_table/);
    const [row] = await sql<{ exists: boolean }[]>`SELECT to_regclass('zz_partial') IS NOT NULL AS exists`;
    expect(row!.exists).toBe(false);
    const applied = await sql`SELECT 1 FROM schema_migrations WHERE name = '9999_broken.sql'`;
    expect(applied.length).toBe(0);
  });

  it('rejects badly named migration files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'aa-mig-'));
    await writeFile(path.join(dir, 'add-table.sql'), 'SELECT 1;');
    // File names are checked before the database is touched.
    await expect(migrate(sql, { dir })).rejects.toThrow(/must look like 0001_name.sql/);
  });
});
