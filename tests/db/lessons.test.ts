import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { setAccountActive } from '@/server/admin';
import {
  answerLesson,
  bookingOptions,
  cancelLesson,
  defaultLessonMinutes,
  type FreeTime,
  freeTimes,
  lessonMaintenance,
  lessonsForParent,
  lessonsForStudent,
  lessonsForTeacher,
  recordOutcome,
  requestLesson,
  validMinutes,
  withdrawLesson,
} from '@/server/lessons';
import { actionLabel, loadViewer, mayStillSee, type StoredNotification } from '@/server/notifications/access';
import { getPublicListing } from '@/server/publicListings';
import { removeTeacher, updateTeacherLinks } from '@/server/teacherLinks';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-17 PR 2: lesson booking from the server side, on the throw-away database (synthetic data
 * only). Each describe block follows the PR 2 acceptance criteria in CR-17 §4 and the scope
 * document: lengths, linked teachers only, free times and time zones, overlaps and racing
 * accepts, expiry without a scheduler, the 30-minute cut-off, authorisation, AA Pro closes and
 * in-app notifications. Time-dependent rules use the database clock, as in production.
 */
const sql = testDb();
afterAll(() => sql.end());
afterEach(async () => {
  // Fixtures never leave the table's triggers off (they use a session setting, not ALTER TABLE).
  const t = await sql<{ e: string }[]>`
    SELECT tgenabled AS e FROM pg_trigger WHERE tgrelid = 'lessons'::regclass AND NOT tgisinternal`;
  expect(t.map((r) => r.e)).toEqual(['O', 'O', 'O']);
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Three days ahead, 10:00 UTC: on the grid and inside the booking window. */
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR);
const at = (offsetMin: number) => new Date(BASE.getTime() + offsetMin * MIN);

async function teacher(opts: { zone?: string; usual?: Array<[number, number, number]>; name?: string } = {}) {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = ${opts.zone ?? 'UTC'}, display_name = ${opts.name ?? 'Ms Rao'} WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  const rows = opts.usual ?? [1, 2, 3, 4, 5, 6, 7].map((d) => [d, 0, 1440] as [number, number, number]);
  for (const [d, s, e] of rows)
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, ${s}, ${e})`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', 60000, 30)`;
  return id;
}

/** Two parents of one child (named Kiran), linked to a teacher in maths. */
async function family(t?: string, childName = 'Kiran') {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET display_name = 'Anita Shah' WHERE id = ${parent}`;
  await sql`UPDATE accounts SET display_name = 'Ravi Shah' WHERE id = ${parent2}`;
  const child = await createChild(sql, parent);
  await sql`UPDATE accounts SET display_name = ${childName} WHERE id = ${child}`;
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher());
  await activeLink(sql, { teacher: tid, child, parent, subjects: ['maths'] });
  return { parent, parent2, child, t: tid };
}

/** What the booking page sends: the chosen time and the listed price it showed (INR 600 an hour). */
const price = (start: Date, minutes = 30) => ({
  priceMinor: String(Math.floor((60000 * minutes * 2 + 60) / 120)),
  currency: 'INR',
  basis: 'listed',
  startsAt: start.toISOString(),
  minutes: String(minutes),
});

async function ask(f: { parent: string; child: string; t: string }, start: Date, minutes = 30, extra: object = {}) {
  return requestLesson(sql, f.parent, {
    childId: f.child,
    teacherId: f.t,
    subject: 'maths',
    ...price(start, minutes),
    ...extra,
  });
}
async function asked(f: { parent: string; child: string; t: string }, start: Date, minutes = 30) {
  const r = await ask(f, start, minutes);
  if (!r.ok) throw new Error(`request refused: ${r.reason}`);
  return r.id;
}

/** A fixture row that must lie in the past or near now: triggers skipped for that transaction only. */
async function raw(
  f: { t: string; child: string; parent: string },
  start: Date,
  requestedAt: Date,
  status = 'requested',
) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${f.parent}, 'maths', s, 30, s + interval '30 minutes', q,
             LEAST(q + interval '48 hours', s - interval '2 hours'), ${status},
             CASE WHEN ${status} = 'confirmed' THEN q + interval '1 minute' END, 'INR', 60000, 30000, 'listed'
      FROM (SELECT ${start}::timestamptz AS s, ${requestedAt}::timestamptz AS q) x
      RETURNING id`;
    return r!.id;
  });
}

