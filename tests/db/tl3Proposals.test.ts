import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { activeLink, createAdult, createChild, migrationsBefore, testDb, uniq } from './helpers';

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
describe('TL-3 the database enforces the time, length, subject and price rules on its own (review finding 3)', () => {
  it('(N) a start with seconds or fractional seconds is refused, whatever the 5-minute step', async () => {
    const f = await family();
    for (const off of [1_000, 500, 30_000]) {
      const start = new Date(at(0).getTime() + off);
      expect(await code(propose(sql, f, start))).toBe('23514');
    }
    await propose(sql, f, at(0)); // the same minute without seconds is fine
  });

  it('(B) lengths: 10 and 40 accepted; 5, 9, 11, 42 and 45 refused; a caller-sent end is replaced', async () => {
    const f = await family();
    await propose(sql, f, at(0), { minutes: 10 });
    await propose(sql, f, at(60), { minutes: 40 });
    for (const [i, m] of [5, 9, 11, 42, 45].entries())
      expect(await code(propose(sql, f, at(120 + i * 60), { minutes: m }))).toBe('23514');
    const [r] = await sql<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, proposed_by, subject, starts_at, minutes, ends_at, status)
      VALUES (${f.t}, ${f.child}, ${f.t}, 'maths', ${at(600)}, 30, ${at(700)}, 'proposed') RETURNING id`;
    expect((await row(r!.id)).ends_at).toEqual(at(630));
  });

  it('(N) an unknown subject, and a subject the child is linked for with another teacher only, are refused', async () => {
    const f = await family();
    expect(await code(propose(sql, f, at(0), { subject: 'astrology' }))).not.toBe('ok');
    // The column's own check refuses it too, even with every trigger skipped.
    const bypass = sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO lessons (teacher_id, student_id, proposed_by, origin, subject, starts_at, minutes, ends_at,
                                    requested_at, reply_deadline, status, currency, rate_minor, price_minor, price_basis)
               VALUES (${f.t}, ${f.child}, ${f.t}, 'teacher_proposal', 'astrology', ${at(0)}, 30, ${at(30)},
                       now(), now() + interval '1 hour', 'proposed', 'INR', 60000, 30000, 'listed')`;
    });
    expect(await code(bypass)).toBe('23514');
    expect(await outcome(propose(sql, f, at(0), { subject: 'science' }))).toMatch(
      /linked to the child in this subject/,
    );
  });

  it('(N) a caller-sent price, rate, currency or basis that differs from the database’s is refused', async () => {
    const f = await family();
    const send = (o: { rate?: number; price?: number; cur?: string; basis?: string }) =>
      sql`INSERT INTO lessons (teacher_id, student_id, proposed_by, subject, starts_at, minutes, status,
                               rate_minor, price_minor, currency, price_basis)
          VALUES (${f.t}, ${f.child}, ${f.t}, 'maths', ${at(0)}, 30, 'proposed', ${o.rate ?? null}, ${o.price ?? null},
                  ${o.cur ?? null}, ${o.basis ?? null})`;
    for (const o of [{ rate: 50000 }, { price: 1 }, { cur: 'USD' }, { basis: 'agreed' }])
      expect(await outcome(send(o))).toMatch(/price has changed/);
    await send({ rate: 60000, price: 30000, cur: 'INR', basis: 'listed' }); // the shown price matches: accepted
  });

  it('(B) accepting one second before the deadline works; at or after it is refused (database clock)', async () => {
    const f = await family();
    const mk = (secondsLeft: number) =>
      sql.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        const [r] = await tx<{ id: string }[]>`
          INSERT INTO lessons (teacher_id, student_id, proposed_by, origin, subject, starts_at, minutes, ends_at,
                               requested_at, reply_deadline, status, currency, rate_minor, price_minor, price_basis)
          SELECT ${f.t}, ${f.child}, ${f.t}, 'teacher_proposal', 'maths', s, 30, s + interval '30 minutes',
                 now() - interval '48 hours' + make_interval(secs => ${secondsLeft}),
                 now() + make_interval(secs => ${secondsLeft}), 'proposed', 'INR', 60000, 30000, 'listed'
          FROM (SELECT ${at(secondsLeft === 30 ? 0 : 120)}::timestamptz AS s) x RETURNING id`;
        return r!.id;
      });
    const open = await mk(30);
    await accept(open, f.parent);
    expect(await status(open)).toBe('confirmed');
    const late = await mk(-1);
    expect(await code(accept(late, f.parent))).toBe('23514');
  });

  it('(C) two proposals from different teachers for overlapping times, accepted at once: one confirmed, the other refused', async () => {
    const f = await family();
    const other = await teacher();
    await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['maths'] });
    const a = await propose(sql, f, at(0));
    const b = await propose(sql, { t: other, child: f.child }, at(15));
    const [x, y] = [testDb(), testDb()];
    const results = await Promise.all([
      code(
        x.begin(async (tx) => {
          await accept(a, f.parent, tx as unknown as Db);
          await tx`SELECT pg_sleep(0.3)`;
        }),
      ),
      (async () => {
        await new Promise((r) => setTimeout(r, 100));
        return code(accept(b, f.parent2, y));
      })(),
    ]);
    await Promise.all([x.end(), y.end()]);
    expect(results.sort()).toEqual(['23P01', 'ok']);
    expect([await status(a), await status(b)]).toEqual(['confirmed', 'proposed']);
  });
});

