#!/usr/bin/env node
/**
 * Applies the SQL files in db/migrations in name order (Phase 2, WP2-1).
 *
 * - Each file runs once, inside its own transaction, and is recorded in schema_migrations
 *   with a SHA-256 checksum.
 * - An already-applied file whose contents changed is refused: write a new migration instead.
 * - A Postgres advisory lock stops two runs from migrating at the same time.
 *
 * Usage: DATABASE_URL=postgres://… node scripts/db-migrate.mjs
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../db/migrations/', import.meta.url));
const LOCK_ID = 7_301_001; // arbitrary, fixed for AA Pro migrations

const NAME_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export async function listMigrations(dir = MIGRATIONS_DIR) {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort();
  const bad = names.filter((n) => !NAME_PATTERN.test(n));
  if (bad.length) throw new Error(`Migration file names must look like 0001_name.sql: ${bad.join(', ')}`);
  return Promise.all(
    names.map(async (name) => {
      const text = await readFile(path.join(dir, name), 'utf8');
      return { name, text, checksum: createHash('sha256').update(text).digest('hex') };
    }),
  );
}

/** Applies pending migrations with the given postgres.js client. Returns the names applied. */
export async function migrate(sql, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  const migrations = await listMigrations(dir);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK_ID})`;
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`;
    const applied = new Map((await tx`SELECT name, checksum FROM schema_migrations`).map((r) => [r.name, r.checksum]));
    for (const name of applied.keys()) {
      if (!migrations.some((m) => m.name === name)) throw new Error(`Applied migration ${name} is missing from ${dir}`);
    }
    const done = [];
    for (const m of migrations) {
      const previous = applied.get(m.name);
      if (previous) {
        if (previous !== m.checksum) {
          throw new Error(`Migration ${m.name} was changed after it was applied. Add a new migration instead.`);
        }
        continue;
      }
      await tx.savepoint(async (sp) => {
        await sp.unsafe(m.text);
        await sp`INSERT INTO schema_migrations (name, checksum) VALUES (${m.name}, ${m.checksum})`;
      });
      log(`applied ${m.name}`);
      done.push(m.name);
    }
    return done;
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const done = await migrate(sql, { log: (line) => console.log(line) });
    console.log(done.length ? `${done.length} migration(s) applied.` : 'Database is up to date.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
