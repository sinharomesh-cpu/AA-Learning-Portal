import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationsIfAllowed } from '../../scripts/migration-gate.mjs';
import { testDb, uniq } from './helpers';

/**
 * Phase 3A PR 1 (D3A-19): end-to-end check of the gate the Vercel build uses, against a
 * throw-away database and a throw-away migration folder holding one dummy migration. Only the
 * main deployment may create the dummy table; every other kind of build leaves the database
 * untouched and never records anything in schema_migrations.
 */
const admin = testDb();
const name = `gate_${uniq()}`;
let url = '';
let dir = '';
let probe: postgres.Sql;

const base = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' };
const tableExists = async () => {
  const [row] = await probe<{ exists: boolean }[]>`SELECT to_regclass('gate_demo_lessons') IS NOT NULL AS exists`;
  return row!.exists;
};
const recorded = async () => {
  const [row] = await probe<{ exists: boolean }[]>`SELECT to_regclass('schema_migrations') IS NOT NULL AS exists`;
  if (!row!.exists) return [];
  return (await probe<{ name: string }[]>`SELECT name FROM schema_migrations ORDER BY name`).map((r) => r.name);
};

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
  // DATABASE_URL is the admin connection the DB test run is started with (vitest.db.config.mts).
  const parsed = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
  parsed.pathname = `/${name}`;
  url = parsed.toString();
  probe = postgres(url, { max: 1, onnotice: () => {} });
  dir = await mkdtemp(path.join(tmpdir(), 'aa-gate-'));
  await writeFile(path.join(dir, '0001_gate_demo.sql'), 'CREATE TABLE gate_demo_lessons (id int PRIMARY KEY);\n');
});

afterAll(async () => {
  await probe.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

describe('migration gate on a real database (D3A-19)', () => {
  const blocked: Array<[string, Record<string, string | undefined>]> = [
    ['a preview build of a feature branch', { ...base, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'phase3a-pr2' }],
    ['a preview build of main', { ...base, VERCEL_ENV: 'preview' }],
    ['a production-type build of another branch', { ...base, VERCEL_GIT_COMMIT_REF: 'phase3a-pr2' }],
    ['the sample-data preview', { ...base, AA_DEMO_MODE: 'true' }],
    ['a run outside Vercel', { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }],
  ];

  for (const [label, env] of blocked) {
    it(`applies nothing for ${label}`, async () => {
      const lines: string[] = [];
      const result = await applyMigrationsIfAllowed({ ...env, DATABASE_URL: url }, { dir, log: (l) => lines.push(l) });
      expect(result.applied).toEqual([]);
      expect(result.decision.migrate).toBe(false);
      expect(await tableExists()).toBe(false);
      expect(await recorded()).toEqual([]);
      expect(lines.join('\n')).toMatch(/skipping|only by the main deployment|only from main/);
    });
  }

  it('applies the pending migration on the main deployment, once', async () => {
    const lines: string[] = [];
    const first = await applyMigrationsIfAllowed({ ...base, DATABASE_URL: url }, { dir, log: (l) => lines.push(l) });
    expect(first.applied).toEqual(['0001_gate_demo.sql']);
    expect(await tableExists()).toBe(true);
    expect(await recorded()).toEqual(['0001_gate_demo.sql']);
    expect(lines).toContain('Database: 1 migration(s) applied.');
    const again = await applyMigrationsIfAllowed({ ...base, DATABASE_URL: url }, { dir });
    expect(again.applied).toEqual([]);
  });
});
