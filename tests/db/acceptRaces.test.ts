import postgres from 'postgres';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { answerLesson, closeLeftoverOverlaps, lessonMaintenance, requestLesson } from '@/server/lessons';
import { answerProposal, proposeLesson } from '@/server/proposals';
import { activeLink, createAdult, createChild, testDb, type Sql, uniq } from './helpers';

/**
 * TQ-4 (30 Oct 2026): overlapping acceptances must never deadlock. Two acceptances of lessons that
 * overlap for one teacher or one child used to deadlock: each held its own lesson row, the winner
 * then waited to close the other's row as "time no longer free", while the other waited for the
 * winner's time locks (0034) or uncommitted confirmation (0029). retrying() usually hid it after a
 * second; under load the error reached the user. Fixed by closing overlapping rows with
 * FOR UPDATE SKIP LOCKED (lessons.closeOverlapping), as 0034's stage-3 design already did for
 * proposals.
 *
 * These tests force the worst case: both acceptances are held right after locking their own
 * lesson rows (a brief lock on `accounts`, which both read next) and released together. Their
 * connections use deadlock_timeout = 20 s, so a deadlock would show as a long wait, not a retry.
 */
const sql = testDb();
afterAll(() => sql.end());

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * 60 * MIN);
const at = (offsetMin: number) => new Date(BASE.getTime() + offsetMin * MIN);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date) => d.toISOString().slice(11, 16);

async function teacher() {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC' WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, 0, 1440)`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', 60000, 30)`;
  return id;
}
async function child(parent: string, t: string) {
  const c = await createChild(sql, parent);
  await activeLink(sql, { teacher: t, child: c, parent, subjects: ['maths'] });
  return c;
}
async function request(parent: string, c: string, t: string, start: Date, minutes: number) {
  const r = await requestLesson(sql, parent, {
    childId: c,
    teacherId: t,
    subject: 'maths',
    minutes: String(minutes),
    startsAt: start.toISOString(),
    priceMinor: String(Math.floor((60000 * minutes * 2 + 60) / 120)),
    currency: 'INR',
    basis: 'listed',
  });
  if (!r.ok) throw new Error(`request refused: ${r.reason}`);
  return r.id;
}
async function proposal(t: string, c: string, start: Date, minutes: number) {
  const r = await proposeLesson(sql, t, { childId: c, subject: 'maths', date: ymd(start), time: hm(start), minutes });
  if (!r.ok) throw new Error(`proposal refused: ${r.reason}`);
  return r.id;
}
const status = async (id: string) =>
  (
    await sql<
      { status: string; close_reason: string | null }[]
    >`SELECT status, close_reason FROM lessons WHERE id = ${id}`
  )[0]!;

/** One connection with a long deadlock timeout: a deadlock waits 20 s instead of being retried. */
const slowDeadlocks = (): Sql =>
  postgres(inject('databaseUrl'), { max: 1, onnotice: () => {}, connection: { deadlock_timeout: '20s' } });

/**
 * Runs two acceptances so that both hold their own lesson rows before either confirms, then
 * releases them together. Returns their results (or the error code) and how long they took.
 */
async function race(
  first: (conn: Sql) => Promise<{ ok: boolean; reason?: string }>,
  second: (conn: Sql) => Promise<{ ok: boolean; reason?: string }>,
) {
  const [x, y, gate] = [slowDeadlocks(), slowDeadlocks(), testDb()];
  const pids = [
    (await x<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid,
    (await y<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid,
  ];
  let open: () => void = () => {};
  const opened = new Promise<void>((r) => (open = r));
  let shut: () => void = () => {};
  const isShut = new Promise<void>((r) => (shut = r));
  const held = gate.begin(async (tx) => {
    await tx`LOCK TABLE accounts IN ACCESS EXCLUSIVE MODE`;
    shut();
    await opened;
  });
  await isShut;
  const outcome = (p: Promise<{ ok: boolean; reason?: string }>) =>
    p.then(
      (r) => (r.ok ? 'ok' : (r.reason ?? 'refused')),
      (e: { code?: string }) => `error ${e.code ?? '?'}`,
    );
  const started = Date.now();
  const both = Promise.all([outcome(first(x)), outcome(second(y))]);
  // Both are now waiting on the gate, each holding its own lesson row.
  for (let i = 0; i < 500; i += 1) {
    const [w] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = ANY(${pids}) AND wait_event_type = 'Lock'`;
    if (w!.n === 2) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  open();
  await held;
  const results = await both;
  const ms = Date.now() - started;
  await Promise.all([x.end(), y.end(), gate.end()]);
  return { results: [...results].sort(), ms };
}

