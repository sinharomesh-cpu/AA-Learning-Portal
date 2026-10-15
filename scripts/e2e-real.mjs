#!/usr/bin/env node
/**
 * Runs the real-accounts browser tests (tests/real) against a throwaway database.
 * Needs DATABASE_URL pointing at a Postgres admin connection. Creates a fresh database,
 * migrates it, runs Playwright with real sign-in switched on, then drops the database.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { migrate } from './db-migrate.mjs';

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  console.error('Set DATABASE_URL to a Postgres admin connection.');
  process.exit(1);
}
const name = `aa_e2e_${randomBytes(5).toString('hex')}`;
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
await admin.unsafe(`CREATE DATABASE ${name}`);
const url = new URL(adminUrl);
url.pathname = `/${name}`;
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
await migrate(sql);
await sql.end();

const result = spawnSync(
  'npx',
  ['playwright', 'test', '--config', 'playwright.real.config.ts', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString('hex'),
      AA_DEV_MAILBOX: 'true',
      AA_DEMO_MODE: '',
    },
  },
);
await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.end();
process.exit(result.status ?? 1);
