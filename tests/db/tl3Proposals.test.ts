import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-3 (0034, text for review): the database rules for teacher proposals, with the owner's TL-3
 * decisions of 29 Oct 2026 (D-TLS-1/2/3/5/12/13, D-E2E-2/3/4, TL3-1 to TL3-6 = Option D).
 * Synthetic data only, on the throw-away database made by global-setup. Every rule is checked from
 * the database side, whatever the server code sends. Fixtures that must lie in the past (an overdue
 * proposal, a confirmed lesson to clash with) are inserted with `SET LOCAL session_replication_role
 * = replica` for that one transaction only (CHECK, UNIQUE and EXCLUDE rules still apply).
 * Positive (P), negative (N), boundary (B) and concurrency (C) cases are marked in the test names.
 */
type Db = postgres.Sql<Record<string, unknown>>;
const sql = testDb();
afterAll(() => sql.end());

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Three days ahead, 10:00 UTC. */
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR);
const at = (offsetMin: number) => new Date(BASE.getTime() + offsetMin * MIN);
const floor5 = (ms: number) => new Date(Math.floor(ms / (5 * MIN)) * 5 * MIN);
const ceil5 = (ms: number) => new Date(Math.ceil(ms / (5 * MIN)) * 5 * MIN);
const dbNow = async () => (await sql<{ t: Date }[]>`SELECT now() AS t`)[0]!.t.getTime();

/** An approved, active teacher, UTC, usual times 16:00-17:00 only, listed at INR 600 an hour. */
async function teacher(opts: { rate?: boolean; approval?: string } = {}) {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC' WHERE id = ${id}`;
  const approval = opts.approval ?? 'approved';
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at, submitted_at)
            VALUES (${id}, 'self_registered', ${approval}, ${['maths', 'science']}, ${[4, 5]},
                    ${approval === 'approved' ? owner : null}, ${approval === 'approved' ? new Date() : null}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, 960, 1020)`;
  if (opts.rate !== false)
    await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
              VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', 60000, 30)`;
  return id;
}

/** Two parents of one child, linked to a teacher in maths. */
async function family(t?: string) {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher());
  const link = await activeLink(sql, { teacher: tid, child, parent, subjects: ['maths'] });
  return { parent, parent2, child, t: tid, link };
}
type Fam = Awaited<ReturnType<typeof family>>;

/** A proposal as the server would send it (the teacher from the session). */
async function propose(
  db: Db,
  f: { t: string; child: string },
  start: Date,
  o: { minutes?: number; subject?: string; by?: string | null; requestedBy?: string | null } = {},
) {
  const [r] = await db<{ id: string }[]>`
    INSERT INTO lessons (teacher_id, student_id, proposed_by, requested_by, subject, starts_at, minutes, status)
    VALUES (${f.t}, ${f.child}, ${o.by === undefined ? f.t : o.by}, ${o.requestedBy ?? null}, ${o.subject ?? 'maths'},
            ${start}, ${o.minutes ?? 30}, 'proposed')
    RETURNING id`;
  return r!.id;
}
/** A parent's request (0029 path), inside the usual times 16:00-17:00 UTC. */
async function request(db: Db, f: Fam, start: Date, parent = f.parent) {
  const [r] = await db<{ id: string }[]>`
    INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes)
    VALUES (${f.t}, ${f.child}, ${parent}, 'maths', ${start}, 30) RETURNING id`;
  return r!.id;
}
/** A fixture row with triggers skipped for this one transaction. */
async function raw(f: {
  t: string;
  child: string;
  start: Date;
  requestedAt: Date;
  status: 'proposed' | 'confirmed';
  parent?: string;
}) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const proposal = f.status === 'proposed';
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, proposed_by, origin, subject, starts_at, minutes, ends_at,
                           requested_at, reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${proposal ? null : (f.parent ?? null)}, ${proposal ? f.t : null},
             ${proposal ? 'teacher_proposal' : 'parent_request'}, 'maths', s, 30, s + interval '30 minutes', q,
             LEAST(q + interval '48 hours', s - interval '2 hours'), ${f.status},
             CASE WHEN ${f.status} = 'confirmed' THEN q + interval '1 minute' END, 'INR', 60000, 30000, 'listed'
      FROM (SELECT ${f.start}::timestamptz AS s, ${f.requestedAt}::timestamptz AS q) x RETURNING id`;
    return r!.id;
  });
}
const row = async (id: string) =>
  (await sql<Record<string, unknown>[]>`SELECT * FROM lessons WHERE id = ${id}`)[0] as Record<string, unknown>;
const status = async (id: string) => (await row(id)).status as string;
const accept = (id: string, parent: string, db: Db = sql) =>
  db`UPDATE lessons SET status = 'confirmed', confirmed_by = ${parent} WHERE id = ${id} AND status = 'proposed'`;
const outcome = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return `${(e as { code?: string }).code}: ${(e as Error).message}`;
  }
};
const code = async (p: Promise<unknown>) => (await outcome(p)).split(':')[0]!;

/** A published book of chapters, owned by `owner`, assigned to `child` (or not). */
async function book(owner: string, child: string | null) {
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${owner}, 'Maths book', 'maths', 'chapter_files', 'published')
    RETURNING id`;
  const chapters: string[] = [];
  for (const [i, title] of ['Fractions', 'Decimals', 'Shapes', 'Time', 'Money', 'Data'].entries()) {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${title}) RETURNING id`;
    chapters.push(c!.id);
  }
  if (child) await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child})`;
  return { id: b!.id, chapters };
}

