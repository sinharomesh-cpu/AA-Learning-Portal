import postgres from 'postgres';
import { afterAll, describe, expect, inject, it } from 'vitest';
import {
  answerLesson,
  closeLeftoverOverlaps,
  lessonMaintenance,
  lockLessonTimes,
  requestLesson,
} from '@/server/lessons';
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

describe('TQ-4 safety net: an overlapping request skipped at confirmation is closed by maintenance', () => {
  it('a request held by another transaction at the confirmation stays open, then the sweep closes it, once', async () => {
    const parent = await createAdult(sql, 'parent');
    const [t1, t2] = [await teacher(), await teacher()];
    const c = await child(parent, t1);
    await activeLink(sql, { teacher: t2, child: c, parent, subjects: ['maths'] });
    const a = await request(parent, c, t1, at(600), 30);
    const b = await request(parent, c, t2, at(600), 30); // same child, same time
    // Another transaction holds b (as a parent's or teacher's change would), then leaves it open.
    const holder = testDb();
    let release: () => void = () => {};
    const released = new Promise<void>((r) => (release = r));
    let locked: () => void = () => {};
    const isLocked = new Promise<void>((r) => (locked = r));
    const holding = holder.begin(async (tx) => {
      await tx`SELECT id FROM lessons WHERE id = ${b} FOR UPDATE`;
      locked();
      await released;
      throw new Error('rolled back on purpose');
    });
    await isLocked;
    expect(await answerLesson(sql as never, t1, a, 'accept')).toEqual({ ok: true }); // did not wait for b
    release();
    await holding.catch(() => undefined);
    await holder.end();
    expect(await status(b)).toEqual({ status: 'requested', close_reason: null });
    // The maintenance sweep closes it as if at that confirmation, with the usual notice; once.
    await lessonMaintenance(sql);
    expect(await status(b)).toEqual({ status: 'declined', close_reason: 'time_no_longer_free' });
    const notes = await sql`SELECT 1 FROM notifications WHERE entity_id = ${b} AND type = 'lesson_time_no_longer_free'`;
    expect(notes.length).toBeGreaterThan(0);
    expect(await sql.begin((tx) => closeLeftoverOverlaps(tx as never, new Date()))).toBe(0);
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

describe('TQ-4: the application’s time locks are 0034’s time locks (PR #137 with migration 0034)', () => {
  const tryLock = (conn: Sql, kind: 'teacher' | 'child', id: string) =>
    conn<{ got: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${`aa_pro.lesson_times.${kind}:`} || ${id}::uuid::text, 0)) AS got`;

  it('lockLessonTimes holds exactly the keys lessons_lock_times takes: another transaction can’t take either', async () => {
    const t = await teacher();
    const parent = await createAdult(sql, 'parent');
    const c = await child(parent, t);
    const other = testDb();
    await sql.begin(async (tx) => {
      await lockLessonTimes(tx as never, t, c);
      // 0034's own function, from another connection, would wait: the try-lock forms say no.
      await other.begin(async (o) => {
        expect((await tryLock(o as never, 'teacher', t))[0]!.got).toBe(false);
        expect((await tryLock(o as never, 'child', c))[0]!.got).toBe(false);
      });
      // ...and the same holds the other way round, from 0034's function.
    });
    await sql.begin(async (tx) => {
      await tx`SELECT lessons_lock_times(${t}::uuid, ${c}::uuid)`;
      await other.begin(async (o) => {
        expect((await tryLock(o as never, 'teacher', t))[0]!.got).toBe(false);
        expect((await tryLock(o as never, 'child', c))[0]!.got).toBe(false);
      });
    });
    // Released at commit: free again.
    await other.begin(async (o) => {
      expect((await tryLock(o as never, 'teacher', t))[0]!.got).toBe(true);
      expect((await tryLock(o as never, 'child', c))[0]!.got).toBe(true);
    });
    await other.end();
  });

  it('re-entrant: the application lock, then 0034’s function, then a confirmation, in one transaction, never waits on itself', async () => {
    const t = await teacher();
    const parent = await createAdult(sql, 'parent');
    const c = await child(parent, t);
    const r = await request(parent, c, t, at(1500), 30);
    const started = Date.now();
    // answerLesson takes lockLessonTimes, then the 0034 trigger takes lessons_lock_times again.
    expect(await answerLesson(sql as never, t, r, 'accept')).toEqual({ ok: true });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect((await status(r)).status).toBe('confirmed');
  });

  it('the same teacher-then-child order everywhere: a proposal waits for an overlapping confirmation, never deadlocks', async () => {
    const t = await teacher();
    const parent = await createAdult(sql, 'parent');
    const c = await child(parent, t);
    const holder = slowDeadlocks();
    let release: () => void = () => {};
    const released = new Promise<void>((ok) => (release = ok));
    let held: () => void = () => {};
    const isHeld = new Promise<void>((ok) => (held = ok));
    const holding = holder.begin(async (tx) => {
      await lockLessonTimes(tx as never, t, c); // as answerLesson does before confirming
      held();
      await released;
    });
    await isHeld;
    const started = Date.now();
    const p = proposeLesson(sql, t, {
      childId: c,
      subject: 'maths',
      date: ymd(at(1620)),
      time: hm(at(1620)),
      minutes: 30,
    });
    await new Promise((ok) => setTimeout(ok, 300));
    release();
    await holding;
    expect((await p).ok).toBe(true); // waited for the application lock (0034's trigger takes the same keys)
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(Date.now() - started).toBeLessThan(5_000);
    await holder.end();
  });
});
