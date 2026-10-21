/**
 * Migration gate (Phase 3A PR 1; owner decision D3A-19, 21 Oct 2026).
 *
 * The test site (Vercel project aa-pro-test) used to apply pending migrations on every build,
 * including preview builds of unmerged branches, because previews were connected to the same
 * shared test database. From now on only the test site's production build of `main` may apply
 * migrations. Every preview, every other branch and the sample-data preview skip them, and do not
 * even open a database connection for that purpose.
 *
 * This is layer 1 of three: layer 2 is the owner's Vercel setting (no database variables for
 * Preview), layer 3 is the process rule that a branch containing a migration is pushed only after
 * the owner has approved that migration in writing.
 */
import postgres from 'postgres';
import { migrate } from './db-migrate.mjs';

/**
 * Decides whether this build may apply migrations. Pure: reads only the given environment.
 * Migrations are allowed only when ALL of these hold:
 *  - a database is connected,
 *  - it is not the sample-data preview,
 *  - the build runs on Vercel (VERCEL=1),
 *  - Vercel says it is a production build (VERCEL_ENV=production),
 *  - of the main branch (VERCEL_GIT_COMMIT_REF=main).
 * Anything missing or different means "do not migrate".
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ migrate: boolean, reason: string }}
 */
export function migrationDecision(env) {
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) return { migrate: false, reason: 'No database connected: skipping migrations.' };
  if (env.AA_DEMO_MODE === 'true') return { migrate: false, reason: 'Sample-data preview: skipping migrations.' };
  if (env.VERCEL !== '1') {
    return { migrate: false, reason: 'Not a Vercel build: skipping migrations (use npm run db:migrate locally).' };
  }
  if (env.VERCEL_ENV !== 'production') {
    return {
      migrate: false,
      reason: `Vercel ${env.VERCEL_ENV || 'unknown'} build: migrations are applied only by the main deployment.`,
    };
  }
  if (env.VERCEL_GIT_COMMIT_REF !== 'main') {
    return {
      migrate: false,
      reason: `Branch ${env.VERCEL_GIT_COMMIT_REF || 'unknown'}: migrations are applied only from main.`,
    };
  }
  return { migrate: true, reason: 'Main deployment of the test site: applying pending migrations.' };
}

/**
 * Applies pending migrations only when migrationDecision allows it.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ dir?: string, log?: (line: string) => void, connect?: (url: string) => import('postgres').Sql }} [options]
 * @returns {Promise<{ decision: { migrate: boolean, reason: string }, applied: string[] }>}
 */
export async function applyMigrationsIfAllowed(env, options = {}) {
  const log = options.log ?? (() => {});
  const decision = migrationDecision(env);
  log(decision.reason);
  if (!decision.migrate) return { decision, applied: [] };
  const url = /** @type {string} */ (env.DATABASE_URL_UNPOOLED || env.DATABASE_URL);
  const sql = options.connect
    ? options.connect(url)
    : postgres(url, { max: 1, prepare: !/-pooler\./.test(url), onnotice: () => {} });
  try {
    const applied = await migrate(sql, { ...(options.dir ? { dir: options.dir } : {}), log });
    log(applied.length ? `Database: ${applied.length} migration(s) applied.` : 'Database: up to date.');
    return { decision, applied };
  } finally {
    await sql.end();
  }
}
