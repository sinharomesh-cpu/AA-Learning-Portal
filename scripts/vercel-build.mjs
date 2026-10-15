#!/usr/bin/env node
/**
 * Build command for Vercel (vercel.json). When a database is connected (test environment,
 * OC-57), apply pending migrations first, using the direct (unpooled) connection when the
 * host provides one. Otherwise, for example on the sample-data preview, just build.
 */
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { migrate } from './db-migrate.mjs';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (url && process.env.AA_DEMO_MODE !== 'true') {
  const sql = postgres(url, { max: 1, prepare: !/-pooler\./.test(url), onnotice: () => {} });
  try {
    const applied = await migrate(sql, { log: (line) => console.log(line) });
    console.log(applied.length ? `Database: ${applied.length} migration(s) applied.` : 'Database: up to date.');
  } finally {
    await sql.end();
  }
} else {
  console.log('No database connected: skipping migrations.');
}
const result = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
