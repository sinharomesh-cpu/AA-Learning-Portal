import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-4 FINAL DESIGN (signed-off specification, Evidence Pack 4.1-4.3): acceptance tests on a
 * throw-away database built from every migration plus the unnumbered draft
 * db/drafts/tl4_lesson_changes.sql. Nothing here touches a shared database; the draft is not a
 * migration and has no number. Synthetic accounts only. AC numbers refer to Evidence Pack 4.3 §8.
 */
const admin = testDb();
const name = `tl4f_${uniq()}`;
let url: string;
let sql: postgres.Sql;
let mon: postgres.Sql;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BASE = Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR;
const at = (ms: number) => new Date(BASE + ms);
const DRAFT = new URL('../../db/drafts/tl4_lesson_changes.sql', import.meta.url);
const ROLLBACK = new URL('../../db/drafts/tl4_lesson_changes_rollback.sql', import.meta.url);

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
  u.pathname = `/${name}`;
  url = u.toString();
  sql = postgres(url, { max: 8, onnotice: () => {} });
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

type Q = postgres.TransactionSql;

async function teacher() {
  const t = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC' WHERE id = ${t}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${t}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${t}, ${d}, 0, 1440)`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${t}, true, 'INR', 60000, 30)`;
  return t;
}
async function family() {
  const t = await teacher();
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  const link = await activeLink(sql, { teacher: t, child, parent, subjects: ['maths'] });
  return { teacher: t, parent, child, link };
}
type Family = Awaited<ReturnType<typeof family>>;