describe('TL-3 decline reason (v1.1 review point 1): optional, trimmed, at most 200 characters, enforced by the database', () => {
  const decline = (id: string, parent: string, note: string | null) =>
    sql`UPDATE lessons SET status = 'declined', closed_by = 'parent', closed_by_account = ${parent}, close_note = ${note}
        WHERE id = ${id}`;
  const fresh = async (f: Fam) => propose(sql, f, at((slot += 60)));
  let slot = 0;

  it('(P) no reason: stored as none', async () => {
    const f = await family();
    const id = await fresh(f);
    await decline(id, f.parent, null);
    expect(await row(id)).toMatchObject({ status: 'declined', close_note: null });
  });

  it('(B) a whitespace-only reason is stored as none (never an empty string)', async () => {
    const f = await family();
    const id = await fresh(f);
    await decline(id, f.parent, ' \t  \n ');
    expect(await row(id)).toMatchObject({ status: 'declined', close_note: null });
  });

  it('(B) exactly 200 characters is accepted; 201 is refused by the column check and nothing changes', async () => {
    const f = await family();
    const ok = await fresh(f);
    await decline(ok, f.parent, 'a'.repeat(200));
    expect(((await row(ok)).close_note as string).length).toBe(200);
    const bad = await fresh(f);
    expect(await outcome(decline(bad, f.parent, 'b'.repeat(201)))).toMatch(/^23514: .*lessons_close_note_check/);
    expect(await row(bad)).toMatchObject({ status: 'proposed', close_note: null });
  });

  it('(P) leading and trailing whitespace is trimmed before the length check; inner spacing is kept', async () => {
    const f = await family();
    const id = await fresh(f);
    await decline(id, f.parent, `   Not that day,  thanks   `);
    expect((await row(id)).close_note).toBe('Not that day,  thanks');
    // 200 characters inside padding fits once trimmed.
    const padded = await fresh(f);
    await decline(padded, f.parent, `  ${'c'.repeat(200)}  `);
    expect(((await row(padded)).close_note as string).length).toBe(200);
  });

  it('(N) the column check holds even with every trigger skipped; only a parent’s decline may carry a reason; it can’t be edited later', async () => {
    const f = await family();
    const target = await fresh(f);
    await decline(target, f.parent, 'Fine');
    const bypass = sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lessons SET close_note = ${'d'.repeat(201)} WHERE id = ${target}`;
    });
    expect(await outcome(bypass)).toMatch(/^23514: .*lessons_close_note_check/);
    const w = await fresh(f);
    expect(
      await code(sql`UPDATE lessons SET status = 'withdrawn', closed_by = 'teacher', closed_by_account = ${f.t}, close_note = 'x'
                     WHERE id = ${w}`),
    ).toBe('23514'); // lessons_status_fields: a withdrawal carries no text
    const d = await fresh(f);
    await decline(d, f.parent, 'Too early');
    expect(await code(sql`UPDATE lessons SET close_note = 'Changed' WHERE id = ${d}`)).toBe('23514');
  });
});

describe('TL-3 proposal creation racing an overlapping confirmation (v1.1 review point 2)', () => {
  /** The request path's teacher acceptance (0029), inside the usual times (16:00 UTC). */
  const confirmRequest = (db: Db, id: string) => db`UPDATE lessons SET status = 'confirmed' WHERE id = ${id}`;
  const blocked = async (marker: string) => {
    for (let i = 0; i < 40; i++) {
      const [b] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE cardinality(pg_blocking_pids(pid)) > 0 AND query LIKE ${'%' + marker + '%'}`;
      if (b!.n > 0) return true;
      await new Promise((r) => setTimeout(r, 15));
    }
    return false;
  };

  it('(C) confirmation first, proposal during it (same teacher): the proposal waits, then is refused', async () => {
    const f = await family();
    const req = await request(sql, f, at(360)); // 16:00-16:30 UTC
    const [x, y] = [testDb(), testDb()];
    const b = x.begin(async (tx) => {
      await confirmRequest(tx as unknown as Db, req);
      await tx`SELECT pg_sleep(0.5)`;
    });
    await new Promise((r) => setTimeout(r, 100));
    const a = code(propose(y, f, at(375))); // 16:15, overlapping
    const waited = await blocked("'proposed'");
    const results = await Promise.all([code(b), a]);
    await Promise.all([x.end(), y.end()]);
    expect(results).toEqual(['ok', '23514']);
    expect(waited).toBe(true);
    expect(await status(req)).toBe('confirmed');
    expect(await sql`SELECT 1 FROM lessons WHERE teacher_id = ${f.t} AND status = 'proposed'`).toHaveLength(0);
  });

  it('(C) confirmation first, proposal during it (same child, another teacher): refused the same way', async () => {
    const f = await family();
    const other = await teacher();
    await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['maths'] });
    const req = await request(sql, f, at(360));
    const [x, y] = [testDb(), testDb()];
    const b = x.begin(async (tx) => {
      await confirmRequest(tx as unknown as Db, req);
      await tx`SELECT pg_sleep(0.5)`;
    });
    await new Promise((r) => setTimeout(r, 100));
    const a = code(propose(y, { t: other, child: f.child }, at(370)));
    const waited = await blocked("'proposed'");
    const results = await Promise.all([code(b), a]);
    await Promise.all([x.end(), y.end()]);
    expect(results).toEqual(['ok', '23514']);
    expect(waited).toBe(true);
  });

  it('(C) proposal first, confirmation during it: the confirmation waits, then succeeds; the proposal can never be accepted', async () => {
    const f = await family();
    const req = await request(sql, f, at(360));
    const [x, y] = [testDb(), testDb()];
    let proposal = '';
    const a = x.begin(async (tx) => {
      proposal = await propose(tx as unknown as Db, f, at(375));
      await tx`SELECT pg_sleep(0.5)`;
    });
    await new Promise((r) => setTimeout(r, 100));
    const b = code(confirmRequest(y, req));
    const waited = await blocked("status = 'confirmed'");
    const results = await Promise.all([code(a), b]);
    await Promise.all([x.end(), y.end()]);
    expect(results).toEqual(['ok', 'ok']);
    expect(waited).toBe(true);
    // TL3-4: an open proposal holds no time, so the confirmation proceeds; the stale proposal is
    // protected at acceptance by 0029's exclusion constraint (and closed by the application).
    expect(await status(proposal)).toBe('proposed');
    expect(await code(accept(proposal, f.parent))).toBe('23P01');
  });
});

