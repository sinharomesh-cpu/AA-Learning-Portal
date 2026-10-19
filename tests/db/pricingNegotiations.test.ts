import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { snapshotKey } from '@/lib/listing';
import {
  getTeacherOffers,
  type PackageInput,
  saveHourly,
  savePackage,
  setPricingV2,
  setSlotNegotiable,
} from '@/server/pricingModel';
import {
  answerRate,
  counterRate,
  listParentNegotiations,
  listTeacherNegotiations,
  type ProposalInput,
  proposalForm,
  proposeRate,
  setRateNegotiation,
  withdrawRate,
} from '@/server/rateNegotiations';
import { type ListingInput, previewListing, saveListing } from '@/server/teacherListings';
import { saveUsualTimes } from '@/server/teacherUsualTimes';
import { createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-15 step A4 (FR-043; P-6, P-10, OC-104): separate hourly and package price proposals on top
 * of the CR-13 negotiation rules. Synthetic people only.
 */
const sql = testDb();
const T0 = new Date('2026-10-19T08:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const BASE = 'http://aa.test';
let admin = '';

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  admin = await createAdult(sql, 'superadmin');
});
afterAll(async () => {
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
  await sql`UPDATE platform_settings SET value = 5 WHERE key = 'rate_active_per_parent'`;
  await sql`UPDATE platform_settings SET value = 10 WHERE key = 'rate_new_per_day'`;
  await sql.end();
});

const MON = { weekday: 1, start: 1020, end: 1080 };
const WED = { weekday: 3, start: 1020, end: 1080 };
const SAT = { weekday: 6, start: 600, end: 720 };
const PKG: PackageInput = {
  offer: true,
  currency: 'INR',
  priceMinor: 850000,
  classes: 22,
  perWeek: 2,
  minutes: 40,
  weeks: 11,
  times: [
    { weekday: 1, start: 1020 },
    { weekday: 3, start: 1020 },
  ],
  termsNote: '',
};

/** An approved teacher with hourly lessons (Monday negotiable) and a negotiable package, published. */
async function teacher(opts: { master?: boolean; packageNegotiable?: boolean } = {}) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', 'active', ${`pn-${uniq()}@example.com`}, 'Teacher D. Sample', 'x', 'Asia/Kolkata')
    RETURNING id`;
  const id = row!.id;
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${id}, 'self_registered', 'approved', ${['english', 'maths']}, ${[4, 5, 6]}, 'A short bio.', ${admin},
            ${T0}, ${T0}, ${['CBSE']}, ${5})`;
  expect((await saveUsualTimes(sql, id, [MON, WED, SAT], T0)).ok).toBe(true);
  expect((await saveHourly(sql, id, { offered: true, currency: 'INR', rateMinor: 60000, minutes: 40 }, T0)).ok).toBe(
    true,
  );
  expect((await savePackage(sql, id, PKG, T0)).ok).toBe(true);
  await setSlotNegotiable(sql, id, MON, true, T0);
  if (opts.packageNegotiable !== false)
    await sql`UPDATE learning_packages SET negotiable = true WHERE teacher_id = ${id}`;
  const input: ListingInput = {
    subjects: ['english', 'maths'],
    grades: [4, 5, 6],
    curricula: ['CBSE'],
    experienceYears: 5,
    prices: [],
  };
  const snap = await previewListing(sql, id, input);
  expect((await saveListing(sql, id, { ...input, previewKey: snapshotKey(snap!) }, 'publish', true, T0)).ok).toBe(true);
  if (opts.master !== false) await setRateNegotiation(sql, id, true, T0);
  const [l] = await sql<Array<{ public_id: string }>>`SELECT public_id FROM teacher_listings WHERE teacher_id = ${id}`;
  return { teacherId: id, publicId: l!.public_id };
}

