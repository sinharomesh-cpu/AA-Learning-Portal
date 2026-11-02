import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-4 PROTOTYPE (design notes rev 2, owner review 31 Oct 2026 §4): the integrity and locking
 * mechanism of a lesson move, on a throw-away database: every migration in db/migrations, then
 * the unnumbered draft db/drafts/tl4_lesson_changes.sql. Nothing here touches a shared database,
 * and the draft is not a migration. Synthetic accounts only.
 *
 * Every race test proves the second party really waited: its backend shows a Lock wait in
 * pg_stat_activity and pg_blocking_pids names the first party, before the first commits.
 */
const admin = testDb();
const name = `tl4p_${uniq()}`;
let url: string;
let sql: postgres.Sql;
let mon: postgres.Sql;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BASE = Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR; // a 10:00 UTC start, 3+ days ahead
const at = (ms: number) => new Date(BASE + ms);
const DRAFT = new URL('../../db/drafts/tl4_lesson_changes.sql', import.meta.url);

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
  u.pathname = `/${name}`;
  url = u.toString();
  sql = postgres(url, { max: 12, onnotice: () => {} });
  mon = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(sql);
  await sql.unsafe(await readFile(DRAFT, 'utf8'));
});

afterAll(async () => {
  await sql.end();
  await mon.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

/** Any connection or transaction to run a query on (tests only). */
type Q = postgres.TransactionSql;
const q = (c: postgres.ReservedSql) => c as unknown as Q;

/** A second (third...) session with its own transaction. */
async function session() {
  const c = await sql.reserve();
  const pid = (await c<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid;
  return { c, pid };
}

/** The session `pid` is waiting for a lock held by `blocker` (proof that it really waited). */
async function waitsFor(pid: number, blocker: number) {
  await expect
    .poll(
      async () => {
        const [r] = await mon<{ w: string | null; b: number[] }[]>`
          SELECT wait_event_type AS w, pg_blocking_pids(pid) AS b FROM pg_stat_activity WHERE pid = ${pid}`;
        return r && r.w === 'Lock' && r.b.includes(blocker);
      },
      { timeout: 10_000, interval: 50 },
    )
    .toBe(true);
}

async function family() {
  const teacher = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC' WHERE id = ${teacher}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${teacher}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${teacher}, ${d}, 0, 1440)`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${teacher}, true, 'INR', 60000, 30)`;
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  const link = await activeLink(sql, { teacher, child, parent, subjects: ['maths'] });
  return { teacher, parent, child, link };
}
type Family = Awaited<ReturnType<typeof family>>;

/** A confirmed lesson made from a teacher's proposal. */
async function confirmed(f: Family, start: Date, minutes = 30) {
  const [l] = await sql<{ id: string }[]>`
    INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by)
    VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, ${minutes}, 'proposed', ${f.teacher}) RETURNING id`;
  await sql`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent} WHERE id = ${l!.id}`;
  return l!.id;
}

/** A confirmed lesson made from a parent's request with one requested topic (chapter position 1). */
async function confirmedRequestWithTopic(f: Family, start: Date) {
  const id = await sql.begin(async (t) => {
    const [l] = await t<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, requested_by)
      VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, 30, 'requested', ${f.parent}) RETURNING id`;
    await t`INSERT INTO lesson_chapters (lesson_id, position, topic) VALUES (${l!.id}, 1, 'Fractions (sample)')`;
    return l!.id;
  });
  await sql`UPDATE lessons SET status = 'confirmed' WHERE id = ${id}`;
  return id;
}

/** The teacher proposes moving `original` to `start`. */
async function change(f: Family, original: string, start: Date) {
  const [l] = await sql<{ id: string; reply_deadline: Date }[]>`
    INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by, replaces_lesson_id)
    VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, 30, 'proposed', ${f.teacher}, ${original})
    RETURNING id, reply_deadline`;
  return l!;
}

/** The parent accepts a change in the TL-4 lock order: link, both lessons (lower id first), confirm. */
async function accept(c: Q, f: Family, original: string, replacement: string) {
  await c`SELECT 1 FROM teacher_student_links WHERE id = ${f.link} FOR SHARE`;
  await c`SELECT lessons_lock_pair(${original}, ${replacement})`;
  return c`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent}
           WHERE id = ${replacement} AND status = 'proposed' RETURNING id`;
}

const lesson = async (id: string) =>
  (
    await sql<
      { status: string; closed_by: string | null; close_reason: string | null; replaces_lesson_id: string | null }[]
    >`
    SELECT status, closed_by, close_reason, replaces_lesson_id FROM lessons WHERE id = ${id}`
  )[0]!;
const moves = async (id: string) =>
  sql<{ original_lesson_id: string; replacement_lesson_id: string; swap_xid: string }[]>`
    SELECT original_lesson_id, replacement_lesson_id, swap_xid::text FROM lesson_reschedules
    WHERE original_lesson_id = ${id} OR replacement_lesson_id = ${id}`;
const requests = async (lessonId: string) =>
  sql<
    {
      id: string;
      status: string;
      description: string | null;
      lesson_position: number | null;
      close_reason: string | null;
    }[]
  >`
    SELECT id, status, description, lesson_position, close_reason FROM material_requests
    WHERE lesson_id = ${lessonId} ORDER BY created_at, id`;
async function ask(f: Family, lessonId: string, what: string | number) {
  const [r] = await sql<{ id: string }[]>`
    INSERT INTO material_requests (lesson_id, raised_by, description, lesson_position)
    VALUES (${lessonId}, ${f.teacher}, ${typeof what === 'string' ? what : null}, ${typeof what === 'number' ? what : null})
    RETURNING id`;
  return r!.id;
}

describe('TL-4 prototype: the move', () => {
  it('closes the original as moved, confirms the replacement and writes one record stamped with this transaction', async () => {
    const f = await family();
    const o = await confirmed(f, at(0));
    const r = await change(f, o, at(DAY));
    const xid = await sql.begin(async (t) => {
      expect(await accept(t, f, o, r.id)).toHaveLength(1);
      return (await t<{ x: string }[]>`SELECT pg_current_xact_id()::text AS x`)[0]!.x;
    });
    expect(await lesson(o)).toMatchObject({ status: 'cancelled', closed_by: 'aa_pro', close_reason: 'rescheduled' });
    expect(await lesson(r.id)).toMatchObject({ status: 'confirmed', replaces_lesson_id: o });
    expect(await moves(o)).toEqual([{ original_lesson_id: o, replacement_lesson_id: r.id, swap_xid: xid }]);
    // The record can be neither changed nor removed.
    await expect(sql`UPDATE lesson_reschedules SET swapped_at = now() WHERE original_lesson_id = ${o}`).rejects.toThrow(
      /cannot change/,
    );
    await expect(sql`DELETE FROM lesson_reschedules WHERE original_lesson_id = ${o}`).rejects.toThrow(
      /cannot be removed/,
    );
  });

  it('sets the reply deadline to the earliest of the three terms (here: 30 minutes before the original)', async () => {
    const f = await family();
    const soon = new Date(Math.ceil((Date.now() + 25 * HOUR) / (5 * MIN)) * 5 * MIN);
    const o = await confirmed(f, soon);
    const r = await change(f, o, at(20 * DAY));
    expect(r.reply_deadline.getTime()).toBe(soon.getTime() - 30 * MIN);
  });

  it('copies the chapters and a request that names a chapter; answered requests stay on the original only', async () => {
    const f = await family();
    const o = await confirmedRequestWithTopic(f, at(2 * HOUR));
    const byChapter = await ask(f, o, 1);
    const byText = await ask(f, o, 'A ruler (sample)');
    const answered = await ask(f, o, 'Squared paper (sample)');
    await sql`UPDATE material_requests SET status = 'unavailable', closed_by = 'parent', closed_by_account = ${f.parent}
              WHERE id = ${answered}`;
    const r = await change(f, o, at(DAY + 2 * HOUR));
    await sql.begin((t) => accept(t, f, o, r.id));

    expect(await sql`SELECT position, source, topic, label FROM lesson_chapters WHERE lesson_id = ${r.id}`).toEqual([
      { position: 1, source: 'requested', topic: 'Fractions (sample)', label: 'Fractions (sample)' },
    ]);
    expect(await sql`SELECT count(*)::int AS n FROM lesson_chapters WHERE lesson_id = ${o}`).toEqual([{ n: 1 }]);
    const before = await requests(o);
    expect(before.map((x) => [x.id, x.status, x.close_reason])).toEqual([
      [byChapter, 'no_longer_needed', 'carried_forward'],
      [byText, 'no_longer_needed', 'carried_forward'],
      [answered, 'unavailable', null],
    ]);
    const copies = await requests(r.id);
    // The copies are written in one transaction, so created_at ties and the id order is random:
    // compare them as a set (sorted), not in insertion order.
    const shown = copies.map((x) => [x.status, x.lesson_position, x.description]);
    expect(shown.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      ['open', 1, null],
      ['open', null, 'A ruler (sample)'],
    ]);
  });

  it('writes no notifications or audit entries itself (notices stay with the application)', async () => {
    const f = await family();
    const o = await confirmed(f, at(4 * HOUR));
    await ask(f, o, 'A protractor (sample)');
    const r = await change(f, o, at(DAY + 4 * HOUR));
    const count = async () =>
      (
        await sql<{ n: number; a: number }[]>`SELECT (SELECT count(*)::int FROM notifications) AS n,
                                                   (SELECT count(*)::int FROM audit_events) AS a`
      )[0];
    const before = await count();
    await sql.begin((t) => accept(t, f, o, r.id));
    expect(await count()).toEqual(before);
  });
});

describe('TL-4 prototype: the two-way rule at commit', () => {
  it('Direction A: a lesson closed as moved with no replacement is refused at commit; nothing changes', async () => {
    const f = await family();
    const o = await confirmed(f, at(6 * HOUR));
    await expect(
      sql.begin(
        (t) =>
          t`UPDATE lessons SET status = 'cancelled', closed_by = 'aa_pro', close_reason = 'rescheduled' WHERE id = ${o}`,
      ),
    ).rejects.toThrow(/needs its replacement/);
    expect(await lesson(o)).toMatchObject({ status: 'confirmed' });
  });

  it('Direction A guard: a later, unrelated update of an already-moved original commits (no new record needed)', async () => {
    const f = await family();
    const o = await confirmed(f, at(8 * HOUR));
    const r = await change(f, o, at(DAY + 8 * HOUR));
    await sql.begin((t) => accept(t, f, o, r.id));
    // A later transaction touches the moved original (as ON DELETE SET NULL would), without
    // changing its status or reason: the commit check must not ask for a record from THIS transaction.
    await sql.begin(async (t) => {
      const res =
        await t`UPDATE lessons SET agreement_id = agreement_id, closed_by_account = NULL WHERE id = ${o} RETURNING id`;
      expect(res).toHaveLength(1);
    });
    // Likewise for the confirmed replacement (Direction B guard).
    await sql.begin((t) => t`UPDATE lessons SET agreement_id = agreement_id WHERE id = ${r.id}`);
    expect(await lesson(o)).toMatchObject({ status: 'cancelled', close_reason: 'rescheduled' });
    expect(await moves(o)).toHaveLength(1);
  });

  it('Direction B: a change confirmed without the move (swap trigger switched off) is refused at commit', async () => {
    const f = await family();
    const o = await confirmed(f, at(10 * HOUR));
    const r = await change(f, o, at(DAY + 10 * HOUR));
    const { c } = await session();
    try {
      await c.unsafe('BEGIN');
      await c.unsafe('ALTER TABLE lessons DISABLE TRIGGER lessons_before_update_tl4');
      await c`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent} WHERE id = ${r.id}`;
      await expect(c.unsafe('COMMIT')).rejects.toThrow(/needs its original closed as moved/);
    } finally {
      await c.unsafe('ROLLBACK').catch(() => {});
      c.release();
    }
    expect(await lesson(r.id)).toMatchObject({ status: 'proposed' });
    expect(await lesson(o)).toMatchObject({ status: 'confirmed' });
  });

  it('an unrelated confirmed lesson cannot stand in as the replacement', async () => {
    const f = await family();
    const o = await confirmed(f, at(12 * HOUR));
    const unrelated = await confirmed(f, at(DAY + 12 * HOUR));
    await expect(
      sql.begin(async (t) => {
        await t`UPDATE lessons SET status = 'cancelled', closed_by = 'aa_pro', close_reason = 'rescheduled' WHERE id = ${o}`;
        await t`INSERT INTO lesson_reschedules (original_lesson_id, replacement_lesson_id, swap_xid)
                VALUES (${o}, ${unrelated}, pg_current_xact_id())`;
      }),
    ).rejects.toThrow(/written only by the move itself/);
    expect(await lesson(o)).toMatchObject({ status: 'confirmed' });
  });

  it('a replacement confirmed in an earlier transaction cannot serve a second original', async () => {
    const f = await family();
    const o1 = await confirmed(f, at(14 * HOUR));
    const r1 = await change(f, o1, at(DAY + 14 * HOUR));
    await sql.begin((t) => accept(t, f, o1, r1.id));
    const o2 = await confirmed(f, at(2 * DAY + 14 * HOUR));
    await expect(
      sql.begin(async (t) => {
        await t`UPDATE lessons SET status = 'cancelled', closed_by = 'aa_pro', close_reason = 'rescheduled' WHERE id = ${o2}`;
        await t`INSERT INTO lesson_reschedules (original_lesson_id, replacement_lesson_id, swap_xid)
                VALUES (${o2}, ${r1.id}, pg_current_xact_id())`;
      }),
    ).rejects.toThrow(/written only by the move itself|duplicate key/);
    expect(await lesson(o2)).toMatchObject({ status: 'confirmed' });
  });

  it('a second change for one lesson is refused, before and after the move', async () => {
    const f = await family();
    const o = await confirmed(f, at(16 * HOUR));
    const r = await change(f, o, at(DAY + 16 * HOUR));
    await expect(change(f, o, at(2 * DAY + 16 * HOUR))).rejects.toThrow(/lessons_one_open_change/);
    await sql.begin((t) => accept(t, f, o, r.id));
    await expect(change(f, o, at(2 * DAY + 16 * HOUR))).rejects.toThrow(/only a confirmed lesson/);
  });

  it('an original cancelled for another reason cannot be moved; the change stays open', async () => {
    const f = await family();
    const o = await confirmed(f, at(18 * HOUR));
    const r = await change(f, o, at(DAY + 18 * HOUR));
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${o}`;
    await expect(sql.begin((t) => accept(t, f, o, r.id))).rejects.toThrow(/cancelled or changed meanwhile/);
    expect(await lesson(r.id)).toMatchObject({ status: 'proposed' });
    expect(await moves(o)).toHaveLength(0);
  });
});