describe('TL-3 same-slot cleanup ordering (v1.2.1 review): expiry before the time locks', () => {
  // lessons_before_insert expires an overdue proposal for the same teacher, child and start BEFORE
  // taking lessons_lock_times. Every path that touches an existing lesson takes its row lock before
  // any time lock (acceptance: row, then teacher, then child), so these tests prove each pairing
  // waits on the row and ends in exactly one consistent state, with no deadlock (40P01).
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const blocked = async (marker: string) => {
    for (let i = 0; i < 100; i++) {
      const [b] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE cardinality(pg_blocking_pids(pid)) > 0 AND query LIKE ${'%' + marker + '%'}`;
      if (b!.n > 0) return true;
      await sleep(15);
    }
    return false;
  };
  /** An open proposal whose deadline is `ms` from now by the database clock. */
  const dueIn = async (f: Fam, ms: number) =>
    raw({ ...f, start: at(0), requestedAt: new Date((await dbNow()) - 2 * DAY + ms), status: 'proposed' });
  const openAtSlot = async (f: Fam) =>
    (
      await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lessons
      WHERE teacher_id = ${f.t} AND student_id = ${f.child} AND starts_at = ${at(0)} AND status = 'proposed'`
    )[0]!.n;
  const INSERT = 'INSERT INTO lessons (teacher_id, student_id, proposed_by';

  it('(C) an acceptance in time holds the row; a same-slot proposal after the deadline waits, leaves it confirmed, and is refused', async () => {
    const f = await family();
    const l = await dueIn(f, 1500);
    const [x, y] = [testDb(), testDb()];
    const a = x.begin(async (tx) => {
      const n = (await accept(l, f.parent, tx as unknown as Db)).count; // its clock is before the deadline
      await tx`SELECT pg_sleep(3)`;
      return n;
    });
    await sleep(2000); // the deadline has now passed
    const p = code(propose(y, f, at(0))); // its clean-up matches the row, so it must wait for it
    const waited = await blocked(INSERT);
    const results = await Promise.all([a, p]);
    await Promise.all([x.end(), y.end()]);
    expect(waited).toBe(true);
    expect(results).toEqual([1, '23514']); // not expired by the clean-up; then the overlap rule refuses
    const r = await row(l);
    expect(r).toMatchObject({ status: 'confirmed', confirmed_by: f.parent });
    expect((r.confirmed_at as Date).getTime()).toBeLessThan((r.reply_deadline as Date).getTime());
    expect(await openAtSlot(f)).toBe(0);
  });

  it('(C) the clean-up holds the row first; an acceptance whose clock started before the deadline waits and changes nothing', async () => {
    const f = await family();
    const l = await dueIn(f, 1500);
    const [x, y] = [testDb(), testDb()];
    const a = x.begin(async (tx) => {
      await tx`SELECT 1`; // the transaction's clock starts before the deadline
      await sleep(2600);
      return (await accept(l, f.parent, tx as unknown as Db)).count;
    });
    await sleep(2000);
    let fresh = '';
    const p = y.begin(async (tx) => {
      fresh = await propose(tx as unknown as Db, f, at(0)); // expires the overdue row and holds it
      await tx`SELECT pg_sleep(1.5)`;
    });
    const waited = await blocked('confirmed_by =');
    const results = await Promise.all([a, code(p)]);
    await Promise.all([x.end(), y.end()]);
    expect(waited).toBe(true);
    expect(results).toEqual([0, 'ok']); // exactly one outcome: the expiry; the acceptance found nothing to change
    expect(await row(l)).toMatchObject({ status: 'expired', closed_by: 'aa_pro', confirmed_by: null });
    expect(await status(fresh)).toBe('proposed');
    expect(await openAtSlot(f)).toBe(1);
  });

  it('(C) the shared sweep holds the row; a same-slot proposal waits, then is created; the row is expired once', async () => {
    const f = await family();
    const l = await raw({ ...f, start: at(0), requestedAt: new Date(Date.now() - 3 * DAY), status: 'proposed' });
    const [x, y] = [testDb(), testDb()];
    const s = x.begin(async (tx) => {
      const ids = (await tx<{ id: string }[]>`SELECT lessons_expire_overdue() AS id`).map((r) => r.id);
      await tx`SELECT pg_sleep(0.8)`;
      return ids;
    });
    await sleep(200);
    const p = code(propose(y, f, at(0)));
    const waited = await blocked(INSERT);
    const [ids, result] = await Promise.all([s, p]);
    await Promise.all([x.end(), y.end()]);
    expect(waited).toBe(true);
    expect(ids).toContain(l);
    expect(result).toBe('ok');
    expect(await row(l)).toMatchObject({ status: 'expired', closed_by: 'aa_pro' });
    expect(await openAtSlot(f)).toBe(1);
  });

  it('(C) the clean-up holds the row; the shared sweep skips it without waiting', async () => {
    const f = await family();
    const l = await raw({ ...f, start: at(0), requestedAt: new Date(Date.now() - 3 * DAY), status: 'proposed' });
    const [x, y] = [testDb(), testDb()];
    const p = x.begin(async (tx) => {
      await propose(tx as unknown as Db, f, at(0));
      await tx`SELECT pg_sleep(0.8)`;
    });
    await sleep(200);
    const t0 = Date.now();
    const ids = (await y<{ id: string }[]>`SELECT lessons_expire_overdue() AS id`).map((r) => r.id);
    const took = Date.now() - t0;
    const result = await code(p);
    await Promise.all([x.end(), y.end()]);
    expect(ids).not.toContain(l); // SKIP LOCKED
    expect(took).toBeLessThan(500); // did not wait for the 0.8 s transaction
    expect(result).toBe('ok');
    expect(await row(l)).toMatchObject({ status: 'expired', closed_by: 'aa_pro' });
    expect(await openAtSlot(f)).toBe(1);
  });

  it('(C) two proposals for a slot held by an overdue one: the second waits on the row, then is refused; one open', async () => {
    const f = await family();
    const l = await raw({ ...f, start: at(0), requestedAt: new Date(Date.now() - 3 * DAY), status: 'proposed' });
    const [x, y] = [testDb(), testDb()];
    const first = x.begin(async (tx) => {
      await propose(tx as unknown as Db, f, at(0));
      await tx`SELECT pg_sleep(0.6)`;
    });
    await sleep(150);
    const second = code(propose(y, f, at(0)));
    const waited = await blocked(INSERT);
    const results = await Promise.all([code(first), second]);
    await Promise.all([x.end(), y.end()]);
    expect(waited).toBe(true);
    expect(results).toEqual(['ok', '23505']);
    expect(await status(l)).toBe('expired');
    expect(await openAtSlot(f)).toBe(1);
  });

  // Multi-statement transactions. Inside single statements the order can't deadlock (above). The
  // application's acceptance (answerLesson on main) first locks the row (SELECT ... FOR UPDATE),
  // then confirms it (time locks), then closes overlapping requests: these three tests pin down how
  // the clean-up's position behaves with that shape.
  it('(C) guard: an acceptance that locks the row first, then confirms, never deadlocks with the same-slot clean-up', async () => {
    const f = await family();
    const l = await dueIn(f, 1500);
    const [x, y] = [testDb(), testDb()];
    const a = x.begin(async (tx) => {
      await tx`SELECT id FROM lessons WHERE id = ${l} FOR UPDATE`; // row lock and clock before the deadline
      await sleep(2600);
      return (await accept(l, f.parent, tx as unknown as Db)).count; // now takes the time locks
    });
    await sleep(2000);
    const p = code(propose(y, f, at(0))); // waits on the row while holding no time lock
    const waited = await blocked(INSERT);
    const results = await Promise.all([a, p]);
    await Promise.all([x.end(), y.end()]);
    expect(waited).toBe(true);
    expect(results).toEqual([1, '23514']);
    expect(await status(l)).toBe('confirmed');
  });

  it('(C) stage-3 constraint: confirming, then closing an overlapping proposal by a plain UPDATE, can deadlock with that slot’s clean-up; one is aborted (40P01) and the state stays consistent', async () => {
    const f = await family();
    const req = await request(sql, f, at(360));
    const l = await raw({ ...f, start: at(360), requestedAt: new Date(Date.now() - 3 * DAY), status: 'proposed' });
    const [x, y] = [testDb(), testDb()];
    const q = x.begin(async (tx) => {
      await tx`UPDATE lessons SET status = 'confirmed' WHERE id = ${req}`; // takes the time locks
      await tx`SELECT pg_sleep(0.5)`;
      await tx`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free'
               WHERE id = ${l} AND status = 'proposed'`; // wants the row the clean-up holds
    });
    await sleep(150);
    const p = code(propose(y, f, at(360))); // clean-up locks l, then waits for the time locks
    const [qr, pr] = await Promise.all([code(q), p]);
    await Promise.all([x.end(), y.end()]);
    expect([qr, pr]).toContain('40P01');
    if (pr === '40P01') {
      expect(qr).toBe('ok');
      expect(await status(req)).toBe('confirmed');
      expect(await row(l)).toMatchObject({ status: 'declined', close_reason: 'time_no_longer_free' });
    } else {
      expect(pr).toBe('ok'); // the confirmation was rolled back, so nothing overlapped
      expect(await status(req)).toBe('requested');
      expect(await status(l)).toBe('expired');
    }
  });

  it('(C) stage-3 pattern: the same closure with FOR UPDATE SKIP LOCKED does not deadlock; the skipped proposal stays unacceptable', async () => {
    const f = await family();
    const req = await request(sql, f, at(360));
    const l = await raw({ ...f, start: at(360), requestedAt: new Date(Date.now() - 3 * DAY), status: 'proposed' });
    const [x, y] = [testDb(), testDb()];
    const q = x.begin(async (tx) => {
      await tx`UPDATE lessons SET status = 'confirmed' WHERE id = ${req}`;
      await tx`SELECT pg_sleep(0.5)`;
      await tx`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free'
               WHERE id IN (SELECT id FROM lessons WHERE id = ${l} AND status = 'proposed' FOR UPDATE SKIP LOCKED)`;
    });
    await sleep(150);
    const p = code(propose(y, f, at(360)));
    const waited = await blocked(INSERT);
    const results = await Promise.all([code(q), p]);
    await Promise.all([x.end(), y.end()]);
    expect(waited).toBe(true);
    expect(results).toEqual(['ok', '23514']); // no deadlock; the new proposal then overlaps the confirmed lesson
    expect(await status(req)).toBe('confirmed');
    // The clean-up was rolled back with the refused proposal, so l is still open but overdue: it can't
    // be accepted, and the sweep expires it.
    expect(await status(l)).toBe('proposed');
    expect(await code(accept(l, f.parent))).toBe('23514');
    expect((await sql<{ id: string }[]>`SELECT lessons_expire_overdue() AS id`).map((r) => r.id)).toContain(l);
  });
});

describe('TL-3 attribution after account deletion (review finding 2)', () => {
  it('a parent named in the audit trail cannot be deleted at all (0001), so who accepted stays identifiable', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    await accept(id, f.parent2);
    await sql`INSERT INTO audit_events (event_type, outcome, actor_id, details)
              VALUES ('LESSON_PROPOSAL_ACCEPTED', 'success', ${f.parent2}, ${sql.json({ lesson: id })})`;
    expect(await outcome(sql`DELETE FROM accounts WHERE id = ${f.parent2}`)).toMatch(/append-only/);
    expect(await row(id)).toMatchObject({ confirmed_by: f.parent2, origin: 'teacher_proposal' });
  });

  it('if a parent account with no audit trail is erased, the fact of acceptance stays and only the identity goes', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    await accept(id, f.parent2);
    await sql`DELETE FROM guardian_links WHERE parent_id = ${f.parent2}`;
    await sql`DELETE FROM accounts WHERE id = ${f.parent2}`;
    expect(await row(id)).toMatchObject({
      status: 'confirmed',
      origin: 'teacher_proposal',
      proposed_by: f.t,
      teacher_id: f.t,
      confirmed_by: null,
    });
  });

  it('deleting a teacher account removes their lessons with it (0029 cascade, unchanged): there is no orphan proposal', async () => {
    const f = await family();
    const id = await propose(sql, f, at(0));
    await sql`DELETE FROM accounts WHERE id = ${f.t}`.catch(() => undefined);
    const left = await sql`SELECT proposed_by FROM lessons WHERE id = ${id}`;
    // Either the teacher could not be deleted (other records hold it) or the lesson went with them;
    // a proposal is never left without its teacher.
    expect(left.length === 0 || left[0]!.proposed_by === f.t).toBe(true);
  });
});