async function family() {
  const parentId = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET display_name = 'Anita Sample', time_zone = 'Asia/Kolkata' WHERE id = ${parentId}`;
  const childId = await createChild(sql, parentId);
  await sql`UPDATE student_profiles SET subjects = ${['english', 'maths']}, grade = 5, curriculum = 'CBSE'
            WHERE account_id = ${childId}`;
  return { parentId, childId };
}

type T = Awaited<ReturnType<typeof teacher>>;
type F = Awaited<ReturnType<typeof family>>;

const hourly = (t: T, f: F, over: Partial<ProposalInput> = {}): ProposalInput => ({
  publicId: t.publicId,
  kind: 'hourly',
  slot: MON,
  priceIndex: 0,
  childId: f.childId,
  grade: null,
  curriculum: null,
  subject: 'english',
  amount: '525',
  sessions: null,
  minutes: 40,
  message: '',
  ...over,
});
const pkg = (t: T, f: F, over: Partial<ProposalInput> = {}): ProposalInput => ({
  ...hourly(t, f),
  kind: 'package',
  slot: null,
  amount: '7,800',
  ...over,
});

describe('CR-15 A4: the switch decides which proposals exist', () => {
  it('while off, hourly and package proposals are refused', async () => {
    const t = await teacher();
    const f = await family();
    expect(await proposeRate(sql, f.parentId, hourly(t, f), BASE, T0)).toEqual({ ok: false, reason: 'not_negotiable' });
    expect(await proposeRate(sql, f.parentId, pkg(t, f), BASE, T0)).toEqual({ ok: false, reason: 'not_negotiable' });
  });

  it('while on, proposals on the earlier prices are refused (P-9)', async () => {
    await setPricingV2(sql, admin, true, T0);
    const t = await teacher();
    const f = await family();
    const r = await proposeRate(sql, f.parentId, { ...hourly(t, f), kind: undefined, priceIndex: 0 }, BASE, T0);
    expect(r).toEqual({ ok: false, reason: 'not_negotiable' });
    const form = await proposalForm(sql, f.parentId, t.publicId, T0);
    expect(form!.prices).toEqual([]);
    expect(form!.v2!.slots.map((s) => s.negotiable)).toEqual([true, false, false]);
    expect(form!.v2!.packageNegotiable).toBe(true);
  });
});

describe('CR-15 A4: hourly proposals (FR-043, P-8)', () => {
  it('only at a negotiable time, with the master switch on; the time and rate are copied', async () => {
    const t = await teacher();
    const f = await family();
    expect(await proposeRate(sql, f.parentId, hourly(t, f, { slot: WED }), BASE, T0)).toEqual({
      ok: false,
      reason: 'not_negotiable',
    });
    expect(
      await proposeRate(sql, f.parentId, hourly(t, f, { slot: { weekday: 2, start: 0, end: 60 } }), BASE, T0),
    ).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['slot'],
    });
    const r = await proposeRate(sql, f.parentId, hourly(t, f, { minutes: 15 }), BASE, T0);
    expect(r.ok).toBe(true);
    const [n] = await sql<
      Array<{ kind: string; model: string; slot: unknown; asking_amount_minor: string; asking_minutes: number }>
    >`
      SELECT kind, model, slot, asking_amount_minor, asking_minutes FROM rate_negotiations WHERE id = ${(r as { id: string }).id}`;
    expect(n).toMatchObject({ kind: 'hourly', model: 'hourly', asking_minutes: 40 });
    expect(Number(n!.asking_amount_minor)).toBe(60000);
    expect(n!.slot).toEqual({ ...MON, timeZone: 'Asia/Kolkata' });
    // The parent's "15 minutes" was ignored: the published length applies (price only).
    const [o] = await sql<Array<{ minutes: number; amount_minor: string }>>`
      SELECT minutes, amount_minor FROM rate_offers WHERE negotiation_id = ${(r as { id: string }).id}`;
    expect(o).toMatchObject({ minutes: 40 });
    expect(Number(o!.amount_minor)).toBe(52500);
  });

  it('master switch off: nothing is negotiable (R-8)', async () => {
    const t = await teacher({ master: false });
    const f = await family();
    expect(await proposeRate(sql, f.parentId, hourly(t, f), BASE, T0)).toEqual({ ok: false, reason: 'not_negotiable' });
    expect(await proposeRate(sql, f.parentId, pkg(t, f), BASE, T0)).toEqual({ ok: false, reason: 'not_negotiable' });
  });
});

describe('CR-15 A4: package proposals (P-6)', () => {
  it('price only; the terms are copied and survive later edits', async () => {
    const t = await teacher();
    const f = await family();
    const r = await proposeRate(sql, f.parentId, pkg(t, f), BASE, T0);
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    // The teacher changes the package price afterwards; the proposal keeps what was published.
    await savePackage(sql, t.teacherId, { ...PKG, priceMinor: 990000, classes: 24, weeks: 12 }, at(1));
    const [mine] = (await listParentNegotiations(sql, f.parentId, at(1))).filter((n) => n.id === id);
    expect(mine!.kind).toBe('package');
    expect(mine!.asking.amountMinor).toBe(850000);
    expect(mine!.packageTerms).toMatchObject({ classes: 22, perWeek: 2, weeks: 11, minutes: 40 });
    // A counter-offer changes the amount only, whatever else is sent.
    const c = await counterRate(
      sql,
      'teacher',
      t.teacherId,
      id,
      { amount: '8,200', sessions: 30, minutes: 20, message: '' },
      BASE,
      at(1),
    );
    expect(c.ok).toBe(true);
    const [last] = await sql<Array<{ minutes: number; sessions: number | null }>>`
      SELECT minutes, sessions FROM rate_offers WHERE negotiation_id = ${id} ORDER BY seq DESC LIMIT 1`;
    expect(last).toEqual({ minutes: 40, sessions: null });
    // The database refuses a different length directly.
    await expect(
      sql`INSERT INTO rate_offers (negotiation_id, seq, made_by, amount_minor, sessions, minutes)
          VALUES (${id}, 3, 'parent', 800000, NULL, 30)`,
    ).rejects.toThrow(/price only/);
    expect(await answerRate(sql, 'parent', f.parentId, id, 'accept', null, BASE, at(2))).toEqual({ ok: true });
    const [agreed] = await sql<Array<{ agreed_amount_minor: string; status: string }>>`
      SELECT agreed_amount_minor, status FROM rate_negotiations WHERE id = ${id}`;
    expect(agreed!.status).toBe('accepted');
    expect(Number(agreed!.agreed_amount_minor)).toBe(820000);
    // Independence (P-7): agreeing a package price changes neither published price.
    const offers = await getTeacherOffers(sql, t.teacherId);
    expect(offers.hourly.rateMinor).toBe(60000);
    expect(offers.package!.priceMinor).toBe(990000);
  });

  it('a fixed package price refuses proposals', async () => {
    const t = await teacher({ packageNegotiable: false });
    const f = await family();
    expect(await proposeRate(sql, f.parentId, pkg(t, f), BASE, T0)).toEqual({ ok: false, reason: 'not_negotiable' });
  });
});

describe('CR-15 A4: separate limits and cooldowns (P-10)', () => {
  it('one open hourly and one open package at the same time; a second of a type is refused', async () => {
    const t = await teacher();
    const f = await family();
    await setSlotNegotiable(sql, t.teacherId, SAT, true, T0);
    expect((await proposeRate(sql, f.parentId, hourly(t, f), BASE, T0)).ok).toBe(true);
    expect((await proposeRate(sql, f.parentId, pkg(t, f), BASE, T0)).ok).toBe(true);
    // Another time does not get round the one-open rule.
    const again = await proposeRate(sql, f.parentId, hourly(t, f, { slot: SAT }), BASE, T0);
    expect(again).toMatchObject({ ok: false, reason: 'already' });
    expect((await proposeRate(sql, f.parentId, pkg(t, f), BASE, T0)).ok).toBe(false);
    // Another child of the same parent is a separate context.
    const other = await createChild(sql, f.parentId);
    await sql`UPDATE student_profiles SET subjects = ${['english']}, grade = 4 WHERE account_id = ${other}`;
    expect((await proposeRate(sql, f.parentId, hourly(t, f, { childId: other }), BASE, T0)).ok).toBe(true);
  });

  it('a decline starts a 7-day wait for that type only; withdrawal and expiry start none', async () => {
    const t = await teacher();
    const f = await family();
    const h = await proposeRate(sql, f.parentId, hourly(t, f), BASE, T0);
    await answerRate(sql, 'teacher', t.teacherId, (h as { id: string }).id, 'decline', 'no_time', BASE, at(1));
    const again = await proposeRate(sql, f.parentId, hourly(t, f), BASE, at(2));
    expect(again).toMatchObject({ ok: false, reason: 'wait' });
    expect((again as { until: Date }).until).toEqual(at(8));
    // The package is not affected by the hourly decline.
    const p = await proposeRate(sql, f.parentId, pkg(t, f), BASE, at(2));
    expect(p.ok).toBe(true);
    expect(await withdrawRate(sql, f.parentId, (p as { id: string }).id, BASE, at(3))).toEqual({ ok: true });
    expect((await proposeRate(sql, f.parentId, pkg(t, f), BASE, at(3))).ok).toBe(true);
    // After the wait, hourly is allowed again.
    expect((await proposeRate(sql, f.parentId, hourly(t, f), BASE, at(8))).ok).toBe(true);
    // Expiry: no wait. The package proposal from day 3 expires on day 17.
    expect((await proposeRate(sql, f.parentId, pkg(t, f), BASE, at(18))).ok).toBe(true);
  });

  it('the 5-open limit counts hourly and package together (R-7)', async () => {
    await sql`UPDATE platform_settings SET value = 2 WHERE key = 'rate_active_per_parent'`;
    try {
      const t1 = await teacher();
      const t2 = await teacher();
      const f = await family();
      expect((await proposeRate(sql, f.parentId, hourly(t1, f), BASE, T0)).ok).toBe(true);
      expect((await proposeRate(sql, f.parentId, pkg(t1, f), BASE, T0)).ok).toBe(true);
      expect(await proposeRate(sql, f.parentId, hourly(t2, f), BASE, T0)).toMatchObject({ reason: 'active_limit' });
    } finally {
      await sql`UPDATE platform_settings SET value = 5 WHERE key = 'rate_active_per_parent'`;
    }
  });

  it('two hourly proposals sent at the same moment create one', async () => {
    const t = await teacher();
    const f = await family();
    const results = await Promise.all([
      proposeRate(sql, f.parentId, hourly(t, f), BASE, T0),
      proposeRate(sql, f.parentId, hourly(t, f, { amount: '500' }), BASE, T0),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [n] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM rate_negotiations WHERE parent_id = ${f.parentId} AND kind = 'hourly'`;
    expect(n!.n).toBe(1);
  });
});

