import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { setAccountActive } from '@/server/admin';
import { answerProposal, proposeLesson } from '@/server/proposals';
import { activeLink, createAdult, createChild, uniq } from './helpers';

/**
 * R5-1 (independent AI review, 4 Nov 2026): the admin deactivation (setAccountActive) locked the
 * teacher's account row FOR UPDATE. A parent's acceptance that already held the lesson rows then
 * needed a KEY SHARE lock on that account row (foreign-key checks, notices), so the two waited on
 * each other and the deactivation was rolled back. Synthetic data only.
 */
// Its own pool: the gate, the deactivation and the acceptance each need a connection at once.
const sql = postgres(inject('databaseUrl'), { max: 8, onnotice: () => {} });
afterAll(() => sql.end());

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 20 * DAY + 10 * 60 * MIN);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date) => d.toISOString().slice(11, 16);
let slot = 0;
const next = () => new Date(BASE.getTime() + (slot += 90) * MIN);

async function family() {
  const t = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC' WHERE id = ${t}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${t}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${t}, true, 'INR', 60000, 30)`;
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths']} WHERE account_id = ${child}`;
  await activeLink(sql, { teacher: t, child, parent, subjects: ['maths'] });
  return { t, parent, child, admin: owner };
}

async function deadlocks() {
  await new Promise((r) => setTimeout(r, 1200)); // statistics are flushed at most once a second
  await sql`SELECT pg_stat_clear_snapshot()`;
  return Number(
    (
      await sql<{ n: string }[]>`SELECT deadlocks::text AS n FROM pg_stat_database WHERE datname = current_database()`
    )[0]!.n,
  );
}
async function waiting(n: number) {
  await expect
    .poll(
      async () =>
        (
          await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity
                                     WHERE datname = current_database() AND wait_event_type = 'Lock'`
        )[0]!.n,
      { timeout: 10_000, interval: 25 },
    )
    .toBeGreaterThanOrEqual(n);
}
const settle = <T>(p: Promise<T>) =>
  p.then(
    (v) => ({ v }),
    (e: Error) => ({ e: e.message }),
  );

describe('R5-1: admin deactivation vs a parent accepting a proposal at the same moment', () => {
  it('admin first: no deadlock; the deactivation completes in full; the acceptance is refused', async () => {
    const f = await family();
    await sql`INSERT INTO sessions (id_hash, account_id, credential_version, idle_expires_at, absolute_expires_at)
              VALUES (${randomBytes(32)}, ${f.t}, 1, now() + interval '1 day', now() + interval '2 days')`;
    const start = next();
    const p = await proposeLesson(sql, f.t, {
      childId: f.child,
      subject: 'maths',
      date: ymd(start),
      time: hm(start),
      minutes: '30',
    });
    if (!p.ok) throw new Error(p.reason);
    const before = await deadlocks();
    const g = await sql.reserve();
    let res: { admin: unknown; accept: unknown };
    try {
      // The gate holds the teacher's session rows, so the deactivation holds the account row and
      // waits (it revokes sessions next) while the acceptance arrives.
      await g`BEGIN`;
      await g`SELECT 1 FROM sessions WHERE account_id = ${f.t} FOR UPDATE`;
      const pa = settle(setAccountActive(sql, f.admin, f.t, { active: false, reason: 'Synthetic test' }));
      await waiting(1);
      const pacc = settle(answerProposal(sql, f.parent, p.id, 'accept'));
      await new Promise((r) => setTimeout(r, 1500));
      await g`ROLLBACK`;
      res = { admin: await pa, accept: await pacc };
    } finally {
      await g`ROLLBACK`.catch(() => {});
      g.release();
    }
    expect(await deadlocks()).toBe(before);
    expect(res.admin).toEqual({ v: { ok: true } });
    const [acct] = await sql<{ status: string }[]>`SELECT status FROM accounts WHERE id = ${f.t}`;
    expect(acct!.status).toBe('deactivated');
    const [sess] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM sessions WHERE account_id = ${f.t} AND revoked_at IS NULL`;
    expect(sess!.n).toBe(0); // signed out
    // Whichever finished first, nothing is left open or booked with a deactivated teacher.
    const [l] = await sql<{ status: string }[]>`SELECT status FROM lessons WHERE id = ${p.id}`;
    expect(['declined', 'cancelled']).toContain(l!.status);
  });
});