describe('TQ-4: overlapping acceptances, forced to overlap, never deadlock', () => {
  it('two teachers accept overlapping requests for one child: one confirmed, the other "time taken", promptly', async () => {
    for (let round = 0; round < 4; round += 1) {
      const parent = await createAdult(sql, 'parent');
      const [t1, t2] = [await teacher(), await teacher()];
      const c = await child(parent, t1);
      await activeLink(sql, { teacher: t2, child: c, parent, subjects: ['maths'] });
      const a = await request(parent, c, t1, at(round * 120), 40);
      const b = await request(parent, c, t2, at(round * 120 + 30), 30);
      const { results, ms } = await race(
        (x) => answerLesson(x as never, t1, a, 'accept'),
        (y) => answerLesson(y as never, t2, b, 'accept'),
      );
      expect(results).toEqual(['ok', 'time_taken']);
      expect(ms).toBeLessThan(5_000); // a deadlock would wait 20 s
      const s = [await status(a), await status(b)].map((r) => r.status).sort();
      expect(s).toEqual(['confirmed', 'declined']);
    }
  }, 120_000);

  it('one teacher accepts overlapping requests for two children at once: the same', async () => {
    for (let round = 0; round < 3; round += 1) {
      const t = await teacher();
      const [p1, p2] = [await createAdult(sql, 'parent'), await createAdult(sql, 'parent')];
      const [c1, c2] = [await child(p1, t), await child(p2, t)];
      const a = await request(p1, c1, t, at(round * 120), 30);
      const b = await request(p2, c2, t, at(round * 120), 30); // same teacher, same time
      const { results, ms } = await race(
        (x) => answerLesson(x as never, t, a, 'accept'),
        (y) => answerLesson(y as never, t, b, 'accept'),
      );
      expect(results).toEqual(['ok', 'time_taken']);
      expect(ms).toBeLessThan(5_000);
    }
  }, 120_000);

  it('a parent accepts a proposal while another teacher accepts an overlapping request: the same', async () => {
    for (let round = 0; round < 3; round += 1) {
      const parent = await createAdult(sql, 'parent');
      const [t1, t2] = [await teacher(), await teacher()];
      const c = await child(parent, t1);
      await activeLink(sql, { teacher: t2, child: c, parent, subjects: ['maths'] });
      const p = await proposal(t1, c, at(round * 120), 30);
      const r = await request(parent, c, t2, at(round * 120), 30); // same child, same time
      const { results, ms } = await race(
        (x) => answerProposal(x as never, parent, p, 'accept'),
        (y) => answerLesson(y as never, t2, r, 'accept'),
      );
      expect(results).toEqual(['ok', 'time_taken']);
      expect(ms).toBeLessThan(5_000);
    }
  }, 120_000);
});