/** A confirmed lesson from a teacher proposal, optionally with planned book chapters. */
async function confirmed(f: Family, start: Date, chapters: string[] = []) {
  const id = await sql.begin(async (t) => {
    const [l] = await t<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by)
      VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, 30, 'proposed', ${f.teacher}) RETURNING id`;
    for (const [i, c] of chapters.entries())
      await t`INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id) VALUES (${l!.id}, ${i + 1}, 'planned', ${c})`;
    return l!.id;
  });
  await sql`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent} WHERE id = ${id}`;
  return id;
}
/** A confirmed lesson from a parent request with one free-text topic. */
async function confirmedTopic(f: Family, start: Date, topic: string) {
  const id = await sql.begin(async (t) => {
    const [l] = await t<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, requested_by)
      VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, 30, 'requested', ${f.parent}) RETURNING id`;
    await t`INSERT INTO lesson_chapters (lesson_id, position, topic) VALUES (${l!.id}, 1, ${topic})`;
    return l!.id;
  });
  await sql`UPDATE lessons SET status = 'confirmed' WHERE id = ${id}`;
  return id;
}
/** A parent's change request with one free-text topic (Q-B C2 for topic lessons). */
async function topicChange(f: Family, original: string, start: Date, topic: string) {
  return sql.begin(async (t) => {
    const [l] = await t<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, requested_by, replaces_lesson_id)
      VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, 30, 'requested', ${f.parent}, ${original}) RETURNING id`;
    await t`INSERT INTO lesson_chapters (lesson_id, position, topic) VALUES (${l!.id}, 1, ${topic})`;
    return l!.id;
  });
}
/** The teacher proposes moving `original` to `start`, optionally with its own planned chapters (C2). */
async function change(f: Family, original: string, start: Date, chapters: string[] = [], c: postgres.Sql | Q = sql) {
  const run = async (t: Q) => {
    const [l] = await t<{ id: string; reply_deadline: Date; requested_at: Date }[]>`
      INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by, replaces_lesson_id)
      VALUES (${f.teacher}, ${f.child}, 'maths', ${start}, 30, 'proposed', ${f.teacher}, ${original})
      RETURNING id, reply_deadline, requested_at`;
    for (const [i, ch] of chapters.entries())
      await t`INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id) VALUES (${l!.id}, ${i + 1}, 'planned', ${ch})`;
    return l!;
  };
  return 'begin' in c ? (c as postgres.Sql).begin(run) : run(c as Q);
}
async function accept(c: Q, f: Family, original: string, replacement: string) {
  await c`SELECT 1 FROM teacher_student_links WHERE id = ${f.link} FOR SHARE`;
  await c`SELECT lessons_lock_pair(${original}, ${replacement})`;
  if ((await c`SELECT 1 FROM lessons WHERE id = ${replacement} AND status = 'requested'`).length)
    return c`UPDATE lessons SET status = 'confirmed' WHERE id = ${replacement} RETURNING id`;
  return c`UPDATE lessons SET status = 'confirmed', confirmed_by = ${f.parent} WHERE id = ${replacement} RETURNING id`;
}
async function book(f: Family, titles: string[]) {
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${f.parent}, 'Maths (sample)', 'maths', 'chapter_files', 'published')
    RETURNING id`;
  const ch: string[] = [];
  for (const [i, t] of titles.entries())
    ch.push(
      (
        await sql<
          { id: string }[]
        >`INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${t}) RETURNING id`
      )[0]!.id,
    );
  await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${f.child})`;
  return ch;
}
async function ask(f: Family, lessonId: string, what: string | number) {
  const [r] = await sql<{ id: string }[]>`
    INSERT INTO material_requests (lesson_id, raised_by, description, lesson_position)
    VALUES (${lessonId}, ${f.teacher}, ${typeof what === 'string' ? what : null}, ${typeof what === 'number' ? what : null})
    RETURNING id`;
  return r!.id;
}
const reqs = (lessonId: string) =>
  sql<
    {
      id: string;
      logical_request_id: string;
      status: string;
      close_reason: string | null;
      lesson_position: number | null;
      description: string | null;
    }[]
  >`
    SELECT id, logical_request_id, status, close_reason, lesson_position, description FROM material_requests
    WHERE lesson_id = ${lessonId} ORDER BY created_at, id`;
const status = async (id: string) =>
  (
    await sql<
      { status: string; close_reason: string | null }[]
    >`SELECT status, close_reason FROM lessons WHERE id = ${id}`
  )[0]!;
/** Everything about a lesson the move may touch (AC-6 / AC-7 "unchanged"). */
const snapshot = async (id: string) => ({
  lesson: await sql`SELECT status, closed_at, close_reason, price_minor, starts_at FROM lessons WHERE id = ${id}`,
  chapters:
    await sql`SELECT position, book_chapter_id, topic, label FROM lesson_chapters WHERE lesson_id = ${id} ORDER BY position`,
  requests:
    await sql`SELECT id, logical_request_id, status, close_reason, lesson_position FROM material_requests WHERE lesson_id = ${id} ORDER BY id`,
  moves: await sql`SELECT count(*)::int AS n FROM lesson_reschedules WHERE original_lesson_id = ${id}`,
  maps: await sql`SELECT count(*)::int AS n FROM lesson_reschedule_requests x JOIN material_requests m ON m.id = x.original_request_id WHERE m.lesson_id = ${id}`,
});
const parentCount = async (p: string) => (await sql<{ n: number }[]>`SELECT tl4_parent_open_count(${p}) AS n`)[0]!.n;

describe('AC-1 / AC-4 / PO-D5: timing at creation', () => {
  it('AC-1: refused when the original starts at most 30 minutes after the proposal (deadline would be <= P); allowed 5 minutes later with D = O - 30 min', async () => {
    const f = await family();
    const o = await confirmed(f, at(0));
    const tryAt = (extraMin: number) =>
      sql.begin(async (t) => {
        const p = (await t<{ p: Date }[]>`SELECT now() AS p`)[0]!.p;
        const oStart = new Date(Math.floor((p!.getTime() + 30 * MIN) / MIN) * MIN + extraMin * MIN);
        await t.unsafe(`SET LOCAL session_replication_role = replica`);
        // Test fixture only: put the confirmed original 30 (or 35) minutes ahead, keeping 0029's
        // CHECKs true (an ordinary lesson's deadline is fixed by its own requested_at).
        await t`UPDATE lessons SET starts_at = ${oStart}, ends_at = ${new Date(oStart.getTime() + 30 * MIN)},
                  requested_at = ${new Date(p!.getTime() - 3 * DAY)}, reply_deadline = ${new Date(p!.getTime() - DAY)},
                  confirmed_at = ${new Date(p!.getTime() - 2 * DAY)}
                WHERE id = ${o}`;
        await t.unsafe(`SET LOCAL session_replication_role = origin`);
        const r = await change(f, o, at(2 * DAY), [], t);
        return { r, oStart, p: p! };
      });
    // Either guard may fire first (O < P + 30 min, or D <= P when O = P + 30 min exactly); both refuse.
    await expect(tryAt(0)).rejects.toThrow(/starts too soon to move|at least 30 minutes away/);
    const ok = await tryAt(5);
    expect(ok.r.reply_deadline.getTime()).toBe(ok.oStart.getTime() - 30 * MIN);
    expect(ok.r.reply_deadline.getTime()).toBeGreaterThan(ok.p.getTime());
  });

  it('AC-4 (a) P + 48 h and (b) R - 2 h are each the deadline when earliest', async () => {
    const f = await family();
    const o = await confirmed(f, at(6 * DAY));
    const a = await change(f, o, at(5 * DAY));
    expect(a.reply_deadline.getTime()).toBe(a.requested_at.getTime() + 48 * HOUR);
    await sql`UPDATE lessons SET status = 'withdrawn', closed_by = 'teacher', closed_by_account = ${f.teacher} WHERE id = ${a.id}`;
    const p = Date.now();
    const r = new Date(Math.ceil((p + 25 * HOUR) / (5 * MIN)) * 5 * MIN);
    const b = await change(f, o, r);
    expect(b.reply_deadline.getTime()).toBe(r.getTime() - 2 * HOUR);
  });

  it('AC-2 / AC-3 (PO-D5): 24 hours to 4 weeks from the proposal time; the original lesson date does not extend the window', async () => {
    const f = await family();
    const o = await confirmed(f, at(20 * DAY)); // original 3+ weeks ahead: O + 4 weeks would allow far later dates
    const now = Date.now();
    const grid = (ms: number, up: boolean) => new Date((up ? Math.ceil : Math.floor)(ms / (5 * MIN)) * 5 * MIN);
    await expect(change(f, o, grid(now + 24 * HOUR - 10 * MIN, false))).rejects.toThrow(/24 hours/);
    const near = await change(f, o, grid(now + 24 * HOUR + 10 * MIN, true));
    await sql`UPDATE lessons SET status = 'withdrawn', closed_by = 'teacher', closed_by_account = ${f.teacher} WHERE id = ${near.id}`;
    const far = await change(f, o, grid(now + 28 * DAY - 10 * MIN, false));
    await sql`UPDATE lessons SET status = 'withdrawn', closed_by = 'teacher', closed_by_account = ${f.teacher} WHERE id = ${far.id}`;
    await expect(change(f, o, grid(now + 28 * DAY + 10 * MIN, true))).rejects.toThrow(/4 weeks/);
  });

  it('AC-5: a change past its reply deadline cannot be accepted', async () => {
    const f = await family();
    const o = await confirmed(f, at(0));
    const r = await change(f, o, at(DAY));
    await sql.begin(async (t) => {
      await t.unsafe(`SET LOCAL session_replication_role = replica`);
      await t`UPDATE lessons SET requested_at = now() - interval '50 hours', reply_deadline = now() - interval '3 hours' WHERE id = ${r.id}`;
    });
    await expect(sql.begin((t) => accept(t, f, o, r.id))).rejects.toThrow();
    expect((await status(o)).status).toBe('confirmed');
  });
});

describe('Q-A / Q-B: the move carries requests by logical identity and chapter identity', () => {
  it('AC-21 / AC-15: originals close carried_forward; copies keep the logical id; one mapping row each; one open row per logical id', async () => {
    const f = await family();
    const ch = await book(f, ['Fractions', 'Decimals']);
    const o = await confirmed(f, at(0), ch);
    const a = await ask(f, o, 1);
    const b = await ask(f, o, 'A ruler (sample)');
    const r = await change(f, o, at(DAY));
    await sql.begin((t) => accept(t, f, o, r.id));
    const before = await reqs(o);
    expect(before.map((x) => [x.id, x.status, x.close_reason])).toEqual(
      expect.arrayContaining([
        [a, 'no_longer_needed', 'carried_forward'],
        [b, 'no_longer_needed', 'carried_forward'],
      ]),
    );
    const after = await reqs(r.id);
    expect(after.map((x) => x.logical_request_id).sort()).toEqual([a, b].sort());
    expect(after.every((x) => x.status === 'open' && x.id !== x.logical_request_id)).toBe(true);
    const maps = await sql<{ kind: string; original_position: number | null; replacement_position: number | null }[]>`
      SELECT kind, original_position, replacement_position FROM lesson_reschedule_requests x
      JOIN lesson_reschedules r ON r.id = x.reschedule_id WHERE r.original_lesson_id = ${o} ORDER BY kind`;
    expect(maps).toEqual([
      { kind: 'description', original_position: null, replacement_position: null },
      { kind: 'same_position', original_position: 1, replacement_position: 1 },
    ]);
  });

  it('AC-12 (M3): with its own chapters, a request moves to the position of the same book chapter', async () => {
    const f = await family();
    const ch = await book(f, ['Fractions', 'Decimals', 'Shapes']);
    const o = await confirmed(f, at(0), [ch[0]!, ch[1]!]); // Decimals at position 2
    await ask(f, o, 2);
    const r = await change(f, o, at(DAY), [ch[1]!, ch[2]!]); // Decimals now at position 1
    await sql.begin((t) => accept(t, f, o, r.id));
    expect((await reqs(r.id)).map((x) => x.lesson_position)).toEqual([1]);
    const [m] = await sql<
      { kind: string }[]
    >`SELECT kind FROM lesson_reschedule_requests x JOIN lesson_reschedules r ON r.id = x.reschedule_id WHERE r.original_lesson_id = ${o}`;
    expect(m!.kind).toBe('remapped_position');
  });

  it('AC-13 (M4): a request about a chapter not on the new lesson refuses the move; nothing changes (AC-6/7)', async () => {
    const f = await family();
    const ch = await book(f, ['Fractions', 'Decimals', 'Shapes']);
    const o = await confirmed(f, at(0), [ch[0]!]);
    await ask(f, o, 1);
    const r = await change(f, o, at(DAY), [ch[2]!]);
    const snap = await snapshot(o);
    await expect(sql.begin((t) => accept(t, f, o, r.id))).rejects.toThrow(/material_request_unmappable/);
    expect(await snapshot(o)).toEqual(snap);
    expect((await status(r.id)).status).toBe('proposed');
  });

  it('AC-14 / AC-13 (M5, M6): topics map only when exactly equal', async () => {
    const f = await family();
    const o1 = await confirmedTopic(f, at(0), 'Long division (sample)');
    await ask(f, o1, 1);
    const r1 = await topicChange(f, o1, at(DAY), 'Long division (sample)');
    await sql.begin((t) => accept(t, f, o1, r1));
    expect((await reqs(r1)).map((x) => x.lesson_position)).toEqual([1]);

    const o2 = await confirmedTopic(f, at(2 * DAY), 'Long division (sample)');
    await ask(f, o2, 1);
    const r2 = await topicChange(f, o2, at(3 * DAY), 'Long  division (sample)'); // differs inside the text
    const snap = await snapshot(o2);
    await expect(sql.begin((t) => accept(t, f, o2, r2))).rejects.toThrow(/material_request_unmappable/);
    expect(await snapshot(o2)).toEqual(snap);
  });

  it('AC-16: look-alike requests (same chapter, same text) are distinct logical requests and are both carried', async () => {
    const f = await family();
    const ch = await book(f, ['Fractions']);
    const o = await confirmed(f, at(0), [ch[0]!]);
    const a = await ask(f, o, 1);
    const b = await ask(f, o, 1);
    const c = await ask(f, o, 'Squared paper (sample)');
    const d = await ask(f, o, 'Squared paper (sample)');
    const r = await change(f, o, at(DAY));
    await sql.begin((t) => accept(t, f, o, r.id));
    expect((await reqs(r.id)).map((x) => x.logical_request_id).sort()).toEqual([a, b, c, d].sort());
  });

  it('AC-15: identity rules: no foreign logical id outside a move; never changed; at most one open row per logical id', async () => {
    const f = await family();
    const o = await confirmed(f, at(0));
    const a = await ask(f, o, 'Item (sample)');
    const o2 = await confirmed(f, at(DAY));
    await expect(sql`INSERT INTO material_requests (lesson_id, raised_by, description, logical_request_id)
                     VALUES (${o2}, ${f.teacher}, 'Copy (sample)', ${a})`).rejects.toThrow(/keeps another request/);
    await expect(
      sql`UPDATE material_requests SET logical_request_id = gen_random_uuid() WHERE id = ${a}`,
    ).rejects.toThrow(/cannot change/);
    await expect(
      sql`UPDATE material_requests SET status = 'no_longer_needed', closed_by = 'aa_pro', close_reason = 'carried_forward' WHERE id = ${a}`,
    ).rejects.toThrow();
    const idx = await sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'material_requests_one_open_logical'`;
    expect(String(idx[0]!.indexdef)).toMatch(/UNIQUE.*\(logical_request_id\) WHERE \(status = 'open'::text\)/);
  });

  it('AC-23: a lesson moved twice keeps each request’s logical id; two mapping rows; history on each predecessor', async () => {
    const f = await family();
    const o = await confirmed(f, at(0));
    const a = await ask(f, o, 'Compass (sample)');
    const r1 = await change(f, o, at(DAY));
    await sql.begin((t) => accept(t, f, o, r1.id));
    const r2 = await change(f, r1.id, at(2 * DAY));
    await sql.begin((t) => accept(t, f, r1.id, r2.id));
    expect((await reqs(r2.id)).map((x) => [x.logical_request_id, x.status])).toEqual([[a, 'open']]);
    expect((await reqs(o))[0]!.close_reason).toBe('carried_forward');
    expect((await reqs(r1.id))[0]!.close_reason).toBe('carried_forward');
    const n = (
      await sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM lesson_reschedule_requests WHERE logical_request_id = ${a}`
    )[0]!.n;
    expect(n).toBe(2);
  });

  it('AC-18: at most five open requests on the new lesson (its own plus carried): 3 + 2 allowed, 4 + 2 refused', async () => {
    const f = await family();
    const run = async (own: number, carried: number, day: number) => {
      const o = await confirmed(f, at(day * DAY));
      for (let i = 0; i < carried; i++) await ask(f, o, `Carried ${i} (sample)`);
      const r = await change(f, o, at((day + 1) * DAY));
      for (let i = 0; i < own; i++) await ask(f, r.id, `Own ${i} (sample)`);
      return { o, r };
    };
    const ok = await run(3, 2, 0);
    await sql.begin((t) => accept(t, f, ok.o, ok.r.id));
    expect((await reqs(ok.r.id)).filter((x) => x.status === 'open')).toHaveLength(5);
    const no = await run(4, 2, 4);
    const snap = await snapshot(no.o);
    await expect(sql.begin((t) => accept(t, f, no.o, no.r.id))).rejects.toThrow(/material_request_limit/);
    expect(await snapshot(no.o)).toEqual(snap);
  });
});

describe('Q-A per-parent rule (PO-D6 to PO-D8, C-2 to C-4)', () => {
  it('AC-19a (PO-D6): ordinary TL-2 creation is not capped per parent', async () => {
    const f = await family();
    for (let d = 0; d < 2; d++) {
      const l = await confirmed(f, at(d * DAY));
      for (let i = 0; i < 4; i++) await ask(f, l, `Item ${d}-${i} (sample)`);
    }
    expect(await parentCount(f.parent)).toBe(8);
  });

  it('AC-19b/c (PO-D7, C-2): each active parent counts open requests on live lessons of all their children; revoked links and inactive parents are ignored', async () => {
    const f = await family();
    const second = await createAdult(sql, 'parent');
    await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${second}, ${f.child})`;
    const sibling = await createChild(sql, f.parent);
    const sLink = await activeLink(sql, { teacher: f.teacher, child: sibling, parent: f.parent, subjects: ['maths'] });
    const fs = { ...f, child: sibling, link: sLink };
    const l1 = await confirmed(f, at(0));
    await ask(f, l1, 'Child one (sample)');
    const l2 = await confirmed(fs, at(DAY));
    await ask(fs, l2, 'Sibling a (sample)');
    await ask(fs, l2, 'Sibling b (sample)');
    expect(await parentCount(f.parent)).toBe(3); // both children
    expect(await parentCount(second)).toBe(1); // only the shared child
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE parent_id = ${second}`;
    expect(await parentCount(second)).toBe(0);
  });

  it('AC-19d/g (PO-D8): a normal move never changes any parent count; a grandfathered parent (9 open) may still move; nothing is closed to reach 5', async () => {
    const f = await family();
    const lessons: string[] = [];
    for (let d = 0; d < 3; d++) {
      const l = await confirmed(f, at(d * DAY));
      lessons.push(l);
      for (let i = 0; i < 3; i++) await ask(f, l, `Item ${d}-${i} (sample)`);
    }
    expect(await parentCount(f.parent)).toBe(9);
    const r = await change(f, lessons[0]!, at(10 * DAY));
    await sql.begin((t) => accept(t, f, lessons[0]!, r.id));
    expect(await parentCount(f.parent)).toBe(9);
  });

  it('AC-19e/f (PO-D8 refusals, by fault injection on the rule itself): after <= max(5, before)', async () => {
    const f = await family();
    const l = await confirmed(f, at(0));
    const check = (delta: number) => sql.begin((t) => t`SELECT tl4_parent_rule_check(${f.child}, ${delta})`);
    for (let i = 0; i < 3; i++) await ask(f, l, `Item ${i} (sample)`);
    await expect(check(1)).resolves.toBeDefined(); // 3 -> 4 allowed
    await expect(check(2)).resolves.toBeDefined(); // 3 -> 5 allowed
    await expect(check(3)).rejects.toThrow(/material_request_parent_limit.*before 3, after 6/); // 3 -> 6 refused
    for (let i = 3; i < 5; i++) await ask(f, l, `Item ${i} (sample)`);
    await expect(check(0)).resolves.toBeDefined(); // 5 -> 5
    await expect(check(1)).rejects.toThrow(/before 5, after 6/); // 5 -> 6
    const l2 = await confirmed(f, at(DAY));
    for (let i = 0; i < 2; i++) await ask(f, l2, `More ${i} (sample)`);
    await expect(check(0)).resolves.toBeDefined(); // 7 -> 7
    await expect(check(-1)).resolves.toBeDefined(); // 7 -> 6
    await expect(check(1)).rejects.toThrow(/before 7, after 8/); // 7 -> 8
  });

  it('AC-19h (PO-D7, C-4): two moves sharing a parent serialise on the parent lock; a TL-2 insert meanwhile is not blocked', async () => {
    const f = await family();
    const sibling = await createChild(sql, f.parent);
    const sLink = await activeLink(sql, { teacher: f.teacher, child: sibling, parent: f.parent, subjects: ['maths'] });
    const fs = { ...f, child: sibling, link: sLink };
    const o1 = await confirmed(f, at(0));
    const o2 = await confirmed(fs, at(DAY));
    const r1 = await change(f, o1, at(5 * DAY));
    const r2 = await change(fs, o2, at(6 * DAY));
    const other = await confirmed(fs, at(9 * DAY));
    const a = await sql.reserve();
    const b = await sql.reserve();
    const pidB = (await b<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid;
    const pidA = (await a<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid;
    try {
      await a`BEGIN`;
      await accept(a as unknown as Q, f, o1, r1.id); // holds the shared parent's lock
      await b`BEGIN`;
      const pending = accept(b as unknown as Q, fs, o2, r2.id);
      await expect
        .poll(
          async () => {
            const [r] = await mon<{ w: string | null; bl: number[] }[]>`
            SELECT wait_event_type AS w, pg_blocking_pids(pid) AS bl FROM pg_stat_activity WHERE pid = ${pidB}`;
            return r?.w === 'Lock' && r.bl.includes(pidA);
          },
          { timeout: 10_000, interval: 50 },
        )
        .toBe(true);
      await ask(fs, other, 'Ordinary TL-2 request (sample)'); // not blocked by the parent lock
      await a`COMMIT`;
      await pending;
      await b`COMMIT`;
    } finally {
      a.release();
      b.release();
    }
    expect((await status(r1.id)).status).toBe('confirmed');
    expect((await status(r2.id)).status).toBe('confirmed');
  });
});

describe('Audit table and integrity (AC-22, AC-26, AC-27)', () => {
  it('AC-22: mapping rows cannot be written, changed or removed outside a move', async () => {
    const f = await family();
    const o = await confirmed(f, at(0));
    await ask(f, o, 'Item (sample)');
    const r = await change(f, o, at(DAY));
    await sql.begin((t) => accept(t, f, o, r.id));
    const [m] = await sql<
      {
        id: string;
        reschedule_id: string;
        original_request_id: string;
        replacement_request_id: string;
        logical_request_id: string;
      }[]
    >`
      SELECT x.* FROM lesson_reschedule_requests x JOIN lesson_reschedules s ON s.id = x.reschedule_id WHERE s.original_lesson_id = ${o}`;
    await expect(sql`UPDATE lesson_reschedule_requests SET kind = 'description' WHERE id = ${m!.id}`).rejects.toThrow(
      /cannot change/,
    );
    await expect(sql`DELETE FROM lesson_reschedule_requests WHERE id = ${m!.id}`).rejects.toThrow(/cannot be removed/);
    await expect(sql`INSERT INTO lesson_reschedule_requests (reschedule_id, logical_request_id, original_request_id, replacement_request_id, kind)
                     VALUES (${m!.reschedule_id}, ${m!.logical_request_id}, ${m!.replacement_request_id}, ${m!.original_request_id}, 'description')`).rejects.toThrow();
  });

  it('AC-26: the rollback refuses once any lesson has moved, changing nothing, even under plain psql -f (single DO block)', async () => {
    const before = await sql`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE '%tl4%'`;
    let rc = 0;
    try {
      execFileSync('psql', ['-X', '-q', '-d', url, '-f', new URL(ROLLBACK).pathname], { stdio: 'pipe' });
    } catch (e) {
      rc = (e as { status: number }).status;
    }
    expect(rc).toBe(0); // plain psql exits 0 after an error...
    expect(await sql`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE '%tl4%'`).toEqual(before); // ...but nothing was removed
    expect((await sql`SELECT to_regclass('public.lesson_reschedule_requests') AS t`)[0]!.t).not.toBeNull();
  });

  it('AC-26: with no moves, the rollback (plain psql -f) restores the schema exactly to main, and the draft applies again', async () => {
    const n2 = `tl4rb_${uniq()}`;
    await admin.unsafe(`CREATE DATABASE ${n2}`);
    const u = new URL(url);
    u.pathname = `/${n2}`;
    const s2 = postgres(u.toString(), { max: 1, onnotice: () => {} });
    const catalog = async () =>
      (
        await s2.unsafe(`
          SELECT 'c:' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable FROM information_schema.columns WHERE table_schema = 'public'
          UNION ALL SELECT 'k:' || conrelid::regclass || '.' || conname || ':' || pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace = 'public'::regnamespace
          UNION ALL SELECT 'i:' || indexname || ':' || indexdef FROM pg_indexes WHERE schemaname = 'public'
          UNION ALL SELECT 't:' || tgrelid::regclass || '.' || tgname || ':' || pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal
          UNION ALL SELECT 'f:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
          ORDER BY 1`)
      ).map((r) => Object.values(r)[0] as string);
    try {
      await migrate(s2);
      const base = await catalog();
      await s2.unsafe(await readFile(DRAFT, 'utf8'));
      expect((await catalog()).length).toBeGreaterThan(base.length);
      execFileSync(
        'psql',
        ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', u.toString(), '-f', new URL(ROLLBACK).pathname],
        { stdio: 'pipe' },
      );
      expect(await catalog()).toEqual(base);
      await s2.unsafe(await readFile(DRAFT, 'utf8'));
    } finally {
      await s2.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${n2} WITH (FORCE)`);
    }
  });

  it('AC-27: migration 0033 is untouched (file checksum equals the approved, applied value)', async () => {
    const APPROVED_0033 = '3be71d017ad63c4db5ae97a3c003fb71a6ea8431e6d596923789fa27c0fbded9'; // pragma: allowlist secret (public SHA-256 of migration 0033)
    const text = await readFile(new URL('../../db/migrations/0033_material_requests.sql', import.meta.url));
    expect(createHash('sha256').update(text).digest('hex')).toBe(APPROVED_0033);
    const [row] = await sql<
      { checksum: string }[]
    >`SELECT checksum FROM schema_migrations WHERE name = '0033_material_requests.sql'`;
    expect(row!.checksum).toBe(APPROVED_0033);
  });
});
