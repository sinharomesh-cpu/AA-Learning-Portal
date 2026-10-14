import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';
import { migrate } from '../../scripts/db-migrate.mjs';

/** Creates a throwaway database for this run and points DATABASE_URL at it. */
export default async function setup(project: TestProject) {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('Set DATABASE_URL to a Postgres admin connection to run the database tests.');
  const name = `aa_test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const testUrl = url.toString();
  const sql = postgres(testUrl, { max: 1, onnotice: () => {} });
  await migrate(sql);
  await sql.end();
  project.provide('databaseUrl', testUrl);

  return async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
