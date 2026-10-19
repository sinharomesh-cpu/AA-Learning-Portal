import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ListingPrice, snapshotKey } from '@/lib/listing';
import { PACKAGE_TERMS_VERSION } from '@/lib/pricing';
import {
  getTeacherOffers,
  isPricingV2,
  type PackageInput,
  saveHourly,
  savePackage,
  setPackageNegotiable,
  setPricingV2,
  setSlotNegotiable,
  withdrawPackage,
} from '@/server/pricingModel';
import { type ListingInput, getOwnListing, previewListing, saveListing } from '@/server/teacherListings';
import { saveUsualTimes } from '@/server/teacherUsualTimes';
import { createAdult, testDb, uniq } from './helpers';

/**
 * CR-15 Phase A step A2 (FR-041, FR-042; OC-102 to OC-104): hourly lessons, per-slot settings,
 * learning packages and the "New pricing model" switch. Synthetic people only.
 */
const sql = testDb();
const T0 = new Date('2026-10-19T06:30:00Z');

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(async () => {
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
  await sql.end();
});

const OLD_PRICES: ListingPrice[] = [
  { model: 'hourly', currency: 'INR', amountMinor: 60000, sessions: null, minutes: 40 },
  { model: 'monthly', currency: 'INR', amountMinor: 400000, sessions: 8, minutes: 40 },
];
const WEEK = [
  { weekday: 1, start: 1020, end: 1080 },
  { weekday: 3, start: 1020, end: 1080 },
  { weekday: 6, start: 600, end: 720 },
];

async function teacher(approval = 'approved') {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', 'active', ${`pm-${uniq()}@example.com`}, 'Teacher C. Sample', 'x', 'Asia/Kolkata')
    RETURNING id`;
  const id = row!.id;
  const owner = await createAdult(sql, 'superadmin');
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${id}, 'self_registered', ${approval}, ${['maths']}, ${[5, 6]}, 'A short bio.', ${owner},
            ${T0}, ${T0}, ${['CBSE']}, ${4})`;
  if (approval === 'approved') expect((await saveUsualTimes(sql, id, WEEK, T0)).ok).toBe(true);
  return id;
}

async function publish(id: string, prices: ListingPrice[] = OLD_PRICES) {
  const input: ListingInput = { subjects: ['maths'], grades: [5, 6], curricula: ['CBSE'], experienceYears: 4, prices };
  const snap = await previewListing(sql, id, input);
  const r = await saveListing(sql, id, { ...input, previewKey: snapshotKey(snap!) }, 'publish', true, T0);
  return r;
}