const notes = (recipient: string, lesson?: string) =>
  sql<Array<{ type: string; kind: string; title: string; body: string; href: string }>>`
    SELECT type, kind, title, body, href FROM notifications
    WHERE recipient_id = ${recipient} AND entity_type = 'lesson' ${lesson ? sql`AND entity_id = ${lesson}` : sql``}
    ORDER BY created_at, type`;
const row = async (id: string) => (await sql<Record<string, unknown>[]>`SELECT * FROM lessons WHERE id = ${id}`)[0]!;
const dbNow = async () => (await sql<{ t: Date }[]>`SELECT now() AS t`)[0]!.t.getTime();

// ---------------------------------------------------------------------------------------------
describe('PR 2: who can be booked, and the request', () => {
  it('only an approved, active teacher linked to the child in a ticked subject is offered and accepted', async () => {
    const f = await family();
    const other = await teacher();
    const [kid] = await bookingOptions(sql, f.parent);
    expect(kid!.teachers.map((t) => [t.id, t.subjects])).toEqual([[f.t, ['maths']]]);
    expect((await ask(f, at(0), 30, { subject: 'science' })).ok).toBe(false);
    expect(await ask({ ...f, t: other }, at(0))).toEqual({ ok: false, reason: 'not_linked' });
    await sql`UPDATE accounts SET status = 'suspended' WHERE id = ${f.t}`;
    expect(await ask(f, at(0))).toEqual({ ok: false, reason: 'not_linked' });
  });

  it('10 and 40 minutes are accepted; 9 and 41 are refused by the server', async () => {
    const f = await family();
    expect((await ask(f, at(0), 10)).ok).toBe(true);
    expect((await ask(f, at(60), 40)).ok).toBe(true);
    expect(await ask(f, at(120), 9)).toEqual({ ok: false, reason: 'invalid' });
    expect(await ask(f, at(180), 41)).toEqual({ ok: false, reason: 'invalid' });
    // Lengths must be 5-minute steps: 27 is refused by the server, and 0029 refuses it again.
    expect(await ask(f, at(240), 27)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('the default length is the teacher’s listed length, rounded down to a 5-minute step (32 -> 30)', () => {
    expect([10, 12, 25, 30, 32, 39, 40].map((m) => defaultLessonMinutes(m))).toEqual([10, 10, 25, 30, 30, 35, 40]);
    expect(defaultLessonMinutes(null)).toBeNull();
    for (const m of [10, 12, 25, 30, 32, 39, 40]) expect(validMinutes(defaultLessonMinutes(m)!)).toBe(true);
  });

  it('times outside usual times, inside the notice or beyond 4 weeks are refused', async () => {
    const f = await family(await teacher({ usual: [[((BASE.getUTCDay() + 6) % 7) + 1, 600, 660]] }));
    expect((await ask(f, at(0))).ok).toBe(true); // 10:00, inside 10:00-11:00
    expect(await ask(f, at(60))).toEqual({ ok: false, reason: 'usual_times' });
    expect(await ask(f, at(15))).toEqual({ ok: false, reason: 'usual_times' }); // off the grid
    const g = await family();
    const now = await dbNow();
    expect(await ask(g, new Date(Math.floor((now + DAY) / (30 * MIN)) * 30 * MIN))).toEqual({
      ok: false,
      reason: 'notice',
    });
    expect(await ask(g, new Date(Math.ceil((now + 28 * DAY + MIN) / (30 * MIN)) * 30 * MIN))).toEqual({
      ok: false,
      reason: 'window',
    });
  });

  it('a time overlapping a confirmed lesson of the teacher or the child is refused (1-minute overlap); touching is fine', async () => {
    const f = await family();
    const a = await asked(f, at(0), 40);
    expect(await answerLesson(sql, f.t, a, 'accept')).toEqual({ ok: true });
    const g = await family(f.t, 'Meera');
    expect(await ask(g, at(30), 30)).toEqual({ ok: false, reason: 'busy' }); // 10:30, a ends 10:40
    expect((await ask(g, at(60), 30)).ok).toBe(true);
    const other = await teacher();
    await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['maths'] });
    expect(await ask({ ...f, t: other }, at(30), 30)).toEqual({ ok: false, reason: 'busy' }); // the child is busy
  });

  it('the same child, teacher and time twice is refused, whichever parent asks; an 11th open request is refused', async () => {
    const f = await family();
    await asked(f, at(0));
    expect(await ask({ ...f, parent: f.parent2 }, at(0))).toEqual({ ok: false, reason: 'duplicate' });
    for (let i = 1; i < 10; i += 1) await asked(f, at(i * 60));
    expect(await ask(f, at(600))).toEqual({ ok: false, reason: 'limit' });
  });

  it('a price that no longer matches is refused, so the parent sees the new price first', async () => {
    const f = await family();
    expect(await ask(f, at(0), 30, { priceMinor: '1' })).toEqual({ ok: false, reason: 'price_changed' });
    await sql`UPDATE teacher_listings SET hourly_rate_minor = 90000 WHERE teacher_id = ${f.t}`;
    expect(await ask(f, at(0))).toEqual({ ok: false, reason: 'price_changed' });
    const free = await freeTimes(sql, f.parent, {
      childId: f.child,
      teacherId: f.t,
      subject: 'maths',
      minutes: 30,
      parentZone: 'UTC',
    });
    if (!free.ok) throw new Error(free.reason);
    const t: FreeTime = free.days.at(-1)!.times[0]!;
    expect(t.priceMinor).toBe(45000);
    const r = await ask(f, t.startsAt, 30, { priceMinor: String(t.priceMinor) });
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('PR 2: paused and withdrawn public listings (owner decision, 24 Oct 2026 00:48 IST)', () => {
  /** Sets the teacher's public listing to paused or withdrawn, as the listing page does. */
  async function listing(t: string, status: 'paused' | 'withdrawn') {
    if (status === 'paused') {
      await sql`UPDATE teacher_listings SET status = 'paused', published = '{}'::jsonb, published_at = now(),
                 expires_at = now() + interval '30 days', consent_at = now(), consent_version = 'test'
               WHERE teacher_id = ${t}`;
    } else {
      await sql`UPDATE teacher_listings SET status = 'withdrawn', published = NULL, published_at = NULL, expires_at = NULL,
                 consent_at = NULL, consent_version = NULL WHERE teacher_id = ${t}`;
    }
    const [l] = await sql<{ public_id: string }[]>`SELECT public_id FROM teacher_listings WHERE teacher_id = ${t}`;
    return l!.public_id;
  }

  for (const status of ['paused', 'withdrawn'] as const) {
    it(`${status}: an already-linked family can still see free times and book; the listing is hidden from new families`, async () => {
      const f = await family();
      const publicId = await listing(f.t, status);
      expect(await getPublicListing(sql, publicId)).toBeNull(); // not discoverable through the listing
      const free = await freeTimes(sql, f.parent, {
        childId: f.child,
        teacherId: f.t,
        subject: 'maths',
        minutes: 30,
        parentZone: 'UTC',
      });
      expect(free.ok && free.days.length > 0).toBe(true);
      const id = await asked(f, at(0));
      expect(await answerLesson(sql, f.t, id, 'accept')).toEqual({ ok: true });
      // The teacher's account and links are untouched by the listing status.
      const [a] = await sql<{ status: string; links: number }[]>`
        SELECT a.status, (SELECT count(*)::int FROM teacher_student_links WHERE teacher_id = a.id AND status = 'active') AS links
        FROM accounts a WHERE a.id = ${f.t}`;
      expect(a).toEqual({ status: 'active', links: 1 });
    });

    it(`${status}: a new family (no active link) can neither see the teacher as bookable nor request a lesson`, async () => {
      const f = await family();
      await listing(f.t, status);
      const stranger = await createAdult(sql, 'parent');
      const child = await createChild(sql, stranger);
      expect((await bookingOptions(sql, stranger))[0]!.teachers).toEqual([]);
      expect(await ask({ parent: stranger, child, t: f.t }, at(0))).toEqual({ ok: false, reason: 'not_linked' });
      const free = await freeTimes(sql, stranger, {
        childId: child,
        teacherId: f.t,
        subject: 'maths',
        minutes: 30,
        parentZone: 'UTC',
      });
      expect(free).toEqual({ ok: false, reason: 'not_linked' });
    });
  }

  it('a linked family is blocked once the teacher is deactivated or the link ends, whatever the listing says', async () => {
    const f = await family();
    await listing(f.t, 'paused');
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE teacher_id = ${f.t}`;
    expect(await ask(f, at(0))).toEqual({ ok: false, reason: 'not_linked' });
    const g = await family();
    await listing(g.t, 'withdrawn');
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${g.t}`;
    expect(await ask(g, at(0))).toEqual({ ok: false, reason: 'not_linked' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('PR 2: free start times and time zones', () => {
  it('grid times inside the usual time, minus confirmed lessons and already requested times', async () => {
    const wd = ((BASE.getUTCDay() + 6) % 7) + 1;
    const f = await family(await teacher({ usual: [[wd, 600, 720]] })); // 10:00-12:00 UTC
    const q = { childId: f.child, teacherId: f.t, subject: 'maths', minutes: 40, parentZone: 'UTC' };
    const day = async () => {
      const r = await freeTimes(sql, f.parent, q);
      if (!r.ok) throw new Error(r.reason);
      return r.days
        .find((d) => d.date === BASE.toISOString().slice(0, 10))
        ?.times.map((t) => t.startsAt.toISOString().slice(11, 16));
    };
    expect(await day()).toEqual(['10:00', '10:30', '11:00']); // 11:30 + 40 min would end after 12:00
    await answerLesson(sql, f.t, await asked(f, at(0), 25), 'accept'); // 10:00-10:25 confirmed
    const g = await family(f.t, 'Meera');
    const r = await freeTimes(sql, g.parent, { ...q, childId: g.child });
    expect(
      r.ok &&
        r.days
          .find((d) => d.date === BASE.toISOString().slice(0, 10))
          ?.times.map((t) => t.startsAt.toISOString().slice(11, 16)),
    ).toEqual(['10:30', '11:00']);
    await asked(f, at(60), 40);
    expect(await day()).toEqual(['10:30']); // 11:00 now requested by this family; 10:00 overlaps their own confirmed lesson
    // U2 (F8): the day says how many times are hidden because this child already asked for them, for
    // either parent of the child, but never for another family.
    const hidden = async (parent: string, child: string) => {
      const x = await freeTimes(sql, parent, { ...q, childId: child });
      return x.ok ? x.days.find((d) => d.date === BASE.toISOString().slice(0, 10))?.alreadyRequested : undefined;
    };
    expect(await hidden(f.parent, f.child)).toBe(1);
    expect(await hidden(f.parent2, f.child)).toBe(1);
    expect(await hidden(g.parent, g.child)).toBe(0);
  });

  it('a London teacher and an India parent across the end of British Summer Time (25 Oct 2026)', async () => {
    // Mondays 16:00-17:00 London time. 19 Oct is BST (UTC+1), 26 Oct is GMT (UTC+0).
    const f = await family(await teacher({ zone: 'Europe/London', usual: [[1, 960, 1020]] }));
    const q = { childId: f.child, teacherId: f.t, subject: 'maths', minutes: 30, parentZone: 'Asia/Kolkata' };
    const r = await freeTimes(sql, f.parent, q, new Date('2026-10-17T00:00:00Z'));
    if (!r.ok) throw new Error(r.reason);
    const all = r.days.flatMap((d) => d.times.map((t) => t.startsAt.toISOString()));
    expect(all.slice(0, 4)).toEqual([
      '2026-10-19T15:00:00.000Z', // 16:00 BST = 20:30 IST
      '2026-10-19T15:30:00.000Z',
      '2026-10-26T16:00:00.000Z', // 16:00 GMT = 21:30 IST
      '2026-10-26T16:30:00.000Z',
    ]);
    expect(r.days.map((d) => d.date).slice(0, 2)).toEqual(['2026-10-19', '2026-10-26']);
    // The database agrees with the same instants (its own rule, independent of the clock).
    const [x] = await sql<{ a: boolean; b: boolean; c: boolean }[]>`
      SELECT lessons_in_usual_time(${f.t}, '2026-10-19T15:00Z', 30) AS a,
             lessons_in_usual_time(${f.t}, '2026-10-26T16:00Z', 30) AS b,
             lessons_in_usual_time(${f.t}, '2026-10-26T15:00Z', 30) AS c`;
    expect(x).toEqual({ a: true, b: true, c: false });
  });

  it('prices: the agreed rate inside its slot, the listed rate elsewhere', async () => {
    const wd = ((BASE.getUTCDay() + 6) % 7) + 1;
    const f = await family();
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO rate_negotiations (parent_id, teacher_id, listing_public_id, child_id, child_key, grade, subject,
                 model, kind, slot, currency, asking_amount_minor, asking_minutes, status, turn, expires_at, ended_at,
                 ended_by, agreed_amount_minor, agreed_minutes)
               VALUES (${f.parent}, ${f.t}, ${`t-${uniq()}ab`}, ${f.child}, ${`child:${f.child}`}, 5, 'maths', 'hourly',
                 'hourly', ${sql.json({ weekday: wd, start: 600, end: 660, timeZone: 'UTC' })}, 'INR', 60000, 30,
                 'accepted', NULL, now() + interval '7 days', now(), 'parent', 48000, 30)`;
    });
    const r = await freeTimes(sql, f.parent, {
      childId: f.child,
      teacherId: f.t,
      subject: 'maths',
      minutes: 30,
      parentZone: 'UTC',
    });
    if (!r.ok) throw new Error(r.reason);
    const day = r.days.find((d) => d.date === BASE.toISOString().slice(0, 10))!;
    const pick = (hhmm: string) => day.times.find((t) => t.startsAt.toISOString().slice(11, 16) === hhmm)!;
    expect(pick('10:00')).toMatchObject({ basis: 'agreed', rateMinor: 48000, priceMinor: 24000 });
    expect(pick('11:00')).toMatchObject({ basis: 'listed', rateMinor: 60000, priceMinor: 30000 });
    const t = pick('10:30');
    expect(t.basis).toBe('agreed');
    const ok = await ask(f, t.startsAt, 30, { priceMinor: String(t.priceMinor), basis: 'agreed' });
    expect(ok.ok).toBe(true);
    expect((await row((ok as { id: string }).id)).price_basis).toBe('agreed');
  });
});

// ---------------------------------------------------------------------------------------------
describe('PR 2: accept, decline, withdraw, and racing accepts', () => {
  it('accepting closes overlapping open requests (same teacher, or same child with another teacher) as "time no longer free"', async () => {
    const f = await family();
    const g = await family(f.t, 'Meera');
    const other = await teacher({ name: 'Mr Iyer' });
    await sql`UPDATE teacher_student_links SET subjects = ${['maths']} WHERE student_id = ${f.child}`;
    await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['maths'] });
    const mine = await asked(f, at(0), 40);
    const sameTeacher = await asked(g, at(30), 30);
    const sameChild = await asked({ ...f, t: other }, at(30), 30);
    const later = await asked(g, at(60), 30); // touches the end: stays open
    expect(await answerLesson(sql, f.t, mine, 'accept')).toEqual({ ok: true });
    for (const id of [sameTeacher, sameChild]) {
      expect(await row(id)).toMatchObject({
        status: 'declined',
        closed_by: 'aa_pro',
        close_reason: 'time_no_longer_free',
      });
    }
    expect((await row(later)).status).toBe('requested');
    expect(await answerLesson(sql, f.t, sameTeacher, 'accept')).toEqual({ ok: false, reason: 'time_taken' });
    // Meera's parents and the other teacher are told; the accepting teacher is not told about their own act.
    expect((await notes(g.parent, sameTeacher)).map((n) => n.type)).toEqual(['lesson_time_no_longer_free']);
    expect((await notes(other, sameChild)).map((n) => n.type)).toEqual([
      'lesson_requested',
      'lesson_time_no_longer_free',
    ]);
    expect((await notes(f.t, sameTeacher)).map((n) => n.type)).toEqual(['lesson_requested']);
  });

  it('two teachers accept overlapping requests for one child at the same moment: exactly one wins', async () => {
    for (let round = 0; round < 5; round += 1) {
      const f = await family();
      const other = await teacher();
      await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['maths'] });
      const a = await asked(f, at(round * 120), 40);
      const b = await asked({ ...f, t: other }, at(round * 120 + 30), 30);
      const [x, y] = [testDb(), testDb()];
      const results = await Promise.all([answerLesson(x, f.t, a, 'accept'), answerLesson(y, other, b, 'accept')]);
      await Promise.all([x.end(), y.end()]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'time_taken' }]);
      const statuses = [(await row(a)).status, (await row(b)).status].sort();
      expect(statuses).toEqual(['confirmed', 'declined']);
    }
  });

  it('one teacher accepts two overlapping requests at once from two tabs: exactly one wins', async () => {
    const f = await family();
    const g = await family(f.t, 'Meera');
    const a = await asked(f, at(0), 30);
    const b = await asked(g, at(0), 30);
    const [x, y] = [testDb(), testDb()];
    const results = await Promise.all([answerLesson(x, f.t, a, 'accept'), answerLesson(y, f.t, b, 'accept')]);
    await Promise.all([x.end(), y.end()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'time_taken' });
  });

  it('decline with a note; withdraw by either parent; answers after closing are refused', async () => {
    const f = await family();
    const a = await asked(f, at(0));
    expect(await answerLesson(sql, f.t, a, 'decline', 'Away that week')).toEqual({ ok: true });
    expect(await row(a)).toMatchObject({ status: 'declined', closed_by: 'teacher', close_note: 'Away that week' });
    expect(await answerLesson(sql, f.t, a, 'accept')).toEqual({ ok: false, reason: 'closed' });
    const b = await asked(f, at(60));
    expect(await withdrawLesson(sql, f.parent2, b)).toEqual({ ok: true });
    expect(await answerLesson(sql, f.t, b, 'accept')).toEqual({ ok: false, reason: 'closed' });
    expect((await notes(f.t, b)).map((n) => n.type)).toEqual(['lesson_requested', 'lesson_withdrawn']);
    expect((await notes(f.parent, b)).map((n) => n.type)).toEqual(['lesson_withdrawn']);
  });

  it('accepting re-checks the usual times: removed availability closes the request as "time no longer free"', async () => {
    const f = await family();
    const a = await asked(f, at(0));
    await sql`DELETE FROM teacher_usual_times WHERE teacher_id = ${f.t}`;
    expect(await answerLesson(sql, f.t, a, 'accept')).toEqual({ ok: false, reason: 'time_taken' });
    expect(await row(a)).toMatchObject({
      status: 'declined',
      closed_by: 'aa_pro',
      close_reason: 'time_no_longer_free',
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('PR 2: expiry without a scheduler (D3A-5)', () => {
  it('an overdue request shows as expired at once, cannot be accepted, and the sweep tells both sides once', async () => {
    const f = await family();
    const id = await raw(f, at(0), new Date(Date.now() - 3 * DAY));
    expect((await lessonsForParent(sql, f.parent)).find((l) => l.id === id)).toMatchObject({
      status: 'expired',
      canWithdraw: false,
    });
    expect((await lessonsForTeacher(sql, f.t)).find((l) => l.id === id)).toMatchObject({
      status: 'expired',
      canAnswer: false,
    });
    expect(await answerLesson(sql, f.t, id, 'accept')).toEqual({ ok: false, reason: 'expired' });
    expect(await withdrawLesson(sql, f.parent, id)).toEqual({ ok: false, reason: 'expired' });
    await lessonMaintenance(sql);
    await lessonMaintenance(sql);
    expect((await row(id)).status).toBe('expired');
    expect((await notes(f.t, id)).map((n) => n.type)).toEqual(['lesson_expired']);
    expect((await notes(f.parent, id)).map((n) => n.type)).toEqual(['lesson_expired']);
    expect((await notes(f.parent2, id)).map((n) => n.type)).toEqual(['lesson_expired']);
  });

  it('a request expired when the slot is requested again is also announced once by the sweep', async () => {
    const f = await family();
    const old = await raw(f, at(0), new Date(Date.now() - 3 * DAY));
    await asked({ ...f, parent: f.parent2 }, at(0));
    expect((await row(old)).status).toBe('expired');
    await lessonMaintenance(sql);
    expect((await notes(f.parent, old)).map((n) => n.type)).toEqual(['lesson_expired']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('PR 2: cancellation and outcome (OC-46, D3A-6, D3A-7)', () => {
  it('a child’s account can never request, withdraw or cancel a lesson (server functions and database)', async () => {
    // Owner review 24 Oct 2026 (14:47 IST), point 5: students cannot book or cancel human lessons.
    const f = await family();
    const start = at(3 * 60);
    const asChild = await requestLesson(sql, f.child, {
      childId: f.child,
      teacherId: f.t,
      subject: 'maths',
      ...price(start),
    });
    expect(asChild.ok).toBe(false);
    const open = await asked(f, start);
    expect(await withdrawLesson(sql, f.child, open)).toEqual({ ok: false, reason: 'not_found' });
    await answerLesson(sql, f.t, open, 'accept');
    expect(await cancelLesson(sql, { id: f.child, role: 'parent' }, open)).toEqual({ ok: false, reason: 'not_found' });
    expect(await cancelLesson(sql, { id: f.child, role: 'teacher' }, open)).toEqual({ ok: false, reason: 'not_found' });
    // The database refuses a request row whose requester is the child, whatever the code sends.
    let code = '';
    try {
      await sql`INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at,
                                     reply_deadline, currency, rate_minor, price_minor, price_basis)
                VALUES (${f.t}, ${f.child}, ${f.child}, 'maths', ${at(6 * 60)}, 30, ${at(6 * 60 + 30)}, now(),
                        'INR', 60000, 30000, 'listed')`;
    } catch (e) {
      code = (e as { code?: string }).code ?? '';
    }
    expect(code).toBe('42501'); // refused as "not allowed": only a parent of the child may request
    expect((await row(open)).status).toBe('confirmed');
  });

  it('cancel with at least 30 minutes left is allowed; with less, or after the start, refused (database clock)', async () => {
    const m = Math.floor((await dbNow()) / MIN) * MIN;
    const q = new Date(m - 3 * DAY);
    const f = await family();
    const g = await family();
    const a = await raw(f, new Date(m + 32 * MIN), q, 'confirmed');
    const b = await raw(g, new Date(m + 29 * MIN), q, 'confirmed');
    expect(await cancelLesson(sql, { id: f.parent, role: 'parent' }, a)).toEqual({ ok: true });
    expect(await cancelLesson(sql, { id: g.t, role: 'teacher' }, b)).toEqual({ ok: false, reason: 'too_late' });
    expect(await cancelLesson(sql, { id: g.parent2, role: 'parent' }, b)).toEqual({ ok: false, reason: 'too_late' });
    expect((await notes(f.t, a)).map((n) => n.type)).toEqual(['lesson_cancelled']);
    expect((await notes(f.parent2, a)).map((n) => n.type)).toEqual(['lesson_cancelled']);
    expect(await notes(f.parent, a)).toEqual([]); // the person who acted is not told
    // U3 (B3): who cancelled, as each viewer sees it. The other parent sees a first name only.
    const seen = async (list: Promise<Array<{ id: string; closedByYou: boolean; closedByName: string | null }>>) => {
      const l = (await list).find((x) => x.id === a)!;
      return { closedByYou: l.closedByYou, closedByName: l.closedByName };
    };
    expect(await seen(lessonsForParent(sql, f.parent))).toEqual({ closedByYou: true, closedByName: 'Anita' });
    expect(await seen(lessonsForParent(sql, f.parent2))).toEqual({ closedByYou: false, closedByName: 'Anita' });
    expect(await seen(lessonsForTeacher(sql, f.t))).toEqual({ closedByYou: false, closedByName: null });
    expect((await lessonsForStudent(sql, f.child)).some((x) => x.id === a)).toBe(false); // the child sees confirmed lessons only
  });

  it('the teacher records the outcome once, only after the end; the sweep asks for it once', async () => {
    const f = await family();
    const start = new Date(Math.floor((await dbNow()) / MIN) * MIN - 2 * HOUR);
    const done = await raw(f, start, new Date(start.getTime() - 3 * DAY), 'confirmed');
    const soon = await asked(f, at(0));
    await answerLesson(sql, f.t, soon, 'accept');
    expect(await recordOutcome(sql, f.t, soon, 'taught')).toEqual({ ok: false, reason: 'not_yet' });
    await lessonMaintenance(sql);
    await lessonMaintenance(sql);
    expect((await notes(f.t, done)).map((n) => [n.type, n.kind])).toEqual([['lesson_outcome_needed', 'action']]);
    const v = (await loadViewer(sql, f.t))!;
    const [n] = await sql<
      StoredNotification[]
    >`SELECT * FROM notifications WHERE recipient_id = ${f.t} AND entity_id = ${done}`;
    expect(await actionLabel(sql, v, n!, new Date())).toBe('Needs your reply');
    expect(await recordOutcome(sql, f.t, done, 'maybe')).toEqual({ ok: false, reason: 'invalid' });
    expect(await recordOutcome(sql, f.t, done, 'not_taken_place')).toEqual({ ok: true });
    expect(await recordOutcome(sql, f.t, done, 'taught')).toEqual({ ok: false, reason: 'done' });
    expect(await actionLabel(sql, v, n!, new Date())).toBe('Done');
  });
});

// ---------------------------------------------------------------------------------------------
describe('PR 2: who sees and does what', () => {
  it('another family, another teacher, an admin and the Super Admin get "not found" or nothing', async () => {
    const f = await family();
    const id = await asked(f, at(0));
    const stranger = await family();
    const otherTeacher = await teacher();
    const superadmin = await createAdult(sql, 'superadmin');
    expect(await withdrawLesson(sql, stranger.parent, id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await answerLesson(sql, otherTeacher, id, 'accept')).toEqual({ ok: false, reason: 'not_found' });
    expect(await answerLesson(sql, superadmin, id, 'accept')).toEqual({ ok: false, reason: 'not_found' });
    expect(await cancelLesson(sql, { id: f.child, role: 'parent' }, id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await lessonsForParent(sql, stranger.parent)).toEqual([]);
    expect(await lessonsForTeacher(sql, otherTeacher)).toEqual([]);
    expect(await lessonsForParent(sql, superadmin)).toEqual([]);
    // Notifications: only the lesson's teacher and the child's active parents may still see them.
    const [n] = await sql<
      StoredNotification[]
    >`SELECT * FROM notifications WHERE recipient_id = ${f.t} AND entity_id = ${id}`;
    expect(await mayStillSee(sql, (await loadViewer(sql, f.t))!, n!)).toBe(true);
    expect(await mayStillSee(sql, { id: otherTeacher, role: 'teacher', standing: 'full' }, n!)).toBe(false);
    expect(await mayStillSee(sql, { id: stranger.parent, role: 'parent', standing: 'full' }, n!)).toBe(false);
  });

  it("the teacher's notifications never name the child; a parent's do", async () => {
    const f = await family(undefined, 'Kiranjeet');
    const id = await asked(f, at(0));
    const [t] = await notes(f.t, id);
    expect(t).toMatchObject({ type: 'lesson_requested', kind: 'action', href: '/teacher/schedule' });
    expect(`${t!.title} ${t!.body}`).not.toContain('Kiranjeet');
    expect(t!.title).toMatch(
      /^New lesson request: Maths, Grade 5, \w{3} \d{1,2} \w{3}, \d{1,2}:\d{2} [ap]m \(30 min\)$/,
    );
    expect(t!.body).toContain('Anita');
    const [p] = await notes(f.parent2, id);
    expect(p!.title).toContain('Kiranjeet');
    expect(await notes(f.parent, id)).toEqual([]); // the requester is not told about their own request
  });

  it('the child sees their own confirmed lessons only, without prices or requests (D3A-23)', async () => {
    const f = await family();
    const a = await asked(f, at(0));
    const b = await asked(f, at(120));
    await answerLesson(sql, f.t, a, 'accept');
    const mine = await lessonsForStudent(sql, f.child);
    expect(mine.map((l) => l.id)).toEqual([a]);
    expect(mine[0]!.price).toBeNull();
    expect(mine[0]!.canCancel).toBe(false);
    expect((await lessonsForStudent(sql, (await family()).child)).map((l) => l.id)).not.toContain(b);
  });

  it('a parent whose link to the child was revoked loses access; the other parent keeps it', async () => {
    const f = await family();
    const id = await asked(f, at(0));
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE parent_id = ${f.parent2} AND student_id = ${f.child}`;
    expect(await lessonsForParent(sql, f.parent2)).toEqual([]);
    expect(await withdrawLesson(sql, f.parent2, id)).toEqual({ ok: false, reason: 'not_found' });
    expect((await lessonsForParent(sql, f.parent)).map((l) => l.id)).toEqual([id]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('PR 2: AA Pro closes (D3A-13, D3A-24)', () => {
  it('a teacher deactivated by an admin: open requests close, upcoming lessons are cancelled, parents told', async () => {
    const f = await family();
    const a = await asked(f, at(0));
    const b = await asked(f, at(120));
    await answerLesson(sql, f.t, b, 'accept');
    const owner = await createAdult(sql, 'superadmin');
    expect(await setAccountActive(sql, owner, f.t, { active: false, reason: 'Test deactivation' })).toEqual({
      ok: true,
    });
    expect(await row(a)).toMatchObject({
      status: 'declined',
      closed_by: 'aa_pro',
      close_reason: 'teacher_deactivated',
    });
    expect(await row(b)).toMatchObject({
      status: 'cancelled',
      closed_by: 'aa_pro',
      close_reason: 'teacher_deactivated',
    });
    const told = (await notes(f.parent)).map((n) => n.title);
    expect(told.some((t) => t.includes('cancelled: the teacher is no longer available'))).toBe(true);
  });

  // OC-53 Option A: lessons more than 30 minutes away (these are 3 days ahead) are cancelled; lessons
  // starting within 30 minutes stay (tests/db/keptLessons.test.ts).
  it('the parent removes the teacher or unticks the subject: lessons more than 30 minutes away close as "link ended"', async () => {
    const f = await family();
    const a = await asked(f, at(0));
    await answerLesson(sql, f.t, a, 'accept');
    expect(await removeTeacher(sql, f.parent, f.t)).toEqual({ ok: true });
    expect(await row(a)).toMatchObject({ status: 'cancelled', closed_by: 'aa_pro', close_reason: 'link_ended' });
    const g = await family();
    await sql`UPDATE teacher_student_links SET subjects = ${['maths', 'science']} WHERE student_id = ${g.child}`;
    const b = await asked(g, at(0));
    const r = await updateTeacherLinks(sql, g.parent, g.t, [{ childId: g.child, subjects: ['science'] }]);
    expect(r.ok).toBe(true);
    expect(await row(b)).toMatchObject({ status: 'declined', closed_by: 'aa_pro', close_reason: 'link_ended' });
  });

  it('any other path that ends a link is caught by the sweep', async () => {
    const f = await family();
    const a = await asked(f, at(0));
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE student_id = ${f.child}`;
    await lessonMaintenance(sql);
    expect(await row(a)).toMatchObject({ status: 'declined', closed_by: 'aa_pro', close_reason: 'link_ended' });
  });
});
