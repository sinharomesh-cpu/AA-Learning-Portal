import postgres from 'postgres';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * M1 (0029, revision 2): the database rules behind Human Teacher lesson booking (CR-17 PR 2).
 * Synthetic data only, on the throw-away database made by global-setup. Every rule is checked from
 * the database side, whatever the server code sends.
 *
 * Fixtures that must lie in the past (an overdue request, a lesson that has ended, a lesson starting
 * in 30 minutes) cannot be made through the normal path, which only accepts starts 24 hours to
 * 4 weeks ahead. They are inserted with `SET LOCAL session_replication_role = replica`, which skips
 * triggers for that one transaction only and never alters the table; CHECK, UNIQUE and EXCLUDE
 * rules still apply. After every test the triggers are confirmed to be on.
 */
type Db = postgres.Sql<Record<string, unknown>>;
const sql = testDb();

const triggerStates = async () =>
  (
    await sql<{ n: string; e: string }[]>`
      SELECT tgname AS n, tgenabled AS e FROM pg_trigger
      WHERE tgrelid = 'lessons'::regclass AND NOT tgisinternal ORDER BY 1`
  ).map((r) => `${r.n}:${r.e}`);
afterEach(async () => {
  expect(await triggerStates()).toEqual([
    'lessons_before_insert:O',
    'lessons_before_update:O',
    'lessons_drop_link_on_cancel:O',
  ]);
});
afterAll(() => sql.end());

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Three days ahead, 10:00 UTC: on the grid, inside the window and the notice. */
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR);
const at = (offsetMin: number) => new Date(BASE.getTime() + offsetMin * MIN);
const isoWeekday = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;
const floor30 = (ms: number) => new Date(Math.floor(ms / (30 * MIN)) * 30 * MIN);
const ceil30 = (ms: number) => new Date(Math.ceil(ms / (30 * MIN)) * 30 * MIN);
const dbNow = async () => (await sql<{ t: Date }[]>`SELECT now() AS t`)[0]!.t.getTime();

/** An approved, active teacher with a listed hourly rate (INR 600, 30 min) and, by default, usual times all day, every day, in UTC. */
async function teacher(opts: { zone?: string; usual?: Array<[number, number, number]> | 'all'; rate?: number } = {}) {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = ${opts.zone ?? 'UTC'} WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  const usual = opts.usual ?? 'all';
  const rows = usual === 'all' ? [1, 2, 3, 4, 5, 6, 7].map((d) => [d, 0, 1440] as const) : usual;
  for (const [d, s, e] of rows)
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, ${s}, ${e})`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', ${opts.rate ?? 60000}, 30)`;
  return id;
}

/** A parent and child, a second parent of the same child, and a teacher linked in maths. */
async function setup(opts: Parameters<typeof teacher>[0] & { linkSubjects?: string[] } = {}) {
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  const parent2 = await createAdult(sql, 'parent');
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  const t = await teacher(opts);
  await activeLink(sql, { teacher: t, child, parent, subjects: opts.linkSubjects ?? ['maths'] });
  return { parent, parent2, child, t };
}

/** Another child of a new parent, linked to the same teacher in maths. */
async function otherChild(t: string) {
  const p = await createAdult(sql, 'parent');
  const c = await createChild(sql, p);
  await activeLink(sql, { teacher: t, child: c, parent: p, subjects: ['maths'] });
  return { parent: p, child: c };
}

type Req = {
  t: string;
  child: string;
  parent: string;
  start: Date;
  minutes?: number;
  subject?: string;
  // What a caller might send; all optional, all checked by the database.
  deadline?: Date | null;
  endsAt?: Date | null;
  rate?: number | null;
  currency?: string | null;
  priceMinor?: number | null;
  basis?: string | null;
  agreement?: string | null;
};

async function request(db: Db, r: Req) {
  const [row] = await db<{ id: string }[]>`
    INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, reply_deadline,
                         currency, rate_minor, price_minor, price_basis, agreement_id)
    VALUES (${r.t}, ${r.child}, ${r.parent}, ${r.subject ?? 'maths'}, ${r.start}, ${r.minutes ?? 30}, ${r.endsAt ?? null},
            ${r.deadline ?? null}, ${r.currency ?? null}, ${r.rate ?? null}, ${r.priceMinor ?? null}, ${r.basis ?? null},
            ${r.agreement ?? null})
    RETURNING id`;
  return row!.id;
}

