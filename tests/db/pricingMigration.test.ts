import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ListingPrice, snapshotKey } from '@/lib/listing';
import {
  applyPricingMigration,
  backupAffectedRecords,
  planPricingMigration,
  rollbackPricingMigration,
} from '@/server/pricingMigration';
import { getTeacherOffers, savePackage } from '@/server/pricingModel';
import { type ListingInput, previewListing, saveListing } from '@/server/teacherListings';
import { saveUsualTimes } from '@/server/teacherUsualTimes';
import { createAdult, testDb, uniq } from './helpers';

/**
 * CR-15 step A5 (FR-044; P-9, R-1): converting the earlier prices. Dry run first, apply only by the
 * Super Admin, idempotent, rolled back from the log. Synthetic teachers only.
 */
const sql = testDb();
const T0 = new Date('2026-10-19T09:00:00Z');
let admin = '';

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  admin = await createAdult(sql, 'superadmin');
});
afterAll(async () => {
  // Leave nothing converted for the test files that follow.
  await rollbackPricingMigration(sql, admin, T0);
  await sql.end();
});

async function teacher(prices: ListingPrice[], times = true) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', 'active', ${`mig-${uniq()}@example.com`}, 'Teacher M. Sample', 'x', 'Asia/Kolkata')
    RETURNING id`;
  const id = row!.id;
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${id}, 'self_registered', 'approved', ${['maths']}, ${[5]}, 'A short bio.', ${admin}, ${T0}, ${T0},
            ${['CBSE']}, ${4})`;
  if (times) await saveUsualTimes(sql, id, [{ weekday: 1, start: 1020, end: 1080 }], T0);
  const input: ListingInput = { subjects: ['maths'], grades: [5], curricula: ['CBSE'], experienceYears: 4, prices };
  const snap = await previewListing(sql, id, input);
  expect((await saveListing(sql, id, { ...input, previewKey: snapshotKey(snap!) }, 'publish', true, T0)).ok).toBe(true);
  const [l] = await sql<Array<{ id: string; public_id: string }>>`
    SELECT id, public_id FROM teacher_listings WHERE teacher_id = ${id}`;
  return { teacherId: id, listingId: l!.id, publicId: l!.public_id };
}

const HOURLY: ListingPrice = { model: 'hourly', currency: 'INR', amountMinor: 60000, sessions: null, minutes: 40 };
const WEEKLY: ListingPrice = { model: 'weekly', currency: 'INR', amountMinor: 120000, sessions: 2, minutes: 40 };
const MONTHLY8: ListingPrice = { model: 'monthly', currency: 'INR', amountMinor: 400000, sessions: 8, minutes: 40 };
const MONTHLY24: ListingPrice = { model: 'monthly', currency: 'SGD', amountMinor: 90000, sessions: 24, minutes: 30 };

const snapshotOf = async (listingId: string) => {
  const [r] = await sql<Array<{ published: Record<string, unknown>; n: number; h: string | null }>>`
    SELECT published, (SELECT count(*)::int FROM listing_prices p WHERE p.listing_id = l.id) AS n,
           hourly_rate_minor AS h
    FROM teacher_listings l WHERE id = ${listingId}`;
  return r!;
};