describe('TL-4 prototype: partial moves fail closed', () => {
  async function fixture(offset: number) {
    const f = await family();
    const o = await confirmedRequestWithTopic(f, at(offset));
    await ask(f, o, 1);
    await ask(f, o, 'A ruler (sample)');
    const r = await change(f, o, at(DAY + offset));
    return { f, o, r };
  }
  async function unchanged(o: string, r: string) {
    expect(await lesson(o)).toMatchObject({ status: 'confirmed', close_reason: null });
    expect(await lesson(r)).toMatchObject({ status: 'proposed' });
    expect(await moves(o)).toHaveLength(0);
    expect((await requests(o)).map((x) => x.status)).toEqual(['open', 'open']);
    expect(await requests(r)).toHaveLength(0);
    expect(await sql`SELECT 1 FROM lesson_chapters WHERE lesson_id = ${r}`).toHaveLength(0);
  }

  it('failing after the original closed (the new time overlaps another confirmed lesson of the child)', async () => {
    const { f, o, r } = await fixture(20 * HOUR);
    // Another teacher's confirmed lesson for the same child at the new time.
    const g = await family();
    await activeLink(sql, { teacher: g.teacher, child: f.child, parent: f.parent, subjects: ['maths'] });
    await sql`INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by)
              VALUES (${g.teacher}, ${f.child}, 'maths', ${at(DAY + 20 * HOUR)}, 30, 'proposed', ${g.teacher})`;
    await sql`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent}
              WHERE teacher_id = ${g.teacher} AND student_id = ${f.child}`;
    await expect(sql.begin((t) => accept(t, f, o, r.id))).rejects.toThrow(/lessons_child_no_overlap/);
    await unchanged(o, r.id);
  });

  it('failing after the replacement confirmed (a later error in the same transaction)', async () => {
    const { f, o, r } = await fixture(22 * HOUR);
    await expect(
      sql.begin(async (t) => {
        await accept(t, f, o, r.id);
        await t`SELECT 1 / 0`;
      }),
    ).rejects.toThrow(/division by zero/);
    await unchanged(o, r.id);
  });

  it('rolled back to a savepoint: the transaction commits with nothing half-done', async () => {
    const { f, o, r } = await fixture(24 * HOUR + 30 * MIN);
    await sql.begin(async (t) => {
      await t
        .savepoint(async (s) => {
          await accept(s, f, o, r.id);
          throw new Error('undo');
        })
        .catch(() => {});
    });
    await unchanged(o, r.id);
  });

  it('SET CONSTRAINTS ALL IMMEDIATE mid-move fails closed', async () => {
    const { f, o, r } = await fixture(26 * HOUR);
    await expect(
      sql.begin(async (t) => {
        await t`SET CONSTRAINTS ALL IMMEDIATE`;
        await accept(t, f, o, r.id);
      }),
    ).rejects.toThrow(/needs its replacement/);
    await unchanged(o, r.id);
  });

  it('keeps the limit of five open requests: a move that would exceed it is refused, nothing changes [PROPOSED]', async () => {
    const f = await family();
    const o = await confirmed(f, at(28 * HOUR));
    await ask(f, o, 'One (sample)');
    await ask(f, o, 'Two (sample)');
    const r = await change(f, o, at(DAY + 28 * HOUR));
    for (const n of ['Three', 'Four', 'Five', 'Six']) await ask(f, r.id, `${n} (sample)`);
    await expect(sql.begin((t) => accept(t, f, o, r.id))).rejects.toThrow(/material_request_limit/);
    expect(await lesson(o)).toMatchObject({ status: 'confirmed' });
    expect((await requests(o)).map((x) => x.status)).toEqual(['open', 'open']);
    expect(await requests(r.id)).toHaveLength(4);
  });
});