// ---------------------------------------------------------------------------------------------
describe('TL-3 the request path is unchanged (function bodies)', () => {
  const bodyOf = (text: string, fn: string) => {
    const i = text.indexOf(`FUNCTION ${fn}()`);
    const a = text.indexOf('$$', i) + 2;
    return text.slice(a, text.indexOf('$$', a));
  };
  const file = (name: string) => readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8');
  const live = async (fn: string) =>
    (await sql<{ src: string }[]>`SELECT prosrc AS src FROM pg_proc WHERE proname = ${fn}`)[0]!.src;

  it('lessons_before_insert and lessons_before_update keep 0029’s text byte for byte, as the inner block', async () => {
    const m29 = await file('0029_lessons.sql');
    for (const fn of ['lessons_before_insert', 'lessons_before_update']) {
      const original = bodyOf(m29, fn);
      const now = await live(fn);
      expect(now.split(original)).toHaveLength(2); // present exactly once
      expect(now.endsWith(`${original};\nEND `)).toBe(true); // and it is the last thing that runs
    }
  });

  it('lesson_chapters_before_write keeps 0032’s text byte for byte; material_requests_before_write has exactly three edits', async () => {
    const original32 = bodyOf(await file('0032_lesson_chapters.sql'), 'lesson_chapters_before_write');
    expect((await live('lesson_chapters_before_write')).endsWith(`${original32};\nEND `)).toBe(true);
    const original33 = bodyOf(await file('0033_material_requests.sql'), 'material_requests_before_write');
    const now33 = await live('material_requests_before_write');
    expect(now33).not.toBe(original33);
    expect(now33.replaceAll("'requested', 'proposed', 'confirmed'", "'requested', 'confirmed'")).toBe(original33);
    expect(now33.split("'requested', 'proposed', 'confirmed'")).toHaveLength(4);
  });

  it('no trigger was added or removed on lessons; 0030 and 0031 functions are untouched', async () => {
    const triggers = (
      await sql<{ t: string }[]>`
        SELECT tgname AS t FROM pg_trigger WHERE tgrelid = 'lessons'::regclass AND NOT tgisinternal ORDER BY 1`
    ).map((r) => r.t);
    expect(triggers).toEqual([
      'lessons_before_insert',
      'lessons_before_update',
      'lessons_close_material_requests',
      'lessons_drop_link_on_cancel',
    ]);
    const m31 = await file('0031_kept_lessons.sql');
    expect(await live('lesson_meeting_links_before_write')).toBe(bodyOf(m31, 'lesson_meeting_links_before_write'));
  });

  it('(P) existing rows: every lesson made before 0034 reads as a parent request, with nothing else changed', async () => {
    const f = await family();
    const id = await request(sql, f, at(6 * 60)); // 16:00 UTC, inside the usual times
    expect(await row(id)).toMatchObject({ origin: 'parent_request', proposed_by: null, confirmed_by: null });
    // A request still needs the usual times (0029), unlike a proposal.
    expect(await outcome(request(sql, f, at(0)))).toMatch(/usual times/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-3 creating a proposal (D-TLS-2, D-TLS-3, D-TLS-12)', () => {
  it('(P) the linked teacher proposes outside the usual times, on a 5-minute step; the database fills in the rest', async () => {
    const f = await family();
    const id = await propose(sql, f, at(5), { minutes: 25 }); // 10:05 UTC: not a usual time
    const r = await row(id);
    expect(r).toMatchObject({
      status: 'proposed',
      origin: 'teacher_proposal',
      proposed_by: f.t,
      requested_by: null,
      confirmed_by: null,
      currency: 'INR',
      rate_minor: '60000',
      price_basis: 'listed',
      price_minor: String(Math.floor((60000 * 25 * 2 + 60) / 120)), // same as a request (D-TLS-12)
    });
    const [d] = await sql<{ ok: boolean }[]>`
      SELECT reply_deadline = LEAST(requested_at + interval '48 hours', starts_at - interval '2 hours')
             AND requested_at = now() IS NOT NULL AS ok FROM lessons WHERE id = ${id}`;
    expect(d!.ok).toBe(true);
  });

  it('(N) only the lesson’s own teacher proposes; a parent or a forged teacher is refused', async () => {
    const f = await family();
    const other = await teacher();
    expect(await code(propose(sql, f, at(0), { by: other }))).toBe('42501');
    expect(await code(propose(sql, f, at(0), { by: null }))).toBe('42501');
    expect(await code(propose(sql, f, at(0), { requestedBy: f.parent }))).toBe('42501');
  });

  it('(N) unlinked, unticked subject, not approved, deactivated teacher, or inactive child: refused', async () => {
    const f = await family();
    const stranger = { t: await teacher(), child: f.child };
    expect(await outcome(propose(sql, stranger, at(0)))).toMatch(/linked to the child in this subject/);
    expect(await outcome(propose(sql, f, at(0), { subject: 'science' }))).toMatch(/linked to the child/);
    const pending = await family();
    await sql`UPDATE teacher_profiles SET approval_status = 'changes_requested' WHERE account_id = ${pending.t}`;
    expect(await code(propose(sql, pending, at(0)))).toBe('42501');
    const g = await family();
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${g.t}`;
    expect(await code(propose(sql, g, at(0)))).toBe('42501');
    const h = await family();
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${h.child}`;
    expect(await outcome(propose(sql, h, at(0)))).toMatch(/active child/);
  });

  it('(B) 24 hours to 4 weeks ahead: the first 5-minute step after 24 h and the last before 4 weeks are accepted', async () => {
    const f = await family();
    const now = await dbNow();
    expect(await outcome(propose(sql, f, floor5(now + DAY)))).toMatch(/24 hours ahead/);
    await propose(sql, f, ceil5(now + DAY + MIN));
    const last = floor5(now + 28 * DAY);
    await propose(sql, f, last);
    expect(await outcome(propose(sql, f, new Date(last.getTime() + 5 * MIN)))).toMatch(/4 weeks/);
  });

  it('(B) any 5-minute start; 10-40 minutes in 5-minute steps', async () => {
    const f = await family();
    await propose(sql, f, at(5));
    await propose(sql, f, at(55), { minutes: 10 });
    await propose(sql, f, at(120), { minutes: 40 });
    expect(await outcome(propose(sql, f, at(187)))).toMatch(/5-minute step/);
    for (const m of [9, 12, 45]) expect(await code(propose(sql, f, at(300), { minutes: m }))).toBe('23514');
  });

  it('(N) never over a confirmed lesson of the teacher, or of the child with another teacher; back to back is fine', async () => {
    const f = await family();
    await raw({ ...f, start: at(60), requestedAt: new Date(Date.now() - HOUR), status: 'confirmed', parent: f.parent });
    expect(await outcome(propose(sql, f, at(75)))).toMatch(/overlaps a confirmed lesson/);
    await propose(sql, f, at(90)); // starts as the other ends
    await propose(sql, f, at(30)); // ends as the other starts
    const other = await family(); // the same child with another teacher
    await activeLink(sql, { teacher: other.t, child: f.child, parent: f.parent, subjects: ['maths'] });
    expect(await outcome(propose(sql, { t: other.t, child: f.child }, at(70)))).toMatch(/overlaps a confirmed lesson/);
  });

  it('(N) a teacher without an hourly price cannot propose (D-TLS-12)', async () => {
    const f = await family(await teacher({ rate: false }));
    expect(await outcome(propose(sql, f, at(0)))).toMatch(/no hourly rate/);
  });

  it('(N) a proposal never starts confirmed, and a request can never be made to look like a proposal', async () => {
    const f = await family();
    const forged = sql`INSERT INTO lessons (teacher_id, student_id, proposed_by, subject, starts_at, minutes, status, origin)
                       VALUES (${f.t}, ${f.child}, ${f.t}, 'maths', ${at(0)}, 30, 'confirmed', 'teacher_proposal')`;
    expect(await code(forged)).toBe('23514');
    const asRequest = sql`INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, origin)
                          VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${at(360)}, 30, 'teacher_proposal')`;
    expect(await code(asRequest)).toBe('23514');
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-3 limits and expiry (D-TLS-5)', () => {
  it('(B) at most 10 open proposals per teacher and child; another child of the same teacher is not affected', async () => {
    const f = await family();
    for (let i = 0; i < 10; i++) await propose(sql, f, at(i * 60));
    expect(await outcome(propose(sql, f, at(600)))).toMatch(/at most 10 open lesson proposals/);
    const g = await family(f.t);
    await propose(sql, g, at(600));
  });

  it('(N) one open proposal per teacher, child and start time; a request at the same time is still possible (TL3-4)', async () => {
    const f = await family();
    await propose(sql, f, at(6 * 60));
    expect(await code(propose(sql, f, at(6 * 60)))).toBe('23505');
    await request(sql, f, at(6 * 60)); // a proposal holds no time
  });

  it('(P) an overdue proposal cannot be accepted and frees its slot at once', async () => {
    const f = await family();
    const old = await raw({ ...f, start: at(0), requestedAt: new Date(Date.now() - 3 * DAY), status: 'proposed' });
    expect(await code(accept(old, f.parent))).toBe('23514');
    const fresh = await propose(sql, f, at(0));
    expect(await row(old)).toMatchObject({ status: 'expired', closed_by: 'aa_pro' });
    expect(await status(fresh)).toBe('proposed');
  });

  it('(B) overdue proposals do not count towards the 10', async () => {
    const f = await family();
    const q = new Date(Date.now() - 3 * DAY);
    for (let i = 0; i < 3; i++) await raw({ ...f, start: at(2000 + i * 60), requestedAt: q, status: 'proposed' });
    for (let i = 0; i < 10; i++) await propose(sql, f, at(i * 60));
    expect(await outcome(propose(sql, f, at(600)))).toMatch(/at most 10/);
  });

  it('(P) the shared sweep expires overdue proposals and requests, once each', async () => {
    const f = await family();
    const q = new Date(Date.now() - 3 * DAY);
    const p = await raw({ ...f, start: at(0), requestedAt: q, status: 'proposed' });
    const open = await propose(sql, f, at(60));
    const first = (await sql<{ id: string }[]>`SELECT lessons_expire_overdue() AS id`).map((r) => r.id);
    expect(first).toContain(p);
    expect(await row(p)).toMatchObject({ status: 'expired', closed_by: 'aa_pro', closed_by_account: null });
    expect(await status(open)).toBe('proposed');
    expect((await sql<{ id: string }[]>`SELECT lessons_expire_overdue() AS id`).map((r) => r.id)).not.toContain(p);
  });

  it('(C) two proposals for the same slot sent at once (double click): exactly one is created', async () => {
    const f = await family();
    const [x, y] = [testDb(), testDb()];
    const results = await Promise.all([x, y].map((db) => code(propose(db, f, at(0)))));
    await Promise.all([x.end(), y.end()]);
    expect(results.sort()).toEqual(['23505', 'ok']);
  });

  it('(C) the 10th and 11th sent at once from two connections: exactly one more is created', async () => {
    const f = await family();
    for (let i = 0; i < 9; i++) await propose(sql, f, at(i * 60));
    const [x, y] = [testDb(), testDb()];
    const results = await Promise.all([
      code(
        x.begin(async (tx) => {
          await propose(tx as unknown as Db, f, at(600));
          await tx`SELECT pg_sleep(0.3)`;
        }),
      ),
      (async () => {
        await new Promise((r) => setTimeout(r, 100));
        return code(propose(y, f, at(660)));
      })(),
    ]);
    await Promise.all([x.end(), y.end()]);
    expect(results.sort()).toEqual(['23514', 'ok']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-3 answering a proposal (D-TLS-2, TL3-4, TL3-5)', () => {
  it('(P) either parent accepts before the deadline; who accepted is recorded; it is then an ordinary confirmed lesson', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    await accept(id, f.parent2);
    const r = await row(id);
    expect(r).toMatchObject({
      status: 'confirmed',
      confirmed_by: f.parent2,
      origin: 'teacher_proposal',
      proposed_by: f.t,
    });
    // Ordinary rules from here: the parent cancels (more than 30 minutes ahead), reason-free.
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${id}`;
    expect(await row(id)).toMatchObject({ status: 'cancelled', closed_by: 'parent', confirmed_by: f.parent2 });
  });

  it('(N) the teacher, a student, another family’s parent, or nobody cannot accept', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    const stranger = await createAdult(sql, 'parent');
    for (const who of [f.t, f.child, stranger]) expect(await code(accept(id, who))).toBe('42501');
    expect(await code(sql`UPDATE lessons SET status = 'confirmed' WHERE id = ${id}`)).toBe('42501');
    expect(await status(id)).toBe('proposed');
  });

  it('(P) a parent declines with an optional reason (trimmed); the teacher can’t decline; nothing else changes', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    expect(
      await code(
        sql`UPDATE lessons SET status = 'declined', closed_by = 'teacher', closed_by_account = ${f.t} WHERE id = ${id}`,
      ),
    ).toBe('23514');
    await sql`UPDATE lessons SET status = 'declined', closed_by = 'parent', closed_by_account = ${f.parent},
                close_note = ${'  Not that day, thank you  '} WHERE id = ${id}`;
    expect(await row(id)).toMatchObject({
      status: 'declined',
      closed_by: 'parent',
      close_note: 'Not that day, thank you',
    });
    expect(await code(accept(id, f.parent))).toBe('ok'); // guarded update: no row changes
    expect(await status(id)).toBe('declined');
  });

  it('(P/N) only the proposing teacher withdraws; a parent can’t withdraw a proposal', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    const other = await teacher();
    const w = (by: string, who: string) =>
      sql`UPDATE lessons SET status = 'withdrawn', closed_by = ${by}, closed_by_account = ${who} WHERE id = ${id}`;
    expect(await code(w('parent', f.parent))).toBe('23514');
    expect(await code(w('teacher', other))).toBe('42501');
    await w('teacher', f.t);
    expect(await row(id)).toMatchObject({ status: 'withdrawn', closed_by: 'teacher', closed_by_account: f.t });
  });

  it('(N) a proposal can’t be cancelled, edited, re-priced or re-attributed; history can’t be blanked', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    expect(
      await code(
        sql`UPDATE lessons SET status = 'cancelled', closed_by = 'teacher', closed_by_account = ${f.t} WHERE id = ${id}`,
      ),
    ).toBe('23514');
    expect(await code(sql`UPDATE lessons SET starts_at = ${at(60)} WHERE id = ${id}`)).toBe('23514');
    expect(await code(sql`UPDATE lessons SET price_minor = 1 WHERE id = ${id}`)).toBe('23514');
    expect(await code(sql`UPDATE lessons SET origin = 'parent_request' WHERE id = ${id}`)).toBe('23514');
    expect(await code(sql`UPDATE lessons SET proposed_by = NULL WHERE id = ${id}`)).toBe('23514');
    expect(await code(sql`UPDATE lessons SET close_note = 'x' WHERE id = ${id}`)).toBe('23514');
    await accept(id, f.parent);
    expect(await code(sql`UPDATE lessons SET confirmed_by = ${f.parent2} WHERE id = ${id}`)).toBe('23514');
    expect(await code(sql`UPDATE lessons SET confirmed_by = NULL WHERE id = ${id}`)).toBe('23514');
  });

  it('(N) accepting re-checks the teacher’s link (D-TLS-13 at the database); AA Pro then closes it "link ended"', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE id = ${f.link}`;
    expect(await outcome(accept(id, f.parent))).toMatch(/linked to the child/);
    await sql`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'link_ended' WHERE id = ${id}`;
    expect(await row(id)).toMatchObject({ status: 'declined', closed_by: 'aa_pro', close_reason: 'link_ended' });
  });

  it('(N) AA Pro can’t expire a proposal before its deadline', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    expect(await code(sql`UPDATE lessons SET status = 'expired', closed_by = 'aa_pro' WHERE id = ${id}`)).toBe('23514');
  });

  it('(C) TL3-4: the first accepted wins; an overlapping parent request then can’t be confirmed', async () => {
    const f = await family();
    const r = await request(sql, f, at(6 * 60)); // 16:00 UTC, inside the usual times
    const p = await propose(sql, f, at(6 * 60 + 15)); // 16:15 UTC, overlapping
    await accept(p, f.parent);
    expect(await code(sql`UPDATE lessons SET status = 'confirmed' WHERE id = ${r}`)).toBe('23P01');
  });

  it('(C) two parents accept at the same moment: exactly one change, and the second really waited', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    const [x, y] = [testDb(), testDb()];
    const firstHeld = x.begin(async (tx) => {
      const n = await accept(id, f.parent, tx as unknown as Db);
      await tx`SELECT pg_sleep(0.4)`;
      return n.count;
    });
    await new Promise((r) => setTimeout(r, 100));
    const second = (async () => (await accept(id, f.parent2, y)).count)();
    // Prove the second update is blocked by the first transaction's row lock.
    let waited = false;
    for (let i = 0; i < 20 && !waited; i++) {
      const [b] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0
          AND query LIKE '%confirmed_by%'`;
      waited = b!.n > 0;
      if (!waited) await new Promise((r) => setTimeout(r, 20));
    }
    const counts = await Promise.all([firstHeld, second]);
    await Promise.all([x.end(), y.end()]);
    expect(waited).toBe(true);
    expect(counts.sort()).toEqual([0, 1]);
    expect(await row(id)).toMatchObject({ status: 'confirmed', confirmed_by: f.parent });
  });

  it('(C) accept and withdraw at the same moment: exactly one outcome', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    const [x, y] = [testDb(), testDb()];
    const results = await Promise.all([
      x.begin(async (tx) => {
        const n = await accept(id, f.parent, tx as unknown as Db);
        await tx`SELECT pg_sleep(0.3)`;
        return n.count;
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 100));
        const n = await y`UPDATE lessons SET status = 'withdrawn', closed_by = 'teacher', closed_by_account = ${f.t}
                          WHERE id = ${id} AND status = 'proposed'`;
        return n.count;
      })(),
    ]);
    await Promise.all([x.end(), y.end()]);
    expect(results).toEqual([1, 0]);
    expect(await status(id)).toBe('confirmed');
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL-3 planned chapters (D-E2E-2, D-E2E-3 (b), TL3-2) and material requests (TL3-1)', () => {
  const plan = (db: Db, lesson: string, position: number, chapter: string | null, topic: string | null = null) =>
    db`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id, topic, source, label)
       VALUES (${lesson}, ${position}, ${chapter}, ${topic}, 'planned', 'Invented')`;

  it('(P) planned chapters come with the proposal, from books the teacher can view; labels written by the database', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await sql.begin(async (tx) => {
      const lesson = await propose(tx as unknown as Db, f, at(0));
      await plan(tx as unknown as Db, lesson, 1, b.chapters[0]!);
      await plan(tx as unknown as Db, lesson, 2, b.chapters[1]!);
      return lesson;
    });
    const rows =
      await sql`SELECT position, source, label FROM lesson_chapters WHERE lesson_id = ${id} ORDER BY position`;
    expect(rows).toEqual([
      { position: 1, source: 'planned', label: 'Maths book · 1. Fractions' },
      { position: 2, source: 'planned', label: 'Maths book · 2. Decimals' },
    ]);
  });

  it('(N) no free-text topic from a teacher; no chapter the teacher can’t view; not after the proposal; a parent can’t add to a proposal', async () => {
    const f = await family();
    const unshared = await book(f.parent, null);
    const b = await book(f.parent, f.child);
    let slot = 0;
    const inTx = (fn: (tx: Db, lesson: string) => Promise<unknown>) =>
      sql.begin(async (tx) => fn(tx as unknown as Db, await propose(tx as unknown as Db, f, at((slot += 60)))));
    expect(await outcome(inTx((tx, l) => plan(tx, l, 1, null, 'Fractions')))).toMatch(/not a free-text topic/);
    expect(await code(inTx((tx, l) => plan(tx, l, 1, unshared.chapters[0]!)))).toBe('42501');
    const later = await propose(sql, f, at(2000));
    expect(await outcome(plan(sql, later, 1, b.chapters[0]!))).toMatch(/only with the proposal/);
    const parentAdds = inTx(
      (tx, l) =>
        tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id) VALUES (${l}, 1, ${b.chapters[0]!})`,
    );
    expect(await outcome(parentAdds)).toMatch(/only together with the lesson request/);
  });

  it('(B) at most five chapters in total; a sixth is refused by the table', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const sixth = sql.begin(async (tx) => {
      const lesson = await propose(tx as unknown as Db, f, at(0));
      for (let i = 0; i < 5; i++) await plan(tx as unknown as Db, lesson, i + 1, b.chapters[i]!);
      await plan(tx as unknown as Db, lesson, 6, b.chapters[5]!);
    });
    expect(await code(sixth)).toBe('23514');
  });

  it('(P/N) D-E2E-3 (b): the teacher adds planned chapters when accepting a parent’s request, within five in total; not later', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const [r] = await sql.begin(async (tx) => {
      const id = await request(tx as unknown as Db, f, at(6 * 60));
      await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id) VALUES (${id}, 1, ${b.chapters[0]!})`;
      return [id];
    });
    await sql.begin(async (tx) => {
      await tx`UPDATE lessons SET status = 'confirmed' WHERE id = ${r!}`;
      await plan(tx as unknown as Db, r!, 2, b.chapters[1]!);
    });
    expect(
      (await sql`SELECT source FROM lesson_chapters WHERE lesson_id = ${r!} ORDER BY position`).map((x) => x.source),
    ).toEqual(['requested', 'planned']);
    expect(await outcome(plan(sql, r!, 3, b.chapters[2]!))).toMatch(/only with the proposal/);
  });

  it('(P) TL3-1: the teacher asks for material on a proposal; a parent may answer; it closes when the proposal is declined', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await propose(sql, f, at(0));
    const [m1] = await sql<{ id: string }[]>`
      INSERT INTO material_requests (lesson_id, raised_by, description) VALUES (${id}, ${f.t}, 'Your workbook') RETURNING id`;
    const [m2] = await sql<{ id: string }[]>`
      INSERT INTO material_requests (lesson_id, raised_by, description) VALUES (${id}, ${f.t}, 'The ruler page') RETURNING id`;
    await sql`UPDATE material_requests SET status = 'shared', closed_by = 'parent', closed_by_account = ${f.parent},
                shared_book_id = ${b.id} WHERE id = ${m1!.id}`;
    await sql`UPDATE lessons SET status = 'declined', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${id}`;
    const ms =
      await sql`SELECT id, status, close_reason FROM material_requests WHERE lesson_id = ${id} ORDER BY created_at, id`;
    expect(ms.find((m) => m.id === m1!.id)).toMatchObject({ status: 'shared' });
    expect(ms.find((m) => m.id === m2!.id)).toMatchObject({
      status: 'no_longer_needed',
      close_reason: 'lesson_closed',
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('TL3-6 Option D: no rollback for 0034, and the older rollbacks refuse once it is applied', () => {
  it('ships no db/rollback/0034 file', async () => {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(new URL('../../db/rollback/', import.meta.url));
    expect(files.filter((f) => f.startsWith('0034'))).toEqual([]);
  });

  it('(N) the 0033 and 0032 rollbacks refuse and change nothing while 0034 is applied', async () => {
    const snapshot = async () =>
      (
        await sql<{ h: string }[]>`
          SELECT md5(concat_ws('|',
            (SELECT count(*) FROM lessons), (SELECT count(*) FROM lesson_chapters), (SELECT count(*) FROM material_requests),
            (SELECT string_agg(proname, ',' ORDER BY proname) FROM pg_proc WHERE proname LIKE 'lesson%' OR proname LIKE 'material%'))) AS h`
      )[0]!.h;
    const before = await snapshot();
    for (const f of ['0033_revert_material_requests.sql', '0032_revert_lesson_chapters.sql']) {
      const text = await readFile(new URL(`../../db/rollback/${f}`, import.meta.url), 'utf8');
      expect(await outcome(sql.begin((tx) => tx.unsafe(text)))).toMatch(/TL-3 \(0034\) is applied/);
    }
    expect(await snapshot()).toBe(before);
  });
});
