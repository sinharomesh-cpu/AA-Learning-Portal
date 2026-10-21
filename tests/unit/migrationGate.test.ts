// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { migrationDecision } from '../../scripts/migration-gate.mjs';

// Phase 3A PR 1 (D3A-19): only the test site's production build of main may apply migrations.
const db = { DATABASE_URL: 'postgres://example.invalid/db' };
const main = { ...db, VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' };

describe('migration gate (D3A-19)', () => {
  it('allows the main deployment of the test site', () => {
    expect(migrationDecision(main).migrate).toBe(true);
    expect(
      migrationDecision({ ...main, DATABASE_URL: undefined, DATABASE_URL_UNPOOLED: 'postgres://x/y' }).migrate,
    ).toBe(true);
  });

  it('refuses every preview build, whatever the branch', () => {
    for (const ref of ['main', 'phase3a-pr2-lessons', undefined]) {
      const d = migrationDecision({ ...main, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: ref });
      expect(d).toEqual({ migrate: false, reason: expect.stringContaining('only by the main deployment') });
    }
  });

  it('refuses production-type builds of any branch other than main', () => {
    for (const ref of ['phase3a-pr2-lessons', 'Main', 'main ', '', undefined]) {
      expect(migrationDecision({ ...main, VERCEL_GIT_COMMIT_REF: ref }).migrate).toBe(false);
    }
  });

  it('refuses development builds, missing or unknown environments, and non-Vercel runs', () => {
    expect(migrationDecision({ ...main, VERCEL_ENV: 'development' }).migrate).toBe(false);
    expect(migrationDecision({ ...main, VERCEL_ENV: undefined }).migrate).toBe(false);
    expect(migrationDecision({ ...main, VERCEL_ENV: 'Production' }).migrate).toBe(false);
    expect(migrationDecision({ ...main, VERCEL: undefined }).migrate).toBe(false);
    expect(migrationDecision({ ...main, VERCEL: '0' }).migrate).toBe(false);
  });

  it('refuses when no database is connected or on the sample-data preview', () => {
    expect(migrationDecision({ ...main, DATABASE_URL: undefined }).migrate).toBe(false);
    expect(migrationDecision({ ...main, DATABASE_URL: '' }).migrate).toBe(false);
    expect(migrationDecision({ ...main, AA_DEMO_MODE: 'true' }).migrate).toBe(false);
  });

  it('explains every decision in the build log', () => {
    expect(migrationDecision({}).reason).toMatch(/No database connected/);
    expect(migrationDecision({ ...main, VERCEL_ENV: 'preview' }).reason).toMatch(/Vercel preview build/);
    expect(migrationDecision({ ...main, VERCEL_GIT_COMMIT_REF: 'feature' }).reason).toMatch(/Branch feature/);
    expect(migrationDecision(main).reason).toMatch(/Main deployment/);
  });
});