describe('CR-15 A5: converting the earlier prices (P-9)', () => {
  it('the dry run changes nothing and reports what would happen', async () => {
    const a = await teacher([HOURLY, WEEKLY, MONTHLY8]);
    const b = await teacher([MONTHLY24], false);
    const before = [await snapshotOf(a.listingId), await snapshotOf(b.listingId)];
    const plan = await planPricingMigration(sql);
    expect([await snapshotOf(a.listingId), await snapshotOf(b.listingId)]).toEqual(before);
    const ia = plan.items.find((i) => i.listingId === a.listingId)!;
    expect(ia).toMatchObject({
      hourly: 'converted',
      hiddenWeekly: 1,
      package: 'needs_review',
      packageIssues: ['details_missing', 'classes_below_minimum'],
      copyChanges: true,
    });
    const ib = plan.items.find((i) => i.listingId === b.listingId)!;
    expect(ib).toMatchObject({ hourly: 'none', package: 'needs_review', packageIssues: ['details_missing'] });
    expect(plan.totals.listings).toBeGreaterThanOrEqual(2);
  });

  it('OC-106: the dry run shows old and new amounts, proposals on earlier prices, and a backup', async () => {
    const a = await teacher([HOURLY, WEEKLY, MONTHLY8]);
    const ia = (await planPricingMigration(sql)).items.find((i) => i.listingId === a.listingId)!;
    expect(ia.oldPrices).toEqual([HOURLY, WEEKLY, MONTHLY8]);
    expect(ia.newHourly).toEqual({ currency: 'INR', rateMinor: 60000, minutes: 40, lessonMinor: 40000, offered: true });
    // The package price is the monthly amount as entered — never derived from the hourly rate.
    expect(ia.newPackage).toEqual({ currency: 'INR', priceMinor: 400000, classes: 8, minutes: 40 });
    expect(ia.negotiations).toEqual({ open: 0, accepted: 0 });
    const parent = await createAdult(sql, 'parent');
    expect(await backupAffectedRecords(sql, parent, T0)).toBeNull();
    const backup = await backupAffectedRecords(sql, admin, T0);
    const entry = backup!.listings.find((l) => l.listingId === a.listingId)!;
    expect(entry.listingPrices).toHaveLength(3);
    expect(JSON.stringify(backup)).not.toMatch(/@example\.com/);
  });

  it('only the Super Admin applies it; it converts without inventing values and keeps history', async () => {
    const a = await teacher([HOURLY, WEEKLY, MONTHLY8]);
    const c = await teacher([HOURLY, { ...HOURLY, amountMinor: 65000 }], false);
    const parent = await createAdult(sql, 'parent');
    expect(await applyPricingMigration(sql, parent, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await applyPricingMigration(sql, a.teacherId, T0)).toEqual({ ok: false, reason: 'not_allowed' });

    const r = await applyPricingMigration(sql, admin, T0);
    expect(r).toMatchObject({ ok: true, failed: 0 });
    // Hourly: same amount, currency and length; offered because a usual time fits a lesson.
    const oa = await getTeacherOffers(sql, a.teacherId);
    expect(oa.hourly).toEqual({ offered: true, currency: 'INR', rateMinor: 60000, minutes: 40 });
    // Monthly → Fixed package in Needs review, same price; nothing invented.
    expect(oa.package).toMatchObject({
      status: 'needs_review',
      priceMinor: 400000,
      currency: 'INR',
      classes: 8,
      minutes: 40,
      perWeek: null,
      weeks: null,
      times: [],
      negotiable: false,
      reviewIssues: ['details_missing', 'classes_below_minimum'],
    });
    expect(oa.package!.legacySource).toMatchObject({ model: 'monthly', amountMinor: 400000, sessions: 8 });
    // Public copy: earlier prices gone, hourly shown, no package; the earlier rows are all kept.
    const sa = await snapshotOf(a.listingId);
    expect(sa.published.prices).toEqual([]);
    expect(sa.published.hourly).toEqual({ currency: 'INR', rateMinor: 60000, minutes: 40 });
    expect(sa.published.package).toBeNull();
    expect(sa.n).toBe(3);
    // No usual times: the hourly rate is kept but not offered.
    const oc = await getTeacherOffers(sql, c.teacherId);
    expect(oc.hourly).toEqual({ offered: false, currency: 'INR', rateMinor: 60000, minutes: 40 });
    expect((await snapshotOf(c.listingId)).published.hourly).toBeNull();
    // A Needs review package can never be offered as it is.
    await expect(
      sql`UPDATE learning_packages SET status = 'offered' WHERE teacher_id = ${a.teacherId}`,
    ).rejects.toThrow();
  });

  it('listings of teachers no longer approved are reported and left unchanged', async () => {
    const e = await teacher([HOURLY, MONTHLY8]);
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${e.teacherId}`;
    const before = await snapshotOf(e.listingId);
    const item = (await planPricingMigration(sql)).items.find((i) => i.listingId === e.listingId)!;
    expect(item.skipped).toBe(true);
    const r = await applyPricingMigration(sql, admin, T0);
    expect(r).toMatchObject({ ok: true, failed: 0 });
    expect((r as { skipped: number }).skipped).toBeGreaterThanOrEqual(1);
    expect(await snapshotOf(e.listingId)).toEqual(before);
    expect((await getTeacherOffers(sql, e.teacherId)).package).toBeNull();
  });

  it('running it again changes nothing (idempotent)', async () => {
    const r = await applyPricingMigration(sql, admin, T0);
    expect(r).toMatchObject({ ok: true, converted: 0, failed: 0 });
    const plan = await planPricingMigration(sql);
    expect(plan.items.filter((i) => !i.skipped)).toEqual([]);
  });

  it('rollback restores the public copy and hourly fields; a package the teacher completed is kept', async () => {
    const d = await teacher([HOURLY, MONTHLY24]);
    const before = await snapshotOf(d.listingId);
    await applyPricingMigration(sql, admin, T0);
    // The teacher completes the converted package (now valid: 24 classes, 3 a week, 8 weeks).
    await saveUsualTimes(
      sql,
      d.teacherId,
      [
        { weekday: 1, start: 1020, end: 1080 },
        { weekday: 3, start: 1020, end: 1080 },
        { weekday: 5, start: 1020, end: 1080 },
      ],
      T0,
    );
    const done = await savePackage(
      sql,
      d.teacherId,
      {
        offer: true,
        currency: 'SGD',
        priceMinor: 90000,
        classes: 24,
        perWeek: 3,
        minutes: 30,
        weeks: 8,
        times: [
          { weekday: 1, start: 1020 },
          { weekday: 3, start: 1020 },
          { weekday: 5, start: 1020 },
        ],
        termsNote: '',
      },
      T0,
    );
    expect(done).toEqual({ ok: true, status: 'offered' });
    const parent = await createAdult(sql, 'parent');
    expect(await rollbackPricingMigration(sql, parent, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    const r = await rollbackPricingMigration(sql, admin, T0);
    expect(r.ok).toBe(true);
    expect((r as { packagesKept: number }).packagesKept).toBeGreaterThanOrEqual(1);
    const after = await snapshotOf(d.listingId);
    expect(after.published).toEqual(before.published);
    expect(after.h).toBeNull();
    expect(after.n).toBe(2);
    // The completed package stays (the teacher's own work); the others were removed.
    expect((await getTeacherOffers(sql, d.teacherId)).package?.status).toBe('offered');
    // After a rollback the dry run lists them again.
    const plan = await planPricingMigration(sql);
    expect(plan.items.some((i) => i.listingId === d.listingId)).toBe(true);
  });
});