describe('CR-15 A4: privacy and the database', () => {
  it('the teacher sees the kind and terms but never the child; others see nothing', async () => {
    const t = await teacher();
    const f = await family();
    await proposeRate(sql, f.parentId, hourly(t, f), BASE, T0);
    const [mine] = await listTeacherNegotiations(sql, t.teacherId, T0);
    expect(mine!.kind).toBe('hourly');
    expect(mine!.slot).toMatchObject({ weekday: 1, start: 1020 });
    expect(JSON.stringify(mine)).not.toContain(f.childId);
    const stranger = await teacher();
    expect(await listTeacherNegotiations(sql, stranger.teacherId, T0)).toEqual([]);
  });

  it('kind, copied time and package terms can never change, and kinds must be consistent', async () => {
    const t = await teacher();
    const f = await family();
    const r = await proposeRate(sql, f.parentId, hourly(t, f), BASE, T0);
    const id = (r as { id: string }).id;
    await expect(
      sql`UPDATE rate_negotiations SET slot = '{"weekday":2,"start":0,"end":60}' WHERE id = ${id}`,
    ).rejects.toThrow(/fixed/);
    await expect(sql`UPDATE rate_negotiations SET kind = 'legacy', slot = NULL WHERE id = ${id}`).rejects.toThrow();
    await expect(sql`UPDATE rate_negotiations SET asking_minutes = 30 WHERE id = ${id}`).rejects.toThrow(/fixed/);
  });
});