describe('TL-3 0034 applies cleanly to a database at 0033 (review finding 1)', () => {
  it('the exact file applies once through the runner, every replaced function compiles, and a second run does nothing', async () => {
    const admin = testDb();
    const name = `tl3clean_${uniq()}`;
    await admin.unsafe(`CREATE DATABASE ${name}`);
    const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
    url.pathname = `/${name}`;
    const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      const before = await migrate(db, { dir: await migrationsBefore('0034') });
      expect(before.at(-1)).toBe('0033_material_requests.sql');
      // An existing parent-requested chapter row (its parents skipped for this fixture only).
      await db.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO lesson_chapters (lesson_id, position, topic, label) VALUES (gen_random_uuid(), 1, 'Old topic', 'Old topic')`;
      });
      expect(await migrate(db)).toEqual(['0034_teacher_proposals.sql']);
      // WF-10: existing rows keep their kind and get no intent; the new rules are validated against them.
      expect(await db`SELECT source, intent FROM lesson_chapters`).toEqual([{ source: 'requested', intent: null }]);
      expect(
        await db`SELECT conname, convalidated FROM pg_constraint
                 WHERE conrelid = 'lesson_chapters'::regclass AND conname LIKE 'lesson_chapters_intent%' ORDER BY conname`,
      ).toEqual([
        { conname: 'lesson_chapters_intent_check', convalidated: true },
        { conname: 'lesson_chapters_intent_planned_only', convalidated: true },
      ]);
      expect(await migrate(db)).toEqual([]);
      const [c] = await db<
        { checksum: string }[]
      >`SELECT checksum FROM schema_migrations WHERE name = '0034_teacher_proposals.sql'`;
      const { createHash } = await import('node:crypto');
      const file = await readFile(new URL('../../db/migrations/0034_teacher_proposals.sql', import.meta.url), 'utf8');
      expect(c!.checksum).toBe(createHash('sha256').update(file).digest('hex'));
      // check_function_bodies is on (the default), so each body was parsed when created; this
      // also confirms the labelled sub-blocks are present in what PostgreSQL stored.
      const [setting] = await db<{ v: string }[]>`SELECT current_setting('check_function_bodies') AS v`;
      expect(setting!.v).toBe('on');
      const src = async (fn: string) =>
        (await db<{ s: string }[]>`SELECT prosrc AS s FROM pg_proc WHERE proname = ${fn}`)[0]!.s;
      expect(await src('lessons_before_insert')).toContain('<<parent_request_0029>>');
      expect(await src('lessons_before_update')).toContain('<<lesson_rules_0029>>');
      expect(await src('lesson_chapters_before_write')).toContain('<<requested_chapters_0032>>');
    } finally {
      await db.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    }
  });
});

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

describe('TL-3 planned-chapter intent (WF-10, TLS 5.1-4): new, continue or revise; optional; planned only; fixed', () => {
  const plan = (db: Db, lesson: string, position: number, chapter: string, intent: string | null) =>
    db`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id, source, label, intent)
       VALUES (${lesson}, ${position}, ${chapter}, 'planned', 'Invented', ${intent})`;
  const intents = async (lesson: string) =>
    (
      await sql<
        { intent: string | null }[]
      >`SELECT intent FROM lesson_chapters WHERE lesson_id = ${lesson} ORDER BY position`
    ).map((r) => r.intent);
  let slot = 3000;

  it('(P) a planned chapter may carry new, continue or revise, or nothing (optional)', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await sql.begin(async (tx) => {
      const lesson = await propose(tx as unknown as Db, f, at((slot += 60)));
      await plan(tx as unknown as Db, lesson, 1, b.chapters[0]!, 'new');
      await plan(tx as unknown as Db, lesson, 2, b.chapters[1]!, 'continue');
      await plan(tx as unknown as Db, lesson, 3, b.chapters[2]!, 'revise');
      await plan(tx as unknown as Db, lesson, 4, b.chapters[3]!, null);
      return lesson;
    });
    expect(await intents(id)).toEqual(['new', 'continue', 'revise', null]);
  });

  it('(P) D-E2E-3 (b): an intent may also be given when the teacher adds planned chapters on accepting a request', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const r = await request(sql, f, at(6 * 60));
    await sql.begin(async (tx) => {
      await tx`UPDATE lessons SET status = 'confirmed' WHERE id = ${r}`;
      await plan(tx as unknown as Db, r, 1, b.chapters[0]!, 'revise');
    });
    expect(await intents(r)).toEqual(['revise']);
  });

  it('(N) any other value is refused, by the column check, also with every trigger skipped', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    for (const bad of ['New', 'review', '', 'continuation']) {
      const attempt = sql.begin(async (tx) => {
        const lesson = await propose(tx as unknown as Db, f, at((slot += 60)));
        await plan(tx as unknown as Db, lesson, 1, b.chapters[0]!, bad);
      });
      expect(await outcome(attempt)).toMatch(/^23514: .*lesson_chapters_intent_check/);
    }
    const target = await sql.begin(async (tx) => {
      const lesson = await propose(tx as unknown as Db, f, at((slot += 60)));
      await plan(tx as unknown as Db, lesson, 1, b.chapters[0]!, 'new');
      return lesson;
    });
    const bypass = sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lesson_chapters SET intent = 'later' WHERE lesson_id = ${target}`;
    });
    expect(await outcome(bypass)).toMatch(/^23514: .*lesson_chapters_intent_check/);
  });

  it('(N) a parent-requested chapter never carries an intent, also with every trigger skipped', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const withIntent = sql.begin(async (tx) => {
      const id = await request(tx as unknown as Db, f, at(6 * 60 + 1440));
      await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id, intent) VALUES (${id}, 1, ${b.chapters[0]!}, 'new')`;
    });
    expect(await outcome(withIntent)).toMatch(/^23514: .*lesson_chapters_intent_planned_only/);
    const [r] = await sql.begin(async (tx) => {
      const id = await request(tx as unknown as Db, f, at(6 * 60 + 2880));
      await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id) VALUES (${id}, 1, ${b.chapters[0]!})`;
      return [id];
    });
    expect(await intents(r!)).toEqual([null]);
    const bypass = sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lesson_chapters SET intent = 'new' WHERE lesson_id = ${r!}`;
    });
    expect(await outcome(bypass)).toMatch(/^23514: .*lesson_chapters_intent_planned_only/);
  });

  it('(N) the intent never changes once written; clearing a deleted chapter keeps it', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await sql.begin(async (tx) => {
      const lesson = await propose(tx as unknown as Db, f, at((slot += 60)));
      await plan(tx as unknown as Db, lesson, 1, b.chapters[0]!, 'new');
      await plan(tx as unknown as Db, lesson, 2, b.chapters[1]!, null);
      return lesson;
    });
    expect(await code(sql`UPDATE lesson_chapters SET intent = 'revise' WHERE lesson_id = ${id} AND position = 1`)).toBe(
      '23514',
    );
    expect(await code(sql`UPDATE lesson_chapters SET intent = NULL WHERE lesson_id = ${id} AND position = 1`)).toBe(
      '23514',
    );
    expect(await code(sql`UPDATE lesson_chapters SET intent = 'new' WHERE lesson_id = ${id} AND position = 2`)).toBe(
      '23514',
    );
    await sql`DELETE FROM book_chapters WHERE id = ${b.chapters[0]!}`; // ON DELETE SET NULL (0032's one allowed update)
    const rows =
      await sql`SELECT position, book_chapter_id, intent FROM lesson_chapters WHERE lesson_id = ${id} ORDER BY position`;
    expect(rows).toEqual([
      { position: 1, book_chapter_id: null, intent: 'new' },
      { position: 2, book_chapter_id: b.chapters[1], intent: null },
    ]);
    expect(await code(sql`UPDATE lesson_chapters SET intent = 'revise' WHERE lesson_id = ${id} AND position = 1`)).toBe(
      '23514',
    );
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
