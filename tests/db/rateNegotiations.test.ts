import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ListingPrice, snapshotKey } from '@/lib/listing';
import {
  answerRate,
  counterRate,
  declineWaits,
  getTeacherRateSettings,
  listParentNegotiations,
  listTeacherNegotiations,
  negotiablePriceFlags,
  negotiationCounts,
  type ProposalInput,
  proposalForm,
  proposeRate,
  setRateNegotiation,
  updateRateLimits,
  withdrawRate,
} from '@/server/rateNegotiations';
import { type ListingInput, previewListing, saveListing } from '@/server/teacherListings';
import { teacherMaySee } from '@/server/teacherLinks';
import { createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-13 (FR-040; OC-98, OC-99, OC-100, OC-101): teacher rate negotiation.
 * T-RN-1 … T-RN-15 map to AC-1 … AC-16. Synthetic people only.
 */
const sql = testDb();
const T0 = new Date('2026-10-19T04:00:00Z'); // 09:30 in India
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const BASE = 'http://aa.test';

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(async () => {
  // Leave the shared limits as the migration set them.
  await sql`UPDATE platform_settings SET value = 5 WHERE key = 'rate_active_per_parent'`;
  await sql`UPDATE platform_settings SET value = 10 WHERE key = 'rate_new_per_day'`;
  await sql.end();
});

const PRICES: ListingPrice[] = [
  { model: 'hourly', currency: 'INR', amountMinor: 60000, sessions: null, minutes: 40 },
  { model: 'weekly', currency: 'INR', amountMinor: 120000, sessions: 2, minutes: 40 },
  { model: 'monthly', currency: 'INR', amountMinor: 400000, sessions: 8, minutes: 40 },
];

async function teacherWithListing(prices: ListingPrice[] = PRICES, open: string[] | null = ['hourly', 'monthly']) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', 'active', ${`rate-${uniq()}@example.com`}, 'Teacher B. Sample', 'x', 'Asia/Kolkata')
    RETURNING id`;
  const id = row!.id;
  const owner = await createAdult(sql, 'superadmin');
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${id}, 'self_registered', 'approved', ${['english', 'maths']}, ${[4, 5, 6]}, 'A short bio.', ${owner},
            ${T0}, ${T0}, ${['CBSE']}, ${5})`;
  const input: ListingInput = {
    subjects: ['english', 'maths'],
    grades: [4, 5, 6],
    curricula: ['CBSE'],
    experienceYears: 5,
    prices,
    negotiableModels: open ?? [],
  };
  const snap = await previewListing(sql, id, input);
  const r = await saveListing(sql, id, { ...input, previewKey: snapshotKey(snap!) }, 'publish', true, T0);
  expect(r.ok).toBe(true);
  if (open) expect(await setRateNegotiation(sql, id, true, T0)).toEqual({ ok: true });
  const [l] = await sql<Array<{ public_id: string }>>`SELECT public_id FROM teacher_listings WHERE teacher_id = ${id}`;
  const [e] = await sql<Array<{ email: string }>>`SELECT email FROM accounts WHERE id = ${id}`;
  return { teacherId: id, publicId: l!.public_id, email: e!.email };
}

async function family() {
  const parentId = await createAdult(sql, 'parent');
  const name = `Kiran${uniq()}`;
  await sql`UPDATE accounts SET display_name = 'Anita Sample', time_zone = 'Asia/Kolkata' WHERE id = ${parentId}`;
  const childId = await createChild(sql, parentId);
  await sql`UPDATE student_profiles SET subjects = ${['english', 'maths']}, grade = 5, curriculum = 'CBSE'
            WHERE account_id = ${childId}`;
  await sql`UPDATE accounts SET display_name = ${name} WHERE id = ${childId}`;
  const childB = await createChild(sql, parentId);
  await sql`UPDATE student_profiles SET subjects = ${['english']}, grade = 4 WHERE account_id = ${childB}`;
  return { parentId, childId, childB, childName: name };
}

type T = Awaited<ReturnType<typeof teacherWithListing>>;
type F = Awaited<ReturnType<typeof family>>;