describe('Cleanup option A (owner, 30 Oct): overlapping open items close right after the acceptance commits', () => {
  /** Holds a lesson row (as a material request or a refused action would) until released. */
  async function hold(id: string, then: 'rollback' | 'withdraw' = 'rollback', parent = '') {
    const holder = testDb();
    let release: () => void = () => {};
    const released = new Promise<void>((r) => (release = r));
    let locked: () => void = () => {};
    const isLocked = new Promise<void>((r) => (locked = r));
    const done = holder
      .begin(async (tx) => {
        await tx`SELECT id FROM lessons WHERE id = ${id} FOR NO KEY UPDATE`;
        locked();
        await released;
        if (then === 'withdraw') {
          await tx`UPDATE lessons SET status = 'withdrawn', closed_by = 'parent', closed_by_account = ${parent}
                   WHERE id = ${id}`;
          return;
        }
        throw new Error('rolled back on purpose');
      })
      .catch(() => undefined)
      .finally(() => holder.end());
    await isLocked;
    return { release, done };
  }
  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 500; i += 1) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timed out');
  };

  it('a held overlapping request: the acceptance commits, its cleanup waits, then closes it at once (no sweep)', async () => {
    const parent = await createAdult(sql, 'parent');
    const [t1, t2] = [await teacher(), await teacher()];
    const c = await child(parent, t1);
    await activeLink(sql, { teacher: t2, child: c, parent, subjects: ['maths'] });
    const a = await request(parent, c, t1, at(600), 30);
    const b = await request(parent, c, t2, at(600), 30);
    const h = await hold(b);
    const accepting = answerLesson(sql as never, t1, a, 'accept');
    // The winning acceptance has committed; its cleanup is now waiting for b's holder.
    await waitFor(async () => (await status(a)).status === 'confirmed');
    expect(await status(b)).toEqual({ status: 'requested', close_reason: null });
    h.release();
    await h.done;
    expect(await accepting).toEqual({ ok: true });
    // Closed by the cleanup itself, not the sweep, with the usual reason and notice.
    expect(await status(b)).toEqual({ status: 'declined', close_reason: 'time_no_longer_free' });
    const notes = await sql`SELECT 1 FROM notifications WHERE entity_id = ${b} AND type = 'lesson_time_no_longer_free'`;
    expect(notes.length).toBeGreaterThan(0);
    expect(await sql.begin((tx) => closeLeftoverOverlaps(tx as never, new Date()))).toBe(0);
  });

  it('a new overlapping request or proposal made between the commit and the cleanup is refused; others are fine', async () => {
    const parent = await createAdult(sql, 'parent');
    const [t1, t2] = [await teacher(), await teacher()];
    const c = await child(parent, t1);
    await activeLink(sql, { teacher: t2, child: c, parent, subjects: ['maths'] });
    const a = await request(parent, c, t1, at(720), 30);
    const b = await request(parent, c, t2, at(720), 30);
    const h = await hold(b);
    const accepting = answerLesson(sql as never, t1, a, 'accept');
    await waitFor(async () => (await status(a)).status === 'confirmed');
    // In that gap: the time is already taken, so a new overlapping request or proposal is refused.
    const lessonsBefore = (
      await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lessons WHERE student_id = ${c}`
    )[0]!.n;
    const r = await requestLesson(sql, parent, {
      childId: c,
      teacherId: t2,
      subject: 'maths',
      minutes: '30',
      startsAt: at(720).toISOString(),
      priceMinor: '30000',
      currency: 'INR',
      basis: 'listed',
    });
    expect(r).toEqual({ ok: false, reason: 'busy' });
    const p = await proposeLesson(sql, t2, {
      childId: c,
      subject: 'maths',
      date: ymd(at(735)),
      time: hm(at(735)),
      minutes: 30,
    });
    expect(p).toEqual({ ok: false, reason: 'busy' });
    // A request that doesn't overlap is still possible meanwhile.
    expect(
      (
        await requestLesson(sql, parent, {
          childId: c,
          teacherId: t2,
          subject: 'maths',
          minutes: '30',
          startsAt: at(780).toISOString(),
          priceMinor: '30000',
          currency: 'INR',
          basis: 'listed',
        })
      ).ok,
    ).toBe(true);
    expect((await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lessons WHERE student_id = ${c}`)[0]!.n).toBe(
      lessonsBefore + 1,
    );
    h.release();
    await h.done;
    expect(await accepting).toEqual({ ok: true });
    expect((await status(b)).status).toBe('declined');
  });

  it('a held request that its holder closes meanwhile (withdrawn) is left as the holder left it, once', async () => {
    const parent = await createAdult(sql, 'parent');
    const [t1, t2] = [await teacher(), await teacher()];
    const c = await child(parent, t1);
    await activeLink(sql, { teacher: t2, child: c, parent, subjects: ['maths'] });
    const a = await request(parent, c, t1, at(840), 30);
    const b = await request(parent, c, t2, at(840), 30);
    const h = await hold(b, 'withdraw', parent);
    const accepting = answerLesson(sql as never, t1, a, 'accept');
    await waitFor(async () => (await status(a)).status === 'confirmed');
    h.release();
    await h.done;
    expect(await accepting).toEqual({ ok: true });
    expect(await status(b)).toEqual({ status: 'withdrawn', close_reason: null });
    const notes = await sql`SELECT 1 FROM notifications WHERE entity_id = ${b} AND type = 'lesson_time_no_longer_free'`;
    expect(notes).toHaveLength(0);
  });

  it('the sweep (safety net) still closes an open request left overlapping a confirmed lesson', async () => {
    const parent = await createAdult(sql, 'parent');
    const [t1, t2] = [await teacher(), await teacher()];
    const c = await child(parent, t1);
    await activeLink(sql, { teacher: t2, child: c, parent, subjects: ['maths'] });
    const a = await request(parent, c, t1, at(960), 30);
    expect(await answerLesson(sql as never, t1, a, 'accept')).toEqual({ ok: true });
    // As if the cleanup had not run (for example the server stopped between the two steps):
    // an open request over the confirmed lesson, written with the rules skipped for this insert.
    const [left] = await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      return tx<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                             reply_deadline, status, currency, rate_minor, price_minor, price_basis)
        SELECT ${t2}, ${c}, ${parent}, 'maths', starts_at, 30, ends_at, now(), now() + interval '48 hours',
               'requested', 'INR', 60000, 30000, 'listed'
        FROM lessons WHERE id = ${a} RETURNING id`;
    });
    await lessonMaintenance(sql);
    expect(await status(left!.id)).toEqual({ status: 'declined', close_reason: 'time_no_longer_free' });
  });

  it('the sweep leaves alone open requests that overlap nothing confirmed, and back-to-back ones', async () => {
    const parent = await createAdult(sql, 'parent');
    const t = await teacher();
    const c = await child(parent, t);
    const a = await request(parent, c, t, at(900), 30);
    const b = await request(parent, c, t, at(930), 30); // starts as a ends
    const d = await request(parent, c, t, at(990), 30);
    expect(await answerLesson(sql as never, t, a, 'accept')).toEqual({ ok: true });
    await lessonMaintenance(sql);
    expect((await status(b)).status).toBe('requested');
    expect((await status(d)).status).toBe('requested');
  });
});