/** A fixture row with triggers skipped for this one transaction (see the note at the top). */
async function raw(f: {
  t: string;
  child: string;
  parent: string;
  start: Date;
  requestedAt: Date;
  minutes?: number;
  status?: 'requested' | 'confirmed';
}) {
  const minutes = f.minutes ?? 30;
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${f.parent}, 'maths', s, ${minutes}, s + make_interval(mins => ${minutes}), q,
             LEAST(q + interval '48 hours', s - interval '2 hours'), ${f.status ?? 'requested'},
             CASE WHEN ${f.status ?? 'requested'} = 'confirmed' THEN q + interval '1 minute' END,
             'INR', 60000, ${Math.floor((60000 * minutes * 2 + 60) / 120)}, 'listed'
      FROM (SELECT ${f.start}::timestamptz AS s, ${f.requestedAt}::timestamptz AS q) x
      RETURNING id`;
    return r!.id;
  });
}

const confirm = (id: string, db: Db = sql) => db`UPDATE lessons SET status = 'confirmed' WHERE id = ${id}`;
const row = async (id: string) =>
  (await sql<Record<string, unknown>[]>`SELECT * FROM lessons WHERE id = ${id}`)[0] as Record<string, unknown>;
const status = async (id: string) => (await row(id)).status as string;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const message = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as Error).message;
  }
};

// ---------------------------------------------------------------------------------------------
describe('M1 shape of a request', () => {
  it('accepts 10, 25 and 40 minutes; refuses 9, 12 and 41', async () => {
    const f = await setup();
    for (const [i, m] of [10, 25, 40].entries()) await request(sql, { ...f, start: at(i * 60), minutes: m });
    for (const [i, m] of [9, 12, 41].entries())
      expect(await code(request(sql, { ...f, start: at(600 + i * 60), minutes: m }))).toBe('23514');
  });

  it('the end is always start + length: a wrong end sent by the caller is replaced; the CHECK refuses one anyway', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0), minutes: 30, endsAt: at(35) });
    expect((await row(id)).ends_at).toEqual(at(30));
    const bad = sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                                    reply_deadline, currency, rate_minor, price_minor, price_basis)
               VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${at(60)}, 30, ${at(95)}, ${at(-3 * 24 * 60)},
                       ${at(-24 * 60)}, 'INR', 60000, 30000, 'listed')`;
    });
    expect(await code(bad)).toBe('23514');
  });

  it('a lesson always starts as a request, with database time stamps; an unknown status is refused', async () => {
    const f = await setup();
    const confirmed = sql`INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, status)
                          VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${at(0)}, 30, 'confirmed')`;
    expect(await code(confirmed)).toBe('23514');
    const [r] = await sql<{ ok: boolean; id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, requested_at)
      VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${at(120)}, 30, '2001-01-01')
      RETURNING id, requested_at = now() AS ok`;
    expect(r!.ok).toBe(true);
    expect(await code(sql`UPDATE lessons SET status = 'booked' WHERE id = ${r!.id}`)).toBe('23514');
  });
});

// ---------------------------------------------------------------------------------------------
describe('M1 point 2: reply deadline (D3A-5), notice (D3A-3) and window (D3A-2)', () => {
  it('a lesson far ahead: deadline = request time + 48 hours; a deadline sent by the caller is replaced', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(5 * 24 * 60), deadline: at(5 * 24 * 60) });
    const [r] = await sql<{ ok: boolean }[]>`
      SELECT reply_deadline = requested_at + interval '48 hours' AS ok FROM lessons WHERE id = ${id}`;
    expect(r!.ok).toBe(true);
  });

  it('a lesson 24-26 hours ahead: deadline = start - 2 hours, which is sooner than 48 hours', async () => {
    const f = await setup();
    const start = ceil30((await dbNow()) + DAY + MIN);
    const id = await request(sql, { ...f, start });
    const [r] = await sql<{ ok: boolean; sooner: boolean }[]>`
      SELECT reply_deadline = starts_at - interval '2 hours' AS ok,
             reply_deadline < requested_at + interval '48 hours' AS sooner FROM lessons WHERE id = ${id}`;
    expect(r).toEqual({ ok: true, sooner: true });
  });

  it('notice: exactly the first grid time at least 24 hours ahead is accepted; the one before it is refused', async () => {
    const f = await setup();
    const now = await dbNow();
    expect(await message(request(sql, { ...f, start: floor30(now + DAY) }))).toMatch(/24 hours ahead/);
    await request(sql, { ...f, start: ceil30(now + DAY + MIN) });
  });

  it('requests made less than 2 hours (and less than 24 hours) before the lesson are refused', async () => {
    const f = await setup();
    const now = await dbNow();
    for (const start of [ceil30(now + 30 * MIN), ceil30(now + 90 * MIN), floor30(now + 23 * HOUR)])
      expect(await message(request(sql, { ...f, start }))).toMatch(/24 hours ahead/);
    // Backstop: even with every trigger skipped, the CHECK refuses a deadline that is not after the request.
    const s = ceil30(now + 60 * MIN);
    const bad = sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at,
                                    reply_deadline, currency, rate_minor, price_minor, price_basis)
               VALUES (${f.t}, ${f.child}, ${f.parent}, 'maths', ${s}, 30, ${new Date(s.getTime() + 30 * MIN)},
                       ${new Date(s.getTime() - 2 * HOUR)}, 'INR', 60000, 30000, 'listed')`;
    });
    expect(await code(bad)).toBe('23514');
  });

  it('window: the last grid time within 4 weeks is accepted; 30 minutes later is refused', async () => {
    const f = await setup();
    const last = floor30((await dbNow()) + 28 * DAY);
    await request(sql, { ...f, start: last });
    expect(await message(request(sql, { ...f, start: new Date(last.getTime() + 30 * MIN) }))).toMatch(/4 weeks/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('M1 point 1: expiry without a scheduler', () => {
  it('an overdue request cannot be accepted, and frees its slot for a new request at once', async () => {
    const f = await setup();
    const old = await raw({ ...f, start: at(0), requestedAt: new Date(Date.now() - 3 * DAY) });
    expect(await status(old)).toBe('requested'); // overdue but not yet swept
    expect(await code(confirm(old))).toBe('23514');
    // The other parent asks for the same child, teacher and start: allowed; the old one is expired.
    const fresh = await request(sql, { ...f, parent: f.parent2, start: at(0) });
    const o = await row(old);
    expect(o).toMatchObject({ status: 'expired', closed_by: 'aa_pro', closed_by_account: null });
    expect((o.closed_at as Date) >= (o.reply_deadline as Date)).toBe(true);
    expect(await status(fresh)).toBe('requested');
  });

  it('lessons_expire_overdue() expires overdue requests only, returns them once, and can be run again safely', async () => {
    const f = await setup();
    const q = new Date(Date.now() - 3 * DAY);
    const a = await raw({ ...f, start: at(0), requestedAt: q });
    const b = await raw({ ...f, start: at(60), requestedAt: q });
    const open = await request(sql, { ...f, start: at(120) });
    const first = (await sql<{ id: string }[]>`SELECT lessons_expire_overdue() AS id`).map((r) => r.id);
    expect(first).toEqual(expect.arrayContaining([a, b]));
    expect([await status(a), await status(b), await status(open)]).toEqual(['expired', 'expired', 'requested']);
    const second = (await sql<{ id: string }[]>`SELECT lessons_expire_overdue() AS id`).map((r) => r.id);
    expect(second).not.toContain(a);
    expect(second).not.toContain(b);
  });

  it('two sweeps at the same moment expire each overdue request exactly once', async () => {
    const f = await setup();
    const q = new Date(Date.now() - 3 * DAY);
    const mine: string[] = [];
    for (let i = 0; i < 20; i++) mine.push(await raw({ ...f, start: at(i * 30), requestedAt: q }));
    const [x, y] = [testDb(), testDb()];
    const runs = await Promise.all(
      [x, y].map((db) =>
        db.begin(async (tx) => {
          const ids = (await tx<{ id: string }[]>`SELECT lessons_expire_overdue(500) AS id`).map((r) => r.id);
          await tx`SELECT pg_sleep(0.2)`;
          return ids;
        }),
      ),
    );
    await Promise.all([x.end(), y.end()]);
    const got = runs.flat().filter((id) => mine.includes(id));
    expect(got.sort()).toEqual([...mine].sort());
    expect(new Set(got).size).toBe(20);
  });

  it('overdue requests do not count towards the 10 open requests per parent', async () => {
    const f = await setup();
    const q = new Date(Date.now() - 3 * DAY);
    for (let i = 0; i < 3; i++) await raw({ ...f, start: at(1440 + i * 60), requestedAt: q });
    for (let i = 0; i < 10; i++) await request(sql, { ...f, start: at(i * 60) });
    expect(await message(request(sql, { ...f, start: at(600) }))).toMatch(/at most 10/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("M1 point 3: the teacher's usual times", () => {
  it('start times must be on the 30-minute grid', async () => {
    const f = await setup();
    await request(sql, { ...f, start: at(30) });
    for (const off of [10, 15, 45]) expect(await message(request(sql, { ...f, start: at(off) }))).toMatch(/grid/);
  });

  it("the whole lesson must fit inside one usual-time range (scope example: 4:00-5:00 in the teacher's time zone)", async () => {
    // A teacher in India with one usual time, 16:00-17:00 IST (10:30-11:30 UTC) on BASE's weekday.
    const f = await setup({ zone: 'Asia/Kolkata', usual: [[isoWeekday(BASE), 960, 1020]] });
    const utc = (h: number, m: number) => new Date(BASE.getTime() - 10 * HOUR + (h * 60 + m) * MIN);
    await request(sql, { ...f, start: utc(10, 30), minutes: 25 }); // 16:00 IST
    await request(sql, { ...f, start: utc(11, 0), minutes: 25 }); // 16:30 IST
    const refused = [
      { start: utc(11, 0), minutes: 40 }, // 16:30-17:10 IST, past the end
      { start: utc(10, 0), minutes: 25 }, // 15:30 IST, before the start
      { start: utc(10, 45), minutes: 10 }, // 16:15 IST, off the grid
      { start: new Date(utc(10, 30).getTime() + DAY), minutes: 25 }, // next day: no usual time
    ];
    for (const r of refused) expect(await message(request(sql, { ...f, ...r }))).toMatch(/usual times/);
  });

  it('availability removed before the teacher accepts: accepting is refused; AA Pro closes it as "time no longer free"', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0) });
    await sql`DELETE FROM teacher_usual_times WHERE teacher_id = ${f.t} AND weekday = ${isoWeekday(BASE)}`;
    expect(await message(confirm(id))).toMatch(/no longer inside the teacher's usual times/);
    await sql`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free' WHERE id = ${id}`;
    expect(await row(id)).toMatchObject({
      status: 'declined',
      closed_by: 'aa_pro',
      close_reason: 'time_no_longer_free',
    });
  });

  it('availability changed after the teacher accepted: the confirmed lesson stays (scope)', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0) });
    await confirm(id);
    await sql`DELETE FROM teacher_usual_times WHERE teacher_id = ${f.t}`;
    expect(await status(id)).toBe('confirmed');
    expect(await message(request(sql, { ...f, start: at(120) }))).toMatch(/usual times/); // new requests use the new times
  });
});

// ---------------------------------------------------------------------------------------------
describe('M1 point 4: price integrity (D3A-21)', () => {
  /** An accepted hourly agreement, inserted directly (its own rules are tested in CR-13/15). */
  async function agreement(
    f: { t: string; parent: string; child: string | null },
    a: { rate: number; slot: object; subject?: string },
  ) {
    return sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO rate_negotiations (parent_id, teacher_id, listing_public_id, child_id, child_key, grade, subject,
                                       model, kind, slot, currency, asking_amount_minor, asking_minutes, status, turn,
                                       expires_at, ended_at, ended_by, agreed_amount_minor, agreed_minutes)
        VALUES (${f.parent}, ${f.t}, ${`t-${uniq()}ab`}, ${f.child}, ${f.child ? `child:${f.child}` : 'grade:5:cbse'}, 5,
                ${a.subject ?? 'maths'}, 'hourly', 'hourly', ${sql.json(a.slot as never)}, 'INR', 60000, 30, 'accepted', NULL,
                now() + interval '7 days', now(), 'parent', ${a.rate}, 30)
        RETURNING id`;
      return r!.id;
    });
  }
  const snap = async (id: string) => {
    const r = await row(id);
    return {
      basis: r.price_basis,
      rate: Number(r.rate_minor),
      currency: r.currency,
      price: Number(r.price_minor),
      agreement: r.agreement_id,
    };
  };

  it('listed: rate and currency come from the teacher listing; the caller sends none', async () => {
    const f = await setup({ rate: 33333 });
    const id = await request(sql, { ...f, start: at(0), minutes: 25 });
    // 333.33 x 25 / 60 = 138.8875 -> 13889 paise, rounded once, half up.
    expect(await snap(id)).toEqual({ basis: 'listed', rate: 33333, currency: 'INR', price: 13889, agreement: null });
  });

  it('caller values that differ from the listing are refused; matching ones are accepted', async () => {
    const f = await setup();
    for (const wrong of [{ rate: 1 }, { currency: 'USD' }, { priceMinor: 1 }, { basis: 'agreed' }])
      expect(await message(request(sql, { ...f, start: at(0), ...wrong }))).toMatch(/price has changed/);
    await request(sql, { ...f, start: at(0), rate: 60000, currency: 'INR', priceMinor: 30000, basis: 'listed' });
  });

  it('the snapshot never changes when the listing changes; new requests use the new rate', async () => {
    const f = await setup();
    const a = await request(sql, { ...f, start: at(0) });
    await sql`UPDATE teacher_listings SET hourly_rate_minor = 90000, hourly_currency = 'SGD' WHERE teacher_id = ${f.t}`;
    const b = await request(sql, { ...f, start: at(60) });
    expect(await snap(a)).toMatchObject({ rate: 60000, currency: 'INR', price: 30000 });
    expect(await snap(b)).toMatchObject({ rate: 90000, currency: 'SGD', price: 45000 });
    expect(await code(sql`UPDATE lessons SET rate_minor = 1, price_minor = 1 WHERE id = ${a}`)).toBe('23514');
  });

  it('a teacher with no hourly rate on their listing cannot be booked', async () => {
    const f = await setup();
    await sql`UPDATE teacher_listings SET hourly_offered = false WHERE teacher_id = ${f.t}`;
    expect(await message(request(sql, { ...f, start: at(0) }))).toMatch(/no hourly rate/);
  });

  it('agreed: used only when the whole lesson lies in the agreed slot, for the same teacher, child and subject', async () => {
    const f = await setup();
    const slot = { weekday: isoWeekday(BASE), start: 600, end: 660, timeZone: 'UTC' }; // 10:00-11:00 UTC
    const ag = await agreement(f, { rate: 50000, slot });
    const inside = await request(sql, { ...f, start: at(0), minutes: 30 });
    const overruns = await request(sql, { ...f, start: at(30), minutes: 40 }); // 10:30-11:10
    const otherDay = await request(sql, { ...f, start: at(24 * 60), minutes: 30 });
    expect(await snap(inside)).toEqual({ basis: 'agreed', rate: 50000, currency: 'INR', price: 25000, agreement: ag });
    expect(await snap(overruns)).toMatchObject({ basis: 'listed', rate: 60000, agreement: null });
    expect(await snap(otherDay)).toMatchObject({ basis: 'listed', rate: 60000, agreement: null });
    // Claiming the agreed rate outside its slot is refused.
    const claim = request(sql, { ...f, start: at(7 * 24 * 60 + 60), basis: 'agreed', agreement: ag, rate: 50000 });
    expect(await message(claim)).toMatch(/price has changed/);
  });

  it('agreed: not used for another subject, nor for an agreement made for a prospective child', async () => {
    const f = await setup({ linkSubjects: ['maths', 'science'] });
    const slot = { weekday: isoWeekday(BASE), start: 600, end: 660, timeZone: 'UTC' };
    await agreement(f, { rate: 40000, slot, subject: 'science' });
    await agreement({ ...f, child: null }, { rate: 30000, slot });
    expect(await snap(await request(sql, { ...f, start: at(0) }))).toMatchObject({ basis: 'listed', rate: 60000 });
  });
});

// ---------------------------------------------------------------------------------------------
describe('M1 who may request and change', () => {
  it('needs an active parent-child link; either linked parent may ask; a revoked parent may not', async () => {
    const f = await setup();
    await request(sql, { ...f, start: at(0) });
    await request(sql, { ...f, parent: f.parent2, start: at(60) });
    const stranger = await createAdult(sql, 'parent');
    expect(await code(request(sql, { ...f, parent: stranger, start: at(120) }))).toBe('42501');
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE parent_id = ${f.parent2} AND student_id = ${f.child}`;
    expect(await code(request(sql, { ...f, parent: f.parent2, start: at(180) }))).toBe('42501');
    await request(sql, { ...f, start: at(240) });
  });

  it('needs an active teacher link that includes the subject, and an active teacher', async () => {
    const f = await setup();
    expect(await code(request(sql, { ...f, start: at(0), subject: 'science' }))).toBe('23514');
    const unlinked = await teacher();
    expect(await code(request(sql, { ...f, t: unlinked, start: at(0) }))).toBe('23514');
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${f.t}`;
    expect(await code(request(sql, { ...f, start: at(60) }))).toBe('23514');
  });

  it('one open request per child, teacher and start, whichever parent asks; at most 10 per parent', async () => {
    const f = await setup();
    await request(sql, { ...f, start: at(0) });
    expect(await code(request(sql, { ...f, parent: f.parent2, start: at(0) }))).toBe('23505');
    for (let i = 1; i < 10; i++) await request(sql, { ...f, start: at(i * 60) });
    expect(await message(request(sql, { ...f, start: at(600) }))).toMatch(/at most 10/);
    await request(sql, { ...f, parent: f.parent2, start: at(600) });
  });

  it('the request can never be edited', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0) });
    for (const change of [
      sql`UPDATE lessons SET starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' WHERE id = ${id}`,
      sql`UPDATE lessons SET subject = 'science' WHERE id = ${id}`,
      sql`UPDATE lessons SET reply_deadline = reply_deadline + interval '1 minute' WHERE id = ${id}`,
      sql`UPDATE lessons SET requested_by = ${f.parent2} WHERE id = ${id}`,
    ])
      expect(await code(change)).toBe('23514');
  });

  it('only the allowed status changes', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0) });
    await confirm(id);
    for (const s of ['requested', 'declined', 'withdrawn', 'expired'])
      expect(await code(sql`UPDATE lessons SET status = ${s}, closed_by = 'aa_pro' WHERE id = ${id}`)).toBe('23514');
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${id}`;
    expect(await code(confirm(id))).toBe('23514');
    const w = await request(sql, { ...f, start: at(120) });
    await sql`UPDATE lessons SET status = 'withdrawn', closed_by = 'parent', closed_by_account = ${f.parent2} WHERE id = ${w}`;
    expect(await code(confirm(w))).toBe('23514');
    const d = await request(sql, { ...f, start: at(240) });
    expect(
      await code(
        sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${d}`,
      ),
    ).toBe('23514');
    // A request that is not yet overdue cannot be expired.
    expect(await code(sql`UPDATE lessons SET status = 'expired', closed_by = 'aa_pro' WHERE id = ${d}`)).toBe('23514');
  });

  it('declines: by the lesson teacher only, or by AA Pro with a reason', async () => {
    const f = await setup();
    const a = await request(sql, { ...f, start: at(0) });
    const other = await teacher();
    expect(
      await code(
        sql`UPDATE lessons SET status = 'declined', closed_by = 'teacher', closed_by_account = ${other} WHERE id = ${a}`,
      ),
    ).toBe('42501');
    await sql`UPDATE lessons SET status = 'declined', closed_by = 'teacher', closed_by_account = ${f.t}, close_note = 'Away that week' WHERE id = ${a}`;
    const b = await request(sql, { ...f, start: at(60) });
    expect(await code(sql`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro' WHERE id = ${b}`)).toBe('23514');
    await sql`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free' WHERE id = ${b}`;
  });

  it('a parent whose link was revoked cannot withdraw; the other parent can', async () => {
    const f = await setup();
    const a = await request(sql, { ...f, start: at(0) });
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE parent_id = ${f.parent} AND student_id = ${f.child}`;
    expect(
      await code(
        sql`UPDATE lessons SET status = 'withdrawn', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${a}`,
      ),
    ).toBe('42501');
    await sql`UPDATE lessons SET status = 'withdrawn', closed_by = 'parent', closed_by_account = ${f.parent2} WHERE id = ${a}`;
  });

  it('confirming re-checks the teacher link at that moment', async () => {
    const f = await setup();
    const a = await request(sql, { ...f, start: at(0) });
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE teacher_id = ${f.t} AND student_id = ${f.child}`;
    expect(await code(confirm(a))).toBe('23514');
  });
});