const input = (t: T, f: F, over: Partial<ProposalInput> = {}): ProposalInput => ({
  publicId: t.publicId,
  priceIndex: 2, // monthly
  childId: f.childId,
  grade: null,
  curriculum: null,
  subject: 'english',
  amount: '3,400',
  sessions: 8,
  minutes: 40,
  message: 'Could we start in November at this rate?',
  ...over,
});

async function propose(t: T, f: F, over: Partial<ProposalInput> = {}, now = T0) {
  const r = await proposeRate(sql, f.parentId, input(t, f, over), BASE, now);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.id;
}

const offer = (amount: string, sessions: number | null = 8) => ({ amount, sessions, minutes: 40, message: '' });

async function row(id: string) {
  const [r] = await sql<{ status: string; turn: string | null; offers: number; expires_at: Date }[]>`
    SELECT status, turn, offers, expires_at FROM rate_negotiations WHERE id = ${id}`;
  return r!;
}

describe('T-RN-1 (AC-1): off by default; both switches must be on', () => {
  it('a teacher starts with negotiation off; asking prices stay; "Propose a rate" only where both are on', async () => {
    const t = await teacherWithListing(PRICES, null);
    expect(await getTeacherRateSettings(sql, t.teacherId)).toEqual({ on: false, models: [] });
    expect(await negotiablePriceFlags(sql, t.publicId, T0)).toEqual([false, false, false]);
    const f = await family();
    expect(await proposeRate(sql, f.parentId, input(t, f), BASE, T0)).toEqual({ ok: false, reason: 'not_negotiable' });
    // Price switches alone: still off.
    await sql`UPDATE teacher_profiles SET negotiable_models = ${['monthly']} WHERE account_id = ${t.teacherId}`;
    expect(await negotiablePriceFlags(sql, t.publicId, T0)).toEqual([false, false, false]);
    await setRateNegotiation(sql, t.teacherId, true, T0);
    expect(await negotiablePriceFlags(sql, t.publicId, T0)).toEqual([false, false, true]);
    const form = await proposalForm(sql, f.parentId, t.publicId, T0);
    expect(form?.prices.map((p) => p.index)).toEqual([2]);
    expect(form?.fixed.map((p) => p.model)).toEqual(['hourly', 'weekly']);
  });

  it('existing teachers were migrated with negotiation off', async () => {
    const [n] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM teacher_profiles tp
      WHERE NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.event_type = 'RATE_NEGOTIATION_SWITCHED'
                          AND a.actor_id = tp.account_id)
        AND (tp.rate_negotiation_on OR cardinality(tp.negotiable_models) > 0)
        AND tp.account_id NOT IN (SELECT teacher_id FROM teacher_listings)`;
    expect(n!.n).toBe(0);
  });
});

describe('T-RN-2 (AC-3): pricing types, basis and currency', () => {
  it('works for hourly, weekly, every two weeks and monthly; basis and currency never change', async () => {
    const t = await teacherWithListing(
      [
        { model: 'hourly', currency: 'USD', amountMinor: 3000, sessions: null, minutes: 30 },
        { model: 'biweekly', currency: 'SGD', amountMinor: 21000, sessions: 4, minutes: 40 },
        { model: 'weekly', currency: 'INR', amountMinor: 120000, sessions: 2, minutes: 40 },
      ],
      ['hourly', 'biweekly', 'weekly'],
    );
    const f = await family();
    const hourly = await propose(t, f, { priceIndex: 0, amount: '25.50', sessions: null, minutes: 30 });
    const bi = await propose(t, f, { priceIndex: 1, amount: '180', sessions: 4 });
    const weekly = await propose(t, f, { priceIndex: 2, amount: '1000', sessions: 2 });
    const list = await listParentNegotiations(sql, f.parentId, T0);
    const byId = new Map(list.map((n) => [n.id, n]));
    expect(byId.get(hourly)).toMatchObject({ model: 'hourly', currency: 'USD', history: [{ amountMinor: 2550 }] });
    expect(byId.get(bi)).toMatchObject({ model: 'biweekly', currency: 'SGD', asking: { amountMinor: 21000 } });
    expect(byId.get(weekly)).toMatchObject({ model: 'weekly', currency: 'INR' });
    // An hourly counter-offer cannot carry lessons per period; the database refuses one too.
    expect(await counterRate(sql, 'teacher', t.teacherId, hourly, offer('28', 3), BASE, T0)).toMatchObject({
      ok: true,
    });
    await expect(
      sql`INSERT INTO rate_offers (negotiation_id, seq, made_by, amount_minor, sessions, minutes)
          VALUES (${hourly}, 3, 'parent', 2600, 4, 30)`,
    ).rejects.toThrow(/lessons per period/);
    await expect(sql`UPDATE rate_negotiations SET currency = 'INR' WHERE id = ${hourly}`).rejects.toThrow(/fixed/);
  });
});

describe('T-RN-3 (AC-4): own or prospective child; the teacher sees grade and curriculum only', () => {
  it('keeps the child private and the negotiation to the two parties', async () => {
    const t = await teacherWithListing();
    const f = await family();
    await propose(t, f);
    await propose(t, f, { childId: null, grade: 4, curriculum: 'ICSE', priceIndex: 0, sessions: null, amount: '520' });
    const seen = await listTeacherNegotiations(sql, t.teacherId, T0);
    expect(seen).toHaveLength(2);
    const text = JSON.stringify(seen);
    expect(text).not.toContain(f.childName);
    expect(text).not.toContain(f.childId);
    expect(text).not.toContain('Sample'); // the parent's surname
    expect(seen.find((n) => n.prospective)).toMatchObject({ grade: 4, curriculum: 'ICSE', parentFirstName: 'Anita' });
    expect(seen.find((n) => !n.prospective)).toMatchObject({ grade: 5, curriculum: 'CBSE', subject: 'english' });
    // The parent sees their child's name.
    expect((await listParentNegotiations(sql, f.parentId, T0)).map((n) => n.childName)).toContain(f.childName);
    // Another family's child is refused; a prospective child needs a grade and a curriculum.
    const other = await family();
    expect(await proposeRate(sql, f.parentId, input(t, f, { childId: other.childId }), BASE, T0)).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['child'],
    });
    expect(
      await proposeRate(sql, f.parentId, input(t, f, { childId: null, grade: 13, curriculum: 'Moon' }), BASE, T0),
    ).toMatchObject({ ok: false, reason: 'invalid', problems: ['grade', 'curriculum'] });
    // A subject the teacher does not list, or the child does not study, is refused.
    expect(
      await proposeRate(sql, f.parentId, input(t, f, { childId: f.childB, subject: 'maths' }), BASE, T0),
    ).toMatchObject({ problems: ['subject'] });
  });
});

describe('T-RN-4 (AC-5): turn order and final statuses', () => {
  it('follows the full transition matrix', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const id = await propose(t, f);
    expect(await row(id)).toMatchObject({ status: 'pending', turn: 'teacher', offers: 1 });
    // The parent cannot answer their own offer; the teacher can.
    expect(await answerRate(sql, 'parent', f.parentId, id, 'accept', null, BASE, T0)).toEqual({
      ok: false,
      reason: 'not_your_turn',
    });
    expect(await counterRate(sql, 'parent', f.parentId, id, offer('3500'), BASE, T0)).toEqual({
      ok: false,
      reason: 'not_your_turn',
    });
    expect(await counterRate(sql, 'teacher', t.teacherId, id, offer('3,700'), BASE, at(1))).toMatchObject({
      ok: true,
      offer: 2,
    });
    expect(await row(id)).toMatchObject({ status: 'countered', turn: 'parent', offers: 2 });
    expect(await answerRate(sql, 'teacher', t.teacherId, id, 'accept', null, BASE, at(1))).toEqual({
      ok: false,
      reason: 'not_your_turn',
    });
    expect(await answerRate(sql, 'parent', f.parentId, id, 'accept', null, BASE, at(2))).toEqual({ ok: true });
    const [n] = await listParentNegotiations(sql, f.parentId, at(2));
    expect(n).toMatchObject({
      status: 'accepted',
      agreed: { amountMinor: 370000, sessions: 8, minutes: 40 },
      asking: { amountMinor: 400000 },
      endedBy: 'parent',
    });
    // Final: nothing more, from either side, by the server or the database.
    for (const action of [
      () => answerRate(sql, 'teacher', t.teacherId, id, 'decline', null, BASE, at(2)),
      () => counterRate(sql, 'teacher', t.teacherId, id, offer('1'), BASE, at(2)),
      () => withdrawRate(sql, f.parentId, id, BASE, at(2)),
    ]) {
      expect(await action()).toEqual({ ok: false, reason: 'ended' });
    }
    await expect(sql`UPDATE rate_negotiations SET status = 'declined' WHERE id = ${id}`).rejects.toThrow(/ended/);
    await expect(
      sql`INSERT INTO rate_offers (negotiation_id, seq, made_by, amount_minor, sessions, minutes)
          VALUES (${id}, 3, 'teacher', 100, 8, 40)`,
    ).rejects.toThrow(/active negotiation/);
  });

  it('the parent can withdraw on either side’s turn; the teacher cannot', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const id = await propose(t, f);
    expect(await withdrawRate(sql, t.teacherId, id, BASE, T0)).toEqual({ ok: false, reason: 'not_found' });
    expect(await withdrawRate(sql, f.parentId, id, BASE, T0)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ status: 'withdrawn', turn: null });
  });

  it('decline by either side, with an optional reason from the list', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const id = await propose(t, f);
    expect(await answerRate(sql, 'teacher', t.teacherId, id, 'decline', 'nonsense', BASE, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await answerRate(sql, 'teacher', t.teacherId, id, 'decline', 'not_a_fit', BASE, T0)).toEqual({ ok: true });
    const [n] = await listParentNegotiations(sql, f.parentId, T0);
    expect(n).toMatchObject({
      status: 'declined',
      endedBy: 'teacher',
      declineReason: 'not_a_fit',
      askAgainFrom: at(7),
    });
  });
});

describe('T-RN-5 (AC-6): at most six offers', () => {
  it('numbers offers 1–6; after offer 6 only accept or decline; a 7th is refused by the server and the database', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const id = await propose(t, f);
    const sides = ['teacher', 'parent', 'teacher', 'parent', 'teacher'] as const;
    for (const [i, side] of sides.entries()) {
      const actor = side === 'teacher' ? t.teacherId : f.parentId;
      expect(await counterRate(sql, side, actor, id, offer(String(3500 + i * 10)), BASE, at(i))).toMatchObject({
        ok: true,
        offer: i + 2,
      });
    }
    expect(await row(id)).toMatchObject({ offers: 6, turn: 'parent' });
    expect(await counterRate(sql, 'parent', f.parentId, id, offer('3600'), BASE, at(5))).toEqual({
      ok: false,
      reason: 'final_offer',
    });
    await expect(
      sql`INSERT INTO rate_offers (negotiation_id, seq, made_by, amount_minor, sessions, minutes)
          VALUES (${id}, 7, 'parent', 360000, 8, 40)`,
    ).rejects.toThrow(/rate_offers_seq_check/);
    await expect(
      sql`UPDATE rate_negotiations SET offers = 7, turn = 'teacher', last_action_at = ${at(5)} WHERE id = ${id}`,
    ).rejects.toThrow(/offers_check/);
    const seen = await listTeacherNegotiations(sql, t.teacherId, at(5));
    expect(seen[0]!.history.map((o) => o.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen[0]!.history.map((o) => o.by)).toEqual(['parent', 'teacher', 'parent', 'teacher', 'parent', 'teacher']);
    // OC-100: the parent declining offer 6 starts the wait.
    expect(await answerRate(sql, 'parent', f.parentId, id, 'decline', null, BASE, at(6))).toEqual({ ok: true });
    expect(await proposeRate(sql, f.parentId, input(t, f), BASE, at(8))).toEqual({
      ok: false,
      reason: 'wait',
      until: at(13),
    });
  });
});

describe('T-RN-6 (AC-7): 14 days per offer', () => {
  it('each offer resets the expiry; with no answer the negotiation expires and later answers are refused', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const id = await propose(t, f);
    expect((await row(id)).expires_at).toEqual(at(14));
    await counterRate(sql, 'teacher', t.teacherId, id, offer('3700'), BASE, at(10));
    expect((await row(id)).expires_at).toEqual(at(24));
    // The database refuses an answer at or after the expiry, whatever the application does.
    await expect(
      sql`UPDATE rate_negotiations SET status = 'withdrawn', turn = NULL, ended_by = 'parent', ended_at = ${at(24)},
            last_action_at = ${at(24)} WHERE id = ${id}`,
    ).rejects.toThrow(/expired/);
    expect(await answerRate(sql, 'parent', f.parentId, id, 'accept', null, BASE, at(24))).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(await row(id)).toMatchObject({ status: 'expired', turn: null });
    // No wait after an expiry.
    expect(await proposeRate(sql, f.parentId, input(t, f), BASE, at(24))).toMatchObject({ ok: true });
    const mails = await sql<{ template: string }[]>`SELECT template FROM email_outbox WHERE to_address = ${t.email}`;
    expect(mails.map((m) => m.template)).toContain('rate_proposal_expired');
  });
});

describe('T-RN-7 (AC-8): one active negotiation and the decline wait', () => {
  it('refuses a second active one for the same teacher, child and basis; allows other children and bases', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const first = await propose(t, f);
    expect(await proposeRate(sql, f.parentId, input(t, f, { amount: '3500' }), BASE, T0)).toEqual({
      ok: false,
      reason: 'already',
      existingId: first,
    });
    await expect(
      sql`INSERT INTO rate_negotiations (parent_id, teacher_id, listing_public_id, child_id, child_key, grade, subject,
                                         model, currency, asking_amount_minor, asking_sessions, asking_minutes,
                                         status, turn, offers, expires_at)
          SELECT parent_id, teacher_id, listing_public_id, child_id, child_key, grade, subject, model, currency,
                 asking_amount_minor, asking_sessions, asking_minutes, 'pending', 'teacher', 1, expires_at
          FROM rate_negotiations WHERE id = ${first}`,
    ).rejects.toThrow(/rate_negotiations_one_active/);
    expect(await proposeRate(sql, f.parentId, input(t, f, { childId: f.childB }), BASE, T0)).toMatchObject({
      ok: true,
    });
    expect(await proposeRate(sql, f.parentId, input(t, f, { priceIndex: 0, sessions: null }), BASE, T0)).toMatchObject({
      ok: true,
    });
  });

  it('applies after a decline by either side, on every route, with the next eligible date', async () => {
    const t = await teacherWithListing();
    const other = await teacherWithListing();
    const f = await family();
    // Teacher declines.
    const a = await propose(t, f);
    await answerRate(sql, 'teacher', t.teacherId, a, 'decline', null, BASE, at(1));
    const refused = { ok: false, reason: 'wait', until: at(8) };
    for (let i = 0; i < 3; i += 1) {
      expect(await proposeRate(sql, f.parentId, input(t, f, { amount: String(3000 + i) }), BASE, at(2))).toEqual(
        refused,
      );
    }
    expect(await declineWaits(sql, f.parentId, t.teacherId, at(2))).toEqual([
      { childKey: `child:${f.childId}`, model: 'monthly', until: at(8) },
    ]);
    // The database refuses a direct insert too.
    await expect(
      sql`INSERT INTO rate_negotiations (parent_id, teacher_id, listing_public_id, child_id, child_key, grade, subject,
                                         model, currency, asking_amount_minor, asking_sessions, asking_minutes,
                                         status, turn, offers, created_at, last_action_at, expires_at)
          SELECT parent_id, teacher_id, listing_public_id, child_id, child_key, grade, subject, model, currency,
                 asking_amount_minor, asking_sessions, asking_minutes, 'pending', 'teacher', 1, ${at(3)}, ${at(3)},
                 ${at(17)}
          FROM rate_negotiations WHERE id = ${a}`,
    ).rejects.toThrow(/7 days after a decline/);
    // Other teacher, basis or child: at once.
    expect(await proposeRate(sql, f.parentId, input(other, f), BASE, at(2))).toMatchObject({ ok: true });
    expect(
      await proposeRate(sql, f.parentId, input(t, f, { priceIndex: 0, sessions: null }), BASE, at(2)),
    ).toMatchObject({ ok: true });
    expect(await proposeRate(sql, f.parentId, input(t, f, { childId: f.childB }), BASE, at(2))).toMatchObject({
      ok: true,
    });
    // After 7 days: allowed.
    expect(await proposeRate(sql, f.parentId, input(t, f), BASE, at(8))).toMatchObject({ ok: true });
  });

  it('a parent declining a counter-offer starts the wait too; withdrawal and acceptance do not', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const a = await propose(t, f);
    await counterRate(sql, 'teacher', t.teacherId, a, offer('3900'), BASE, T0);
    await answerRate(sql, 'parent', f.parentId, a, 'decline', 'other', BASE, at(1));
    expect(await proposeRate(sql, f.parentId, input(t, f), BASE, at(3))).toMatchObject({ reason: 'wait' });

    const g = await family();
    const w = await propose(t, g);
    await withdrawRate(sql, g.parentId, w, BASE, T0);
    const acc = await propose(t, g);
    await answerRate(sql, 'teacher', t.teacherId, acc, 'accept', null, BASE, T0);
    expect(await proposeRate(sql, g.parentId, input(t, g), BASE, T0)).toMatchObject({ ok: true });
  });

  it('T-RN-7b: two attempts at the end of the wait give one consistent result', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const a = await propose(t, f);
    await answerRate(sql, 'teacher', t.teacherId, a, 'decline', null, BASE, at(1));
    const both = await Promise.all([
      proposeRate(sql, f.parentId, input(t, f), BASE, at(8)),
      proposeRate(sql, f.parentId, input(t, f), BASE, at(8)),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toMatchObject({ reason: 'already' });
  });
});

describe('T-RN-8 (AC-9): limits', () => {
  it('5 active and 10 new a calendar day in the parent’s time zone; the Super Admin changes them', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const parentOnly = await createAdult(sql, 'parent');
    expect(await updateRateLimits(sql, parentOnly, { activePerParent: 9, newPerDay: 9 }, T0)).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await updateRateLimits(sql, owner, { activePerParent: 0, newPerDay: 9 }, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await updateRateLimits(sql, owner, { activePerParent: 2, newPerDay: 3 }, T0)).toMatchObject({ ok: true });
    try {
      const teachers = await Promise.all([1, 2, 3, 4].map(() => teacherWithListing()));
      const f = await family();
      const ids = [await propose(teachers[0]!, f), await propose(teachers[1]!, f)];
      expect(await proposeRate(sql, f.parentId, input(teachers[2]!, f), BASE, T0)).toEqual({
        ok: false,
        reason: 'active_limit',
        limit: 2,
      });
      await withdrawRate(sql, f.parentId, ids[0]!, BASE, T0);
      await propose(teachers[2]!, f); // 3rd new today
      await withdrawRate(sql, f.parentId, ids[1]!, BASE, T0);
      expect(await proposeRate(sql, f.parentId, input(teachers[3]!, f), BASE, T0)).toEqual({
        ok: false,
        reason: 'daily_limit',
        limit: 3,
        timeZone: 'Asia/Kolkata',
      });
      // A new calendar day in India starts at 18:30 UTC.
      const indiaMidnight = new Date('2026-10-19T18:30:00Z');
      expect(
        await proposeRate(sql, f.parentId, input(teachers[3]!, f), BASE, new Date(indiaMidnight.getTime() - 1000)),
      ).toMatchObject({ reason: 'daily_limit' });
      expect(await proposeRate(sql, f.parentId, input(teachers[3]!, f), BASE, indiaMidnight)).toMatchObject({
        ok: true,
      });
      // Counter-offers are not new proposals.
      const [n] = await listParentNegotiations(sql, f.parentId, indiaMidnight);
      expect(n?.status).toBe('pending');
      const audit =
        await sql`SELECT 1 FROM audit_events WHERE event_type = 'RATE_LIMITS_CHANGED' AND actor_id = ${owner}`;
      expect(audit.length).toBeGreaterThan(0);
    } finally {
      await updateRateLimits(sql, owner, { activePerParent: 5, newPerDay: 10 }, T0);
    }
  });
});

describe('T-RN-9 (AC-10): amounts', () => {
  it('refuses zero, negative, malformed and over-precise amounts; any positive amount is accepted', async () => {
    const t = await teacherWithListing();
    const f = await family();
    for (const amount of ['0', '0.00', '-5', 'abc', '12.345', '', '1e3', '١٢']) {
      expect(await proposeRate(sql, f.parentId, input(t, f, { amount }), BASE, T0)).toMatchObject({
        ok: false,
        problems: ['amount'],
      });
    }
    expect(await proposeRate(sql, f.parentId, input(t, f, { amount: '0.01' }), BASE, T0)).toMatchObject({ ok: true });
    const big = await family();
    expect(await proposeRate(sql, big.parentId, input(t, big, { amount: '99,99,99,999.99' }), BASE, T0)).toMatchObject({
      ok: true,
    });
    await expect(
      sql`INSERT INTO rate_offers (negotiation_id, seq, made_by, amount_minor, sessions, minutes)
          SELECT id, 2, 'teacher', 0, 8, 40 FROM rate_negotiations WHERE parent_id = ${f.parentId}`,
    ).rejects.toThrow(/amount_minor_check/);
  });
});

describe('T-RN-10 (AC-11): turning off', () => {
  it('stops new proposals; open negotiations continue unchanged', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const id = await propose(t, f);
    await setRateNegotiation(sql, t.teacherId, false, T0);
    expect(await negotiablePriceFlags(sql, t.publicId, T0)).toEqual([false, false, false]);
    const g = await family();
    expect(await proposeRate(sql, g.parentId, input(t, g), BASE, T0)).toEqual({ ok: false, reason: 'not_negotiable' });
    expect(await counterRate(sql, 'teacher', t.teacherId, id, offer('3700'), BASE, T0)).toMatchObject({ ok: true });
    expect(await answerRate(sql, 'parent', f.parentId, id, 'accept', null, BASE, T0)).toEqual({ ok: true });
  });
});

describe('T-RN-11 and T-RN-12 (AC-12, AC-13): history and the agreed rate', () => {
  it('keeps every offer unchanged; the agreed rate is separate and creates no link or access', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const id = await propose(t, f);
    await counterRate(sql, 'teacher', t.teacherId, id, { ...offer('3700'), message: 'From November.' }, BASE, at(1));
    await answerRate(sql, 'parent', f.parentId, id, 'accept', null, BASE, at(2));
    await expect(sql`UPDATE rate_offers SET amount_minor = 1 WHERE negotiation_id = ${id}`).rejects.toThrow(
      /cannot be changed/,
    );
    await expect(sql`DELETE FROM rate_offers WHERE negotiation_id = ${id}`).rejects.toThrow(/cannot be changed/);
    const [n] = await listParentNegotiations(sql, f.parentId, at(2));
    expect(n!.history).toEqual([
      expect.objectContaining({
        seq: 1,
        by: 'parent',
        amountMinor: 340000,
        message: 'Could we start in November at this rate?',
      }),
      expect.objectContaining({ seq: 2, by: 'teacher', amountMinor: 370000, message: 'From November.' }),
    ]);
    expect(n!.agreed).toEqual({ amountMinor: 370000, sessions: 8, minutes: 40 });
    expect(n!.asking.amountMinor).toBe(400000);
    // The teacher changes the asking price later: the agreed rate stays as recorded.
    await sql`UPDATE teacher_listings SET published = jsonb_set(published, '{prices,2,amountMinor}', '500000')
              WHERE teacher_id = ${t.teacherId}`;
    expect((await listParentNegotiations(sql, f.parentId, at(3)))[0]!.agreed!.amountMinor).toBe(370000);
    // AC-13: no link, access or booking.
    expect(await teacherMaySee(sql, t.teacherId, f.childId)).toBe(false);
    const links = await sql`SELECT 1 FROM teacher_student_links WHERE teacher_id = ${t.teacherId}`;
    expect(links.length).toBe(0);
  });
});

describe('T-RN-13 (AC-14): who can see and act', () => {
  it('other parents, other teachers, students, Admins and the Super Admin get "not found"', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const id = await propose(t, f);
    const otherTeacher = await teacherWithListing();
    const otherParent = await createAdult(sql, 'parent');
    const owner = await createAdult(sql, 'superadmin');
    for (const who of [otherParent, otherTeacher.teacherId, f.childId, owner, 'nope']) {
      expect(await answerRate(sql, 'teacher', who, id, 'accept', null, BASE, T0)).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await answerRate(sql, 'parent', who, id, 'decline', null, BASE, T0)).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await counterRate(sql, 'teacher', who, id, offer('1'), BASE, T0)).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await withdrawRate(sql, who, id, BASE, T0)).toEqual({ ok: false, reason: 'not_found' });
      expect(await listParentNegotiations(sql, who, T0)).toEqual([]);
      expect(await listTeacherNegotiations(sql, who, T0)).toEqual([]);
    }
    // A parent cannot act as the teacher of their own negotiation, nor a teacher propose.
    expect(await answerRate(sql, 'teacher', f.parentId, id, 'accept', null, BASE, T0)).toMatchObject({
      reason: 'not_found',
    });
    expect(await proposeRate(sql, t.teacherId, input(t, f), BASE, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    // A deactivated teacher sees and does nothing.
    await sql`UPDATE accounts SET status = 'deactivated', status_reason = 'Test' WHERE id = ${t.teacherId}`;
    expect(await listTeacherNegotiations(sql, t.teacherId, T0)).toEqual([]);
    expect(await answerRate(sql, 'teacher', t.teacherId, id, 'accept', null, BASE, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    // The AA Pro team sees counts only.
    expect((await negotiationCounts(sql)).pending).toBeGreaterThan(0);
  });
});

describe('T-RN-14 (AC-15): answers at the same moment', () => {
  it('accept and withdraw, accept twice, counter and decline: one result each time', async () => {
    const t = await teacherWithListing();
    for (let i = 0; i < 3; i += 1) {
      const f = await family();
      const id = await propose(t, f);
      const [a, w] = await Promise.all([
        answerRate(sql, 'teacher', t.teacherId, id, 'accept', null, BASE, T0),
        withdrawRate(sql, f.parentId, id, BASE, T0),
      ]);
      expect([a.ok, w.ok].filter(Boolean)).toHaveLength(1);
      expect((await row(id)).status).toBe(a.ok ? 'accepted' : 'withdrawn');
    }
    const f = await family();
    const id = await propose(t, f);
    const pair = await Promise.all([
      counterRate(sql, 'teacher', t.teacherId, id, offer('3600'), BASE, T0),
      answerRate(sql, 'teacher', t.teacherId, id, 'decline', null, BASE, T0),
    ]);
    expect(pair.filter((r) => r.ok)).toHaveLength(1);
    const twice = await Promise.all([
      proposeRate(sql, f.parentId, input(t, f, { childId: f.childB }), BASE, T0),
      proposeRate(sql, f.parentId, input(t, f, { childId: f.childB }), BASE, T0),
    ]);
    expect(twice.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe('T-RN-15 (AC-16): no payments; notices; audit without messages', () => {
  it('queues emails only, names no child to the teacher, and audits without message text', async () => {
    const t = await teacherWithListing();
    const f = await family();
    const message = `msg-${uniq()}`;
    const id = await propose(t, f, { message });
    await counterRate(sql, 'teacher', t.teacherId, id, { ...offer('3700'), message: `${message}-2` }, BASE, T0);
    await answerRate(sql, 'parent', f.parentId, id, 'accept', null, BASE, T0);
    const mails = await sql<{ template: string; payload: Record<string, string> }[]>`
      SELECT template, payload FROM email_outbox WHERE to_address = ${t.email}`;
    expect(mails.map((m) => m.template)).toEqual(
      expect.arrayContaining(['rate_proposal_received', 'rate_proposal_accepted']),
    );
    expect(JSON.stringify(mails)).not.toContain(f.childName);
    const audit = await sql<{ event_type: string; details: unknown }[]>`
      SELECT event_type, details FROM audit_events WHERE details->>'negotiation' = ${id}`;
    expect(audit.map((a) => a.event_type)).toEqual(
      expect.arrayContaining(['RATE_PROPOSED', 'RATE_COUNTERED', 'RATE_ACCEPTED']),
    );
    expect(JSON.stringify(audit)).not.toContain(message);
    // No payment columns anywhere in the negotiation tables.
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name IN ('rate_negotiations', 'rate_offers')`;
    expect(cols.map((c) => c.column_name).filter((c) => /pay|card|bank|upi|invoice/.test(c))).toEqual([]);
  });
});
