import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { decideProfileChange, decideTeacher, setAccountActive } from '@/server/admin';
import { withdrawLinkRequest } from '@/server/teacherLinks';
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
  const link = await activeLink(sql, { teacher: t, child, parent, subjects: ['maths'] });
  return { t, parent, child, admin: owner, link };
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

describe("R6-1: an admin approving a teacher's subject change vs that teacher proposing a lesson", () => {
  it('no deadlock; the approval completes; the proposal is decided cleanly', async () => {
    const f = await family();
    await sql`UPDATE teacher_profiles SET pending_subjects = ${['maths']}, pending_grades = ${[5]}, change_submitted_at = now()
              WHERE account_id = ${f.t}`;
    const start = next();
    const before = await deadlocks();
    const g = await sql.reserve();
    let res: { admin: unknown; propose: unknown };
    try {
      // The gate shares the teacher-child link, so the approval (which locks links FOR UPDATE after
      // the account and profile rows) waits there while the proposal arrives.
      await g`BEGIN`;
      await g`SELECT 1 FROM teacher_student_links WHERE id = ${f.link} FOR SHARE`;
      const pa = settle(
        decideProfileChange(sql, f.admin, f.t, { decision: 'approve', note: 'Synthetic ok', baseUrl: '' }),
      );
      await waiting(1);
      const pp = settle(
        proposeLesson(sql, f.t, {
          childId: f.child,
          subject: 'maths',
          date: ymd(start),
          time: hm(start),
          minutes: '30',
        }),
      );
      await new Promise((r) => setTimeout(r, 1500));
      await g`ROLLBACK`;
      res = { admin: await pa, propose: await pp };
    } finally {
      await g`ROLLBACK`.catch(() => {});
      g.release();
    }
    expect(await deadlocks()).toBe(before);
    expect(res.admin).toEqual({ v: { ok: true } });
    const [p] = await sql<
      { d: string | null }[]
    >`SELECT change_decision AS d FROM teacher_profiles WHERE account_id = ${f.t}`;
    expect(p!.d).toBe('approved');
    expect((res.propose as { e?: string }).e).toBeUndefined();
  });
});

describe('decideTeacher: approving a waiting teacher vs a parent withdrawing their waiting link request', () => {
  it('no deadlock; whichever runs first, both complete cleanly', async () => {
    // A teacher waiting for approval, with a parent's link request held as "pending" until then.
    const [tr] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name, password_hash)
      VALUES ('teacher', 'pending_approval', ${`t-${uniq()}@example.invalid`}, 'Teacher Waiting', 'x') RETURNING id`;
    const t = tr!.id;
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, submitted_at)
              VALUES (${t}, 'self_registered', 'submitted', ${['maths']}, ${[5]}, now())`;
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    await sql`UPDATE student_profiles SET subjects = ${['maths']} WHERE account_id = ${child}`;
    const [l] = await sql<{ id: string }[]>`
      INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
      VALUES (${t}, ${child}, ${parent}, 'parent_added', 'pending', ${['maths']}) RETURNING id`;
    const admin = await createAdult(sql, 'superadmin');
    const before = await deadlocks();
    const g = await sql.reserve();
    let res: { approve: unknown; withdraw: unknown };
    try {
      // The gate holds the parent's account row, so the withdrawal locks the link, then waits at its
      // audit row's foreign-key check on the parent (actor). Meanwhile the approval locks the
      // teacher's account and waits for the link. On release the withdrawal's next foreign-key
      // check is on the teacher (subject): with FOR UPDATE on that row, a cycle.
      await g`BEGIN`;
      await g`SELECT 1 FROM accounts WHERE id = ${parent} FOR UPDATE`;
      const pw = settle(withdrawLinkRequest(sql, parent, l!.id));
      await waiting(1);
      const pa = settle(decideTeacher(sql, admin, t, { decision: 'approve', note: 'Synthetic ok', baseUrl: '' }));
      await waiting(2);
      await g`ROLLBACK`;
      res = { approve: await pa, withdraw: await pw };
    } finally {
      await g`ROLLBACK`.catch(() => {});
      g.release();
    }
    expect(await deadlocks()).toBe(before);
    expect(res.approve).toEqual({ v: { ok: true } });
    expect(res.withdraw).toEqual({ v: { ok: true } });
    const [acct] = await sql<{ status: string }[]>`SELECT status FROM accounts WHERE id = ${t}`;
    expect(acct!.status).toBe('active');
    const [link] = await sql<{ status: string }[]>`SELECT status FROM teacher_student_links WHERE id = ${l!.id}`;
    expect(link!.status).toBe('removed');
  });
});