describe('TL-4 prototype: lock order and races (each second party proven to wait)', () => {
  it('lessons_lock_pair always takes the lower id first, whatever order the ids are passed in', async () => {
    const f = await family();
    const a = await confirmed(f, at(30 * HOUR));
    const b = await confirmed(f, at(31 * HOUR));
    const [lo, hi] = [a, b].sort() as [string, string];
    for (const args of [
      [lo, hi],
      [hi, lo],
    ] as const) {
      // Case 1: someone holds the HIGHER row. The pair lock takes the lower one, then waits.
      const x = await session();
      const y = await session();
      const probe = await session();
      try {
        await x.c.unsafe('BEGIN');
        await x.c`SELECT 1 FROM lessons WHERE id = ${hi} FOR UPDATE`;
        await y.c.unsafe('BEGIN');
        const pending = y.c`SELECT lessons_lock_pair(${args[0]}, ${args[1]})`.execute();
        await waitsFor(y.pid, x.pid);
        // It already holds the lower row: a third session can't take it.
        await expect(probe.c`SELECT 1 FROM lessons WHERE id = ${lo} FOR UPDATE NOWAIT`).rejects.toThrow(
          /could not obtain lock/,
        );
        await x.c.unsafe('COMMIT');
        await pending;
        await y.c.unsafe('COMMIT');

        // Case 2: someone holds the LOWER row. The pair lock waits there and holds nothing yet.
        await x.c.unsafe('BEGIN');
        await x.c`SELECT 1 FROM lessons WHERE id = ${lo} FOR UPDATE`;
        await y.c.unsafe('BEGIN');
        const pending2 = y.c`SELECT lessons_lock_pair(${args[0]}, ${args[1]})`.execute();
        await waitsFor(y.pid, x.pid);
        await probe.c.unsafe('BEGIN');
        await probe.c`SELECT 1 FROM lessons WHERE id = ${hi} FOR UPDATE NOWAIT`; // free: not taken first
        await probe.c.unsafe('ROLLBACK');
        await x.c.unsafe('COMMIT');
        await pending2;
        await y.c.unsafe('COMMIT');
      } finally {
        for (const s of [x, y, probe]) {
          await s.c.unsafe('ROLLBACK').catch(() => {});
          s.c.release();
        }
      }
    }
  });

  it('move first, cancellation of the original second: the cancellation waits, then finds nothing to cancel', async () => {
    const f = await family();
    const o = await confirmed(f, at(32 * HOUR));
    const r = await change(f, o, at(DAY + 32 * HOUR));
    const m = await session();
    const k = await session();
    try {
      await m.c.unsafe('BEGIN');
      await accept(q(m.c), f, o, r.id);
      await k.c.unsafe('BEGIN');
      await k.c`SELECT 1 FROM teacher_student_links WHERE id = ${f.link} FOR SHARE`;
      const cancel = k.c`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent}
                         WHERE id = ${o} AND status = 'confirmed' RETURNING id`.execute();
      await waitsFor(k.pid, m.pid);
      await m.c.unsafe('COMMIT');
      expect(await cancel).toHaveLength(0);
      await k.c.unsafe('COMMIT');
    } finally {
      for (const s of [m, k]) {
        await s.c.unsafe('ROLLBACK').catch(() => {});
        s.c.release();
      }
    }
    expect(await lesson(o)).toMatchObject({ status: 'cancelled', closed_by: 'aa_pro', close_reason: 'rescheduled' });
  });

  it('cancellation first, move second: the move waits, re-checks and is refused', async () => {
    const f = await family();
    const o = await confirmed(f, at(34 * HOUR));
    const r = await change(f, o, at(DAY + 34 * HOUR));
    const k = await session();
    const m = await session();
    try {
      await k.c.unsafe('BEGIN');
      await k.c`SELECT 1 FROM teacher_student_links WHERE id = ${f.link} FOR SHARE`;
      await k.c`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${o}`;
      await m.c.unsafe('BEGIN');
      const move = accept(q(m.c), f, o, r.id);
      await waitsFor(m.pid, k.pid);
      await k.c.unsafe('COMMIT');
      await expect(move).rejects.toThrow(/cancelled or changed meanwhile/);
    } finally {
      for (const s of [k, m]) {
        await s.c.unsafe('ROLLBACK').catch(() => {});
        s.c.release();
      }
    }
    expect(await lesson(r.id)).toMatchObject({ status: 'proposed' });
    expect(await lesson(o)).toMatchObject({ status: 'cancelled', closed_by: 'parent' });
  });

  it('two parents accepting the same change: the second waits, then finds it already accepted', async () => {
    const f = await family();
    const second = await createAdult(sql, 'parent');
    await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${second}, ${f.child})`;
    const o = await confirmed(f, at(36 * HOUR));
    const r = await change(f, o, at(DAY + 36 * HOUR));
    const a = await session();
    const b = await session();
    try {
      await a.c.unsafe('BEGIN');
      await accept(q(a.c), f, o, r.id);
      await b.c.unsafe('BEGIN');
      const other = accept(q(b.c), { ...f, parent: second }, o, r.id);
      await waitsFor(b.pid, a.pid);
      await a.c.unsafe('COMMIT');
      expect(await other).toHaveLength(0);
      await b.c.unsafe('COMMIT');
    } finally {
      for (const s of [a, b]) {
        await s.c.unsafe('ROLLBACK').catch(() => {});
        s.c.release();
      }
    }
    expect(await moves(o)).toHaveLength(1);
  });

  it('a parent answers a request while the move runs: the move waits; the answered request is not copied', async () => {
    const f = await family();
    const o = await confirmed(f, at(38 * HOUR));
    const answered = await ask(f, o, 'Coloured pencils (sample)');
    await ask(f, o, 'A glue stick (sample)');
    const r = await change(f, o, at(DAY + 38 * HOUR));
    const p = await session();
    const m = await session();
    try {
      await p.c.unsafe('BEGIN');
      await p.c`UPDATE material_requests SET status = 'unavailable', closed_by = 'parent', closed_by_account = ${f.parent}
                WHERE id = ${answered}`;
      await m.c.unsafe('BEGIN');
      const move = accept(q(m.c), f, o, r.id);
      await waitsFor(m.pid, p.pid);
      await p.c.unsafe('COMMIT');
      expect(await move).toHaveLength(1);
      await m.c.unsafe('COMMIT');
    } finally {
      for (const s of [p, m]) {
        await s.c.unsafe('ROLLBACK').catch(() => {});
        s.c.release();
      }
    }
    expect((await requests(o)).map((x) => [x.description, x.status])).toEqual([
      ['Coloured pencils (sample)', 'unavailable'],
      ['A glue stick (sample)', 'no_longer_needed'],
    ]);
    expect((await requests(r.id)).map((x) => [x.description, x.status])).toEqual([['A glue stick (sample)', 'open']]);
  });

  it('the move first: a parent answering the original waits, then is refused; exactly one copy exists', async () => {
    const f = await family();
    const o = await confirmed(f, at(40 * HOUR));
    const req = await ask(f, o, 'A calculator (sample)');
    const r = await change(f, o, at(DAY + 40 * HOUR));
    const m = await session();
    const p = await session();
    try {
      await m.c.unsafe('BEGIN');
      await accept(q(m.c), f, o, r.id);
      await p.c.unsafe('BEGIN');
      const answer =
        p.c`UPDATE material_requests SET status = 'unavailable', closed_by = 'parent', closed_by_account = ${f.parent}
                         WHERE id = ${req}`.execute();
      await waitsFor(p.pid, m.pid);
      await m.c.unsafe('COMMIT');
      await expect(answer).rejects.toThrow(/cannot change/);
    } finally {
      for (const s of [m, p]) {
        await s.c.unsafe('ROLLBACK').catch(() => {});
        s.c.release();
      }
    }
    expect((await requests(r.id)).map((x) => [x.description, x.status])).toEqual([['A calculator (sample)', 'open']]);
  });
});

describe('TL-4 prototype: the shared chapter function', () => {
  it('is 0034’s lesson_chapters_before_write with exactly one block added', async () => {
    const draft = await readFile(DRAFT, 'utf8');
    const m34 = await readFile(new URL('../../db/migrations/0034_teacher_proposals.sql', import.meta.url), 'utf8');
    const fn = (s: string) => {
      const a = s.indexOf('CREATE OR REPLACE FUNCTION lesson_chapters_before_write()');
      return s.slice(a, s.indexOf('END $$;', a) + 7);
    };
    const added = fn(draft);
    const start = added.indexOf('  -- TL-4: a chapter copied by the swap');
    const end = added.indexOf('  END IF;\n\n', start) + '  END IF;\n\n'.length;
    expect(added.slice(0, start) + added.slice(end)).toBe(fn(m34));
  });
});