// ---------------------------------------------------------------------------------------------
describe('M1 no overlaps between confirmed lessons', () => {
  it('teacher: overlapping times for two children are refused; back-to-back is fine; overlapping requests may coexist', async () => {
    const f = await setup();
    const o2 = await otherChild(f.t);
    const o3 = await otherChild(f.t);
    const a = await request(sql, { ...f, start: at(0), minutes: 40 }); // 10:00-10:40
    const b = await request(sql, { ...o2, t: f.t, start: at(30), minutes: 30 }); // 10:30-11:00: 10 minutes overlap
    const c = await request(sql, { ...o3, t: f.t, start: at(60), minutes: 30 }); // 11:00-11:30
    await confirm(a);
    expect(await code(confirm(b))).toBe('23P01');
    expect(await status(b)).toBe('requested');
    await confirm(c);
    const d = await request(sql, { ...o2, t: f.t, start: at(90), minutes: 30 }); // 11:30, touching c's end
    await confirm(d);
  });

  it('child: two teachers cannot both be confirmed at overlapping times', async () => {
    const f = await setup();
    const t2 = await teacher();
    await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${f.child}`;
    await activeLink(sql, { teacher: t2, child: f.child, parent: f.parent, subjects: ['science'] });
    const a = await request(sql, { ...f, start: at(0), minutes: 40 });
    const b = await request(sql, { ...f, t: t2, subject: 'science', start: at(30), minutes: 30 });
    await confirm(a);
    expect(await code(confirm(b))).toBe('23P01');
  });

  it('a cancelled lesson frees the time again', async () => {
    const f = await setup();
    const o2 = await otherChild(f.t);
    const a = await request(sql, { ...f, start: at(0) });
    const b = await request(sql, { ...o2, t: f.t, start: at(0) });
    await confirm(a);
    expect(await code(confirm(b))).toBe('23P01');
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'teacher', closed_by_account = ${f.t} WHERE id = ${a}`;
    await confirm(b);
  });

  it('concurrent: 8 requests for the same time confirmed at the same moment on 8 connections -> exactly one wins', async () => {
    const f = await setup();
    const ids = [await request(sql, { ...f, start: at(0) })];
    for (let i = 1; i < 8; i++) {
      const o = await otherChild(f.t);
      ids.push(await request(sql, { ...o, t: f.t, start: at(0) }));
    }
    const pools = ids.map(() => testDb());
    const results = await Promise.allSettled(
      ids.map((id, i) =>
        pools[i]!.begin(async (tx) => {
          await tx`SELECT pg_sleep(0.2)`;
          await tx`UPDATE lessons SET status = 'confirmed' WHERE id = ${id}`;
          await tx`SELECT pg_sleep(0.2)`;
        }),
      ),
    );
    await Promise.all(pools.map((p) => p.end()));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const codes = results.flatMap((r) => (r.status === 'rejected' ? [(r.reason as { code?: string }).code] : []));
    expect(codes).toEqual(Array(7).fill('23P01'));
    const [n] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM lessons WHERE teacher_id = ${f.t} AND status = 'confirmed'`;
    expect(n!.n).toBe(1);
  });

  it('concurrent: the same request sent by both parents at once -> one request', async () => {
    const f = await setup();
    const [a, b] = [testDb(), testDb()];
    const results = await Promise.allSettled(
      [a, b].map((db, i) =>
        db.begin(async (tx) => {
          await tx`SELECT pg_sleep(0.1)`;
          await request(tx as unknown as Db, { ...f, parent: i ? f.parent2 : f.parent, start: at(0) });
          await tx`SELECT pg_sleep(0.2)`;
        }),
      ),
    );
    await Promise.all([a.end(), b.end()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.flatMap((r) => (r.status === 'rejected' ? [(r.reason as { code?: string }).code] : []))).toEqual([
      '23505',
    ]);
  });

  it('concurrent: 12 requests by one parent at once -> exactly 10 accepted', async () => {
    const f = await setup();
    const pools = Array.from({ length: 12 }, () => testDb());
    const results = await Promise.allSettled(
      pools.map((db, i) =>
        db.begin(async (tx) => {
          await tx`SELECT pg_sleep(0.1)`;
          await request(tx as unknown as Db, { ...f, start: at(i * 60) });
          await tx`SELECT pg_sleep(0.1)`;
        }),
      ),
    );
    await Promise.all(pools.map((p) => p.end()));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    const [n] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM lessons WHERE requested_by = ${f.parent} AND status = 'requested'`;
    expect(n!.n).toBe(10);
  });
});