describe('Both arrival orders, unforced: each pair started together, alternating which goes first', () => {
  const both = async <A, B>(first: 'a' | 'b', a: () => Promise<A>, b: () => Promise<B>) => {
    if (first === 'a') {
      const pa = settle(a());
      const pb = settle(b());
      return { a: await pa, b: await pb };
    }
    const pb = settle(b());
    const pa = settle(a());
    return { a: await pa, b: await pb };
  };

  for (const first of ['a', 'b'] as const) {
    it(`deactivation and acceptance, ${first === 'a' ? 'deactivation' : 'acceptance'} first (x3)`, async () => {
      const before = await deadlocks();
      for (let i = 0; i < 3; i++) {
        const f = await family();
        const start = next();
        const p = await proposeLesson(sql, f.t, {
          childId: f.child,
          subject: 'maths',
          date: ymd(start),
          time: hm(start),
          minutes: '30',
        });
        if (!p.ok) throw new Error(p.reason);
        const r = await both(
          first,
          () => setAccountActive(sql, f.admin, f.t, { active: false, reason: 'Synthetic test' }),
          () => answerProposal(sql, f.parent, p.id, 'accept'),
        );
        expect(r.a).toEqual({ v: { ok: true } });
        expect((r.b as { e?: string }).e).toBeUndefined();
        const [acct] = await sql<{ status: string }[]>`SELECT status FROM accounts WHERE id = ${f.t}`;
        expect(acct!.status).toBe('deactivated');
        const [l] = await sql<{ status: string }[]>`SELECT status FROM lessons WHERE id = ${p.id}`;
        expect(['declined', 'cancelled']).toContain(l!.status); // nothing open or booked with a deactivated teacher
      }
      expect(await deadlocks()).toBe(before);
    });

    it(`profile-change approval and a proposal, ${first === 'a' ? 'approval' : 'proposal'} first (x3)`, async () => {
      const before = await deadlocks();
      for (let i = 0; i < 3; i++) {
        const f = await family();
        await sql`UPDATE teacher_profiles SET pending_subjects = ${['maths']}, pending_grades = ${[5]}, change_submitted_at = now()
                  WHERE account_id = ${f.t}`;
        const start = next();
        const r = await both(
          first,
          () => decideProfileChange(sql, f.admin, f.t, { decision: 'approve', note: 'Synthetic ok', baseUrl: '' }),
          () =>
            proposeLesson(sql, f.t, {
              childId: f.child,
              subject: 'maths',
              date: ymd(start),
              time: hm(start),
              minutes: '30',
            }),
        );
        expect(r.a).toEqual({ v: { ok: true } });
        expect((r.b as { e?: string }).e).toBeUndefined();
      }
      expect(await deadlocks()).toBe(before);
    });

    it(`teacher approval and a link-request withdrawal, ${first === 'a' ? 'approval' : 'withdrawal'} first (x3)`, async () => {
      const before = await deadlocks();
      for (let i = 0; i < 3; i++) {
        const [tr] = await sql<{ id: string }[]>`
          INSERT INTO accounts (role, status, email, display_name, password_hash)
          VALUES ('teacher', 'pending_approval', ${`t-${uniq()}@example.invalid`}, 'Teacher Waiting', 'x') RETURNING id`;
        await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, submitted_at)
                  VALUES (${tr!.id}, 'self_registered', 'submitted', ${['maths']}, ${[5]}, now())`;
        const parent = await createAdult(sql, 'parent');
        const child = await createChild(sql, parent);
        await sql`UPDATE student_profiles SET subjects = ${['maths']} WHERE account_id = ${child}`;
        const [l] = await sql<{ id: string }[]>`
          INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
          VALUES (${tr!.id}, ${child}, ${parent}, 'parent_added', 'pending', ${['maths']}) RETURNING id`;
        const admin = await createAdult(sql, 'superadmin');
        const r = await both(
          first,
          () => decideTeacher(sql, admin, tr!.id, { decision: 'approve', note: 'Synthetic ok', baseUrl: '' }),
          () => withdrawLinkRequest(sql, parent, l!.id),
        );
        expect(r.a).toEqual({ v: { ok: true } });
        expect((r.b as { e?: string }).e).toBeUndefined();
      }
      expect(await deadlocks()).toBe(before);
    });
  }
});