const GOOD: PackageInput = {
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

describe('CR-15 switch (reading 1)', () => {
  it('is off by default and only the Super Admin changes it, audited', async () => {
    expect(await isPricingV2(sql)).toBe(false);
    const t = await teacher();
    expect(await setPricingV2(sql, t, true, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    const admin = await createAdult(sql, 'superadmin');
    expect(await setPricingV2(sql, admin, true, T0)).toEqual({ ok: true });
    expect(await isPricingV2(sql)).toBe(true);
    expect(await setPricingV2(sql, admin, false, T0)).toEqual({ ok: true });
    expect(await isPricingV2(sql)).toBe(false);
    const [a] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'PRICING_MODEL_SWITCHED' AND actor_id = ${admin}`;
    expect(a!.n).toBe(2);
  });

  it('while off, listings keep their old prices exactly as before', async () => {
    const t = await teacher();
    expect((await publish(t)).ok).toBe(true);
    expect(await savePackage(sql, t, GOOD, T0)).toEqual({ ok: true, status: 'offered' });
    const own = await getOwnListing(sql, t, T0);
    expect(own!.preview.prices).toHaveLength(2);
    expect(own!.preview.hourly).toBeUndefined();
    expect(own!.preview.package).toBeUndefined();
    expect(own!.changedSincePublish).toBe(false);
  });
});

describe('CR-15 hourly lessons (FR-041)', () => {
  it('saves rate, currency and length; refuses invalid values; other teachers cannot', async () => {
    const t = await teacher();
    expect(await saveHourly(sql, t, { offered: true, currency: 'INR', rateMinor: 60000, minutes: 40 }, T0)).toEqual({
      ok: true,
    });
    const o = await getTeacherOffers(sql, t);
    expect(o.hourly).toEqual({ offered: true, currency: 'INR', rateMinor: 60000, minutes: 40 });
    expect(await saveHourly(sql, t, { offered: true, currency: 'INR', rateMinor: 0, minutes: 40 }, T0)).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['rate'],
    });
    expect((await saveHourly(sql, t, { offered: true, currency: 'INR', rateMinor: 100, minutes: 45 }, T0)).ok).toBe(
      false,
    );
    const pending = await teacher('submitted');
    expect(await saveHourly(sql, pending, { offered: true, currency: 'INR', rateMinor: 100, minutes: 40 }, T0)).toEqual(
      { ok: false, reason: 'not_allowed' },
    );
    const parent = await createAdult(sql, 'parent');
    expect((await saveHourly(sql, parent, { offered: true, currency: 'INR', rateMinor: 1, minutes: 40 }, T0)).ok).toBe(
      false,
    );
  });

  it('the database refuses an offered hourly lesson without a rate', async () => {
    const t = await teacher();
    await saveHourly(sql, t, { offered: true, currency: 'INR', rateMinor: 60000, minutes: 40 }, T0);
    await expect(sql`UPDATE teacher_listings SET hourly_rate_minor = NULL WHERE teacher_id = ${t}`).rejects.toThrow(
      /teacher_listings_hourly/,
    );
    await expect(sql`UPDATE teacher_listings SET hourly_minutes = 60 WHERE teacher_id = ${t}`).rejects.toThrow();
  });

  it('each usual time has its own setting, Fixed by default, kept when times are saved again', async () => {
    const t = await teacher();
    let o = await getTeacherOffers(sql, t);
    expect(o.slots.every((s) => !s.negotiable)).toBe(true);
    expect(await setSlotNegotiable(sql, t, WEEK[0]!, true, T0)).toEqual({ ok: true });
    expect(await setSlotNegotiable(sql, t, { weekday: 2, start: 0, end: 60 }, true, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    // Save again: Monday unchanged keeps Negotiable; Wednesday changed becomes a new (Fixed) time.
    expect((await saveUsualTimes(sql, t, [WEEK[0]!, { weekday: 3, start: 1020, end: 1110 }, WEEK[2]!], T0)).ok).toBe(
      true,
    );
    o = await getTeacherOffers(sql, t);
    expect(o.slots.map((s) => s.negotiable)).toEqual([true, false, false]);
    // Another teacher cannot change it.
    const other = await teacher();
    expect(await setSlotNegotiable(sql, other, WEEK[0]!, false, T0)).toEqual({ ok: true }); // their own Monday
    o = await getTeacherOffers(sql, t);
    expect(o.slots[0]!.negotiable).toBe(true);
  });
});

describe('CR-15 learning packages (FR-042)', () => {
  it('offers a valid package at the price entered; Fixed by default', async () => {
    const t = await teacher();
    expect(await savePackage(sql, t, GOOD, T0)).toEqual({ ok: true, status: 'offered' });
    const p = (await getTeacherOffers(sql, t)).package!;
    expect(p).toMatchObject({
      status: 'offered',
      priceMinor: 850000,
      classes: 22,
      perWeek: 2,
      weeks: 11,
      negotiable: false,
    });
    expect(p.termsVersion).toBe(PACKAGE_TERMS_VERSION);
  });

  it('refuses the rules on the server (P-1, P-2, R-3 to R-6)', async () => {
    const t = await teacher();
    const bad = async (over: Partial<PackageInput>) => {
      const r = await savePackage(sql, t, { ...GOOD, ...over }, T0);
      return r.ok ? [] : r.reason === 'invalid' ? r.problems : [r.reason];
    };
    expect(await bad({ classes: 21 })).toContain('classes');
    expect(await bad({ classes: 61 })).toContain('classes');
    expect(await bad({ perWeek: 1, times: [{ weekday: 1, start: 1020 }] })).toContain('per_week');
    expect(await bad({ weeks: 10 })).toContain('weeks_short');
    expect(await bad({ weeks: 27 })).toContain('weeks_long');
    expect(await bad({ minutes: 45 })).toContain('minutes');
    expect(await bad({ priceMinor: 0 })).toContain('price');
    expect(await bad({ times: [{ weekday: 1, start: 1020 }] })).toContain('times_count');
    expect(
      await bad({
        times: [
          { weekday: 2, start: 1020 },
          { weekday: 3, start: 1020 },
        ],
      }),
    ).toContain('times_outside');
    expect((await getTeacherOffers(sql, t)).package).toBeNull();
  });

  it('a draft may be incomplete and is never offered', async () => {
    const t = await teacher();
    const r = await savePackage(sql, t, { ...GOOD, offer: false, classes: 10, weeks: null, times: [] }, T0);
    expect(r).toEqual({ ok: true, status: 'draft' });
  });

  it('the database refuses an offered package that breaks the rules', async () => {
    const t = await teacher();
    await savePackage(sql, t, GOOD, T0);
    await expect(sql`UPDATE learning_packages SET classes = 21 WHERE teacher_id = ${t}`).rejects.toThrow(
      /learning_packages_offered/,
    );
    await expect(sql`UPDATE learning_packages SET completion_weeks = 10 WHERE teacher_id = ${t}`).rejects.toThrow(
      /learning_packages_offered/,
    );
    await expect(sql`UPDATE learning_packages SET classes_per_week = 1, completion_weeks = 22,
                       times = '[{"weekday":1,"start":1020}]' WHERE teacher_id = ${t}`).rejects.toThrow(
      /learning_packages_offered/,
    );
    await expect(
      sql`UPDATE learning_packages SET times = '[{"weekday":1,"start":1020},{"weekday":2,"start":1020}]'
          WHERE teacher_id = ${t}`,
    ).rejects.toThrow(/within usual times/);
    await expect(
      sql`UPDATE learning_packages SET times = '[{"weekday":6,"start":600},{"weekday":6,"start":630}]'
          WHERE teacher_id = ${t}`,
    ).rejects.toThrow(/overlap/);
    await expect(sql`UPDATE learning_packages SET status = 'needs_review' WHERE teacher_id = ${t}`).rejects.toThrow(
      /learning_packages_review/,
    );
    const parent = await createAdult(sql, 'parent');
    await expect(sql`INSERT INTO learning_packages (teacher_id) VALUES (${parent})`).rejects.toThrow();
  });

  it('usual times used by the offered package cannot be removed', async () => {
    const t = await teacher();
    await savePackage(sql, t, GOOD, T0);
    const r = await saveUsualTimes(sql, t, [WEEK[0]!, WEEK[2]!], T0);
    expect(r).toEqual({ ok: false, reason: 'package_time', times: [{ weekday: 3, start: 1020 }] });
    expect((await getTeacherOffers(sql, t)).slots).toHaveLength(3);
    // After withdrawing the package the time can go.
    expect(await withdrawPackage(sql, t, T0)).toEqual({ ok: true });
    expect((await saveUsualTimes(sql, t, [WEEK[0]!, WEEK[2]!], T0)).ok).toBe(true);
  });

  it('a package flagged for review leaves review only when completed and offered (P-9, R-1)', async () => {
    const t = await teacher();
    await sql`INSERT INTO learning_packages (teacher_id, status, currency, price_minor, classes, lesson_minutes,
                                             review_issues, legacy_source)
              VALUES (${t}, 'needs_review', 'INR', 400000, 8, 40, ${['classes_below_minimum', 'details_missing']},
                      ${sql.json({ model: 'monthly', amountMinor: 400000, sessions: 8 })})`;
    expect(await savePackage(sql, t, { ...GOOD, offer: false }, T0)).toEqual({ ok: true, status: 'needs_review' });
    expect(await savePackage(sql, t, GOOD, T0)).toEqual({ ok: true, status: 'offered' });
    const p = (await getTeacherOffers(sql, t)).package!;
    expect(p.reviewIssues).toEqual([]);
    expect(p.legacySource).toMatchObject({ model: 'monthly', amountMinor: 400000 });
  });
});

describe('CR-15 independence (P-7, P-8)', () => {
  it('changing the hourly rate or a slot leaves the package unchanged, and the reverse', async () => {
    const t = await teacher();
    await saveHourly(sql, t, { offered: true, currency: 'INR', rateMinor: 60000, minutes: 40 }, T0);
    await savePackage(sql, t, GOOD, T0);
    const before = await getTeacherOffers(sql, t);
    await saveHourly(sql, t, { offered: true, currency: 'INR', rateMinor: 75000, minutes: 30 }, T0);
    await setSlotNegotiable(sql, t, WEEK[0]!, true, T0);
    const mid = await getTeacherOffers(sql, t);
    expect(mid.package).toEqual(before.package);
    await savePackage(sql, t, { ...GOOD, priceMinor: 990000 }, T0);
    await setPackageNegotiable(sql, t, true, T0);
    const after = await getTeacherOffers(sql, t);
    expect(after.hourly).toEqual(mid.hourly);
    expect(after.slots).toEqual(mid.slots);
    expect(after.package!.priceMinor).toBe(990000);
    // The package price is never derived from the hourly rate.
    expect(after.package!.priceMinor).not.toBe(75000 * 22 * (40 / 60));
  });

  it('hourly only, package only or both', async () => {
    const h = await teacher();
    await saveHourly(sql, h, { offered: true, currency: 'INR', rateMinor: 60000, minutes: 40 }, T0);
    const p = await teacher();
    await savePackage(sql, p, GOOD, T0);
    expect((await getTeacherOffers(sql, h)).package).toBeNull();
    expect((await getTeacherOffers(sql, p)).hourly.offered).toBe(false);
  });
});

describe('CR-15 listing copy with the switch on', () => {
  it('shows hourly and package, hides old prices without deleting them', async () => {
    const admin = await createAdult(sql, 'superadmin');
    const t = await teacher();
    expect((await publish(t)).ok).toBe(true);
    await setPricingV2(sql, admin, true, T0);
    try {
      await saveHourly(sql, t, { offered: true, currency: 'INR', rateMinor: 60000, minutes: 40 }, T0);
      await savePackage(sql, t, GOOD, T0);
      const own = await getOwnListing(sql, t, T0);
      expect(own!.preview.prices).toEqual([]);
      expect(own!.preview.hourly).toEqual({ currency: 'INR', rateMinor: 60000, minutes: 40 });
      expect(own!.preview.package).toMatchObject({ priceMinor: 850000, classes: 22, perWeek: 2, weeks: 11 });
      expect(own!.changedSincePublish).toBe(true);
      // Publishing (with the teacher's agreement) copies the offers; the old price rows stay.
      expect((await publish(t, [])).ok).toBe(true);
      const [l] = await sql<Array<{ published: { prices: unknown[]; package: unknown }; n: number }>>`
        SELECT published, (SELECT count(*)::int FROM listing_prices p WHERE p.listing_id = l.id) AS n
        FROM teacher_listings l WHERE teacher_id = ${t}`;
      expect(l!.published.prices).toEqual([]);
      expect(l!.published.package).not.toBeNull();
      expect(l!.n).toBe(2);
    } finally {
      await setPricingV2(sql, admin, false, T0);
    }
  });
});

describe('CR-15 concurrency', () => {
  it('a usual-times save and a package save at the same moment never leave a package outside usual times', async () => {
    const t = await teacher();
    const results = await Promise.all([
      savePackage(sql, t, GOOD, T0),
      saveUsualTimes(sql, t, [WEEK[0]!, WEEK[2]!], T0),
    ]);
    const o = await getTeacherOffers(sql, t);
    if (o.package?.status === 'offered') {
      // The package won the lock, so the times save was refused.
      expect(results[1]).toMatchObject({ ok: false, reason: 'package_time' });
      expect(o.slots).toHaveLength(3);
    } else {
      // The times save won; the package could not be offered at a removed time.
      expect(results[1].ok).toBe(true);
      expect(results[0]).toMatchObject({ ok: false, reason: 'invalid' });
    }
  });

  it('two package saves at once leave one consistent row', async () => {
    const t = await teacher();
    await Promise.all([
      savePackage(sql, t, { ...GOOD, priceMinor: 700000 }, T0),
      savePackage(sql, t, { ...GOOD, priceMinor: 800000 }, T0),
    ]);
    const [n] = await sql<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM learning_packages WHERE teacher_id = ${t}`;
    expect(n!.n).toBe(1);
    expect([700000, 800000]).toContain((await getTeacherOffers(sql, t)).package!.priceMinor);
  });
});