// ---------------------------------------------------------------------------------------------
describe('M1 the 30-minute cancellation cut-off', () => {
  it('real clock: 32 minutes before the start is allowed; 29 minutes is refused; AA Pro may still cancel', async () => {
    const f = await setup();
    const g = await setup();
    const m = Math.floor((await dbNow()) / MIN) * MIN;
    const q = new Date(m - 3 * DAY);
    const a = await raw({ ...f, start: new Date(m + 32 * MIN), requestedAt: q, status: 'confirmed' });
    const b = await raw({ ...g, start: new Date(m + 29 * MIN), requestedAt: q, status: 'confirmed' });
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${a}`;
    expect(
      await code(
        sql`UPDATE lessons SET status = 'cancelled', closed_by = 'teacher', closed_by_account = ${g.t} WHERE id = ${b}`,
      ),
    ).toBe('23514');
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'aa_pro', close_reason = 'teacher_deactivated' WHERE id = ${b}`;
    expect(await status(b)).toBe('cancelled');
  });

  it('exact boundary (CHECK tried at fixed instants): 30:00 allowed, 29:59.999 refused, after start refused', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0) });
    await confirm(id);
    // The update trigger stamps closed_at with now(); to try exact instants it is skipped for this
    // one rolled-back transaction only (session setting, the table is not altered).
    const tried = await sql
      .begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        const out: string[] = [];
        const tryAt = async (closedAt: string, by = 'parent', reason: string | null = null) => {
          await tx`SAVEPOINT s`;
          try {
            await tx`UPDATE lessons SET status = 'cancelled', closed_by = ${by}, close_reason = ${reason},
                     closed_at = starts_at + ${closedAt}::interval WHERE id = ${id}`;
            out.push('ok');
          } catch (e) {
            out.push((e as { code?: string }).code ?? 'err');
          }
          await tx`ROLLBACK TO SAVEPOINT s`;
        };
        await tryAt('-30 minutes');
        await tryAt('-29 minutes -59.999 seconds');
        await tryAt('1 minute');
        await tryAt('29 minutes', 'aa_pro', 'link_ended');
        await tryAt('30 minutes', 'aa_pro', 'link_ended');
        throw Object.assign(new Error('rollback'), { out });
      })
      .catch((e: { out?: string[] }) => e.out);
    expect(tried).toEqual(['ok', '23514', '23514', 'ok', '23514']);
    expect(await status(id)).toBe('confirmed'); // nothing from the boundary trial was kept
  });
});

// ---------------------------------------------------------------------------------------------
describe('M1 outcome, notifications and deletion', () => {
  it('outcome: not before the end, not on a request', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0) });
    await confirm(id);
    expect(await code(sql`UPDATE lessons SET outcome = 'taught' WHERE id = ${id}`)).toBe('23514');
    const r = await request(sql, { ...f, start: at(120) });
    expect(await code(sql`UPDATE lessons SET outcome = 'taught' WHERE id = ${r}`)).toBe('23514');
  });

  it('outcome after the end: recorded once, with the database time', async () => {
    const f = await setup();
    const start = new Date(Math.floor((await dbNow()) / MIN) * MIN - 2 * HOUR);
    const id = await raw({ ...f, start, requestedAt: new Date(start.getTime() - 3 * DAY), status: 'confirmed' });
    await sql`UPDATE lessons SET outcome = 'taught', outcome_at = '2001-01-01' WHERE id = ${id}`;
    const [r] = await sql<
      { o: string; fresh: boolean }[]
    >`SELECT outcome AS o, outcome_at > now() - interval '1 minute' AS fresh FROM lessons WHERE id = ${id}`;
    expect(r).toEqual({ o: 'taught', fresh: true });
    expect(await code(sql`UPDATE lessons SET outcome = 'not_taken_place' WHERE id = ${id}`)).toBe('23514');
  });

  it("'lesson' notifications are accepted and existing kinds still are", async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0) });
    // Rolled back afterwards: CR-16's AC-51 check expects no lesson notifications until PR 2's code.
    const out = await sql
      .begin(async (tx) => {
        const results: string[] = [];
        for (const [type, entity] of [
          ['lesson_requested', 'lesson'],
          ['assignment_set', 'assignment'],
          ['x_y_z', 'lessons'],
        ]) {
          await tx`SAVEPOINT s`;
          results.push(
            await code(tx`INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
                          VALUES (${f.t}, 'action', ${type!}, 'Test', '/teacher', ${entity!}, ${id}, ${`${type}:${id}:${uniq()}`})`),
          );
          await tx`ROLLBACK TO SAVEPOINT s`;
        }
        throw Object.assign(new Error('rollback'), { results });
      })
      .catch((e: { results?: string[] }) => e.results);
    expect(out).toEqual(['ok', 'ok', '23514']);
  });

  it('deleting a parent keeps the lesson history; deleting the teacher removes their lessons', async () => {
    const f = await setup();
    const id = await request(sql, { ...f, start: at(0) });
    await sql`DELETE FROM accounts WHERE id = ${f.parent}`;
    expect((await row(id)).requested_by).toBeNull();
    await sql`DELETE FROM accounts WHERE id = ${f.t}`;
    expect(await sql`SELECT 1 FROM lessons WHERE id = ${id}`).toHaveLength(0);
  });
});
