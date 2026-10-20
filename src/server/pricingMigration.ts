import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Currency, ListingPrice, ListingSnapshot } from '@/lib/listing';
import { checkHourly, lessonPriceMinor, PACKAGE_CLASSES_MIN, PACKAGE_TERMS_VERSION } from '@/lib/pricing';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';
import { packageNeedsDetails } from './notifications/events';
import { getUsualSlots } from './pricingModel';

/**
 * CR-15 step A5 (FR-044; P-9, R-1; §6 of CR-15): converting the earlier prices.
 *
 * - Hourly price → the listing's hourly rate (same amount, currency and length; never recalculated).
 *   Offered only if the teacher has a usual time long enough for a lesson; otherwise kept, not offered.
 * - Weekly and every-two-weeks prices → hidden from the public listing; the rows stay in
 *   listing_prices (history).
 * - Monthly price → a learning package at the same price, **Fixed**, in **Needs review**: classes a
 *   week, completion period and class times were never stored, so nothing is invented (R-1); fewer
 *   than 22 classes is flagged too. It is never shown until the teacher completes it.
 * - The public copy loses the earlier prices and shows the converted hourly rate (when offered).
 *
 * The plan is read-only. Applying needs the Super Admin and happens one listing at a time in its own
 * transaction; each change is logged with what was there before (pricing_migration_log), so running
 * it again changes nothing and it can be rolled back. listing_prices is never changed or deleted.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HourlyOutcome = 'converted' | 'kept_not_offered' | 'already_set' | 'none';
export type PackageOutcome = 'needs_review' | 'package_exists' | 'none';

export interface PlanItem {
  listingId: string;
  publicId: string;
  teacherId: string;
  teacherName: string;
  listingStatus: string;
  hourly: HourlyOutcome;
  /** Hourly prices after the first: kept in history, not used. */
  extraHourly: number;
  hiddenWeekly: number;
  hiddenBiweekly: number;
  package: PackageOutcome;
  packageIssues: string[];
  /** Extra monthly prices after the first: kept in history, not used. */
  extraMonthly: number;
  /** The public copy changes (earlier prices removed; hourly rate shown when offered). */
  copyChanges: boolean;
  /**
   * The teacher is no longer approved and active: the listing is hidden already and is left as it
   * is (the database refuses changes to it). It is converted if the teacher is approved again.
   */
  skipped: boolean;
  /** Evidence (OC-106 (1)): the earlier prices exactly as stored, and what they become. */
  oldPrices: ListingPrice[];
  newHourly: { currency: Currency; rateMinor: number; minutes: number; lessonMinor: number; offered: boolean } | null;
  newPackage: { currency: Currency; priceMinor: number; classes: number | null; minutes: number } | null;
  /** CR-13 negotiations on this teacher's earlier prices: open ones continue; agreed ones stay recorded. */
  negotiations: { open: number; accepted: number };
}

export interface MigrationPlan {
  items: PlanItem[];
  /** Listings converted earlier and not rolled back (skipped). */
  alreadyConverted: number;
  totals: {
    listings: number;
    /** Listings of teachers no longer approved and active (left unchanged). */
    skipped: number;
    hourlyConverted: number;
    hourlyNotOffered: number;
    hiddenWeekly: number;
    hiddenBiweekly: number;
    packagesNeedReview: number;
    belowMinimum: number;
    copiesChanged: number;
    /** Open CR-13 negotiations on earlier prices (they continue to their natural end). */
    openNegotiations: number;
    acceptedNegotiations: number;
  };
}

interface ListingRow {
  eligible: boolean;
  id: string;
  public_id: string;
  teacher_id: string;
  teacher_name: string;
  status: string;
  published: ListingSnapshot | null;
  hourly_offered: boolean;
  hourly_currency: Currency | null;
  hourly_rate_minor: string | null;
  hourly_minutes: number | null;
}

async function pricesOf(sql: Db, listingId: string): Promise<ListingPrice[]> {
  const rows = await sql<
    Array<{
      model: ListingPrice['model'];
      currency: Currency;
      amount_minor: number;
      sessions: number | null;
      minutes: number;
    }>
  >`SELECT model, currency, amount_minor, sessions, minutes FROM listing_prices WHERE listing_id = ${listingId}
    ORDER BY position`;
  return rows.map((r) => ({
    model: r.model,
    currency: r.currency,
    amountMinor: Number(r.amount_minor),
    sessions: r.sessions === null ? null : Number(r.sessions),
    minutes: Number(r.minutes),
  }));
}

/** What converting one listing would do (no writes). */
async function planOne(sql: Db, l: ListingRow): Promise<PlanItem> {
  const prices = await pricesOf(sql, l.id);
  const hourlyPrices = prices.filter((p) => p.model === 'hourly');
  const monthly = prices.filter((p) => p.model === 'monthly');
  let hourly: HourlyOutcome = 'none';
  if (l.hourly_rate_minor !== null) hourly = 'already_set';
  else if (hourlyPrices[0]) {
    const h = hourlyPrices[0];
    const ok = checkHourly(
      { currency: h.currency, rateMinor: h.amountMinor, minutes: h.minutes },
      await getUsualSlots(sql, l.teacher_id),
    );
    hourly = ok.length === 0 ? 'converted' : 'kept_not_offered';
  }
  const [pkg] = await sql<
    Array<{ status: string }>
  >`SELECT status FROM learning_packages WHERE teacher_id = ${l.teacher_id}`;
  let pkgOutcome: PackageOutcome = 'none';
  const issues: string[] = [];
  if (monthly[0]) {
    if (pkg) pkgOutcome = 'package_exists';
    else {
      pkgOutcome = 'needs_review';
      issues.push('details_missing');
      if ((monthly[0].sessions ?? 0) < PACKAGE_CLASSES_MIN) issues.push('classes_below_minimum');
    }
  }
  const copy = l.published;
  // Only a public copy that still shows earlier prices changes (nothing to remove otherwise).
  const copyChanges =
    !!copy && copy.hourly === undefined && copy.package === undefined && (copy.prices?.length ?? 0) > 0;
  const [neg] = await sql<Array<{ open: number; accepted: number }>>`
    SELECT count(*) FILTER (WHERE status IN ('pending', 'countered'))::int AS open,
           count(*) FILTER (WHERE status = 'accepted')::int AS accepted
    FROM rate_negotiations WHERE teacher_id = ${l.teacher_id} AND kind = 'legacy'`;
  const h0 = hourlyPrices[0];
  const m0 = monthly[0];
  return {
    oldPrices: prices,
    newHourly:
      (hourly === 'converted' || hourly === 'kept_not_offered') && h0
        ? {
            currency: h0.currency,
            rateMinor: h0.amountMinor,
            minutes: h0.minutes,
            lessonMinor: lessonPriceMinor(h0.amountMinor, h0.minutes),
            offered: hourly === 'converted',
          }
        : null,
    newPackage:
      pkgOutcome === 'needs_review' && m0
        ? { currency: m0.currency, priceMinor: m0.amountMinor, classes: m0.sessions, minutes: m0.minutes }
        : null,
    negotiations: { open: neg?.open ?? 0, accepted: neg?.accepted ?? 0 },
    listingId: l.id,
    publicId: l.public_id,
    teacherId: l.teacher_id,
    teacherName: l.teacher_name,
    listingStatus: l.status,
    hourly,
    extraHourly: Math.max(0, hourlyPrices.length - 1),
    hiddenWeekly: prices.filter((p) => p.model === 'weekly').length,
    hiddenBiweekly: prices.filter((p) => p.model === 'biweekly').length,
    package: pkgOutcome,
    packageIssues: issues,
    extraMonthly: Math.max(0, monthly.length - 1),
    copyChanges,
    skipped: !l.eligible,
  };
}

const LISTINGS = (sql: Db, only?: string) => sql<ListingRow[]>`
  SELECT l.id, l.public_id, l.teacher_id, a.display_name AS teacher_name, l.status, l.published,
         (a.status = 'active' AND EXISTS (SELECT 1 FROM teacher_profiles t
                                          WHERE t.account_id = a.id AND t.approval_status = 'approved')) AS eligible,
         l.hourly_offered, l.hourly_currency, l.hourly_rate_minor, l.hourly_minutes
  FROM teacher_listings l JOIN accounts a ON a.id = l.teacher_id
  WHERE (EXISTS (SELECT 1 FROM listing_prices p WHERE p.listing_id = l.id)
         OR (l.published IS NOT NULL AND NOT (l.published ? 'hourly') AND NOT (l.published ? 'package')))
    AND NOT EXISTS (SELECT 1 FROM pricing_migration_log g WHERE g.listing_id = l.id AND g.rolled_back_at IS NULL)
    ${only ? sql`AND l.id = ${only}` : sql``}
  ORDER BY l.created_at, l.id`;

const nothingToDo = (i: PlanItem) =>
  (i.hourly === 'none' || i.hourly === 'already_set') &&
  i.package !== 'needs_review' &&
  !i.copyChanges &&
  i.hiddenWeekly + i.hiddenBiweekly + i.extraHourly + i.extraMonthly === 0;

/** The read-only dry run (FR-044): what applying would do, listing by listing. */
export async function planPricingMigration(sql: Db): Promise<MigrationPlan> {
  const rows = await LISTINGS(sql);
  const items: PlanItem[] = [];
  for (const l of rows) {
    const item = await planOne(sql, l);
    if (!nothingToDo(item)) items.push(item);
  }
  const active = items.filter((i) => !i.skipped);
  const [done] = await sql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM pricing_migration_log WHERE rolled_back_at IS NULL`;
  const sum = (f: (i: PlanItem) => number) => active.reduce((a, i) => a + f(i), 0);
  return {
    items,
    alreadyConverted: done?.n ?? 0,
    totals: {
      listings: active.length,
      skipped: items.length - active.length,
      hourlyConverted: sum((i) => (i.hourly === 'converted' ? 1 : 0)),
      hourlyNotOffered: sum((i) => (i.hourly === 'kept_not_offered' ? 1 : 0)),
      hiddenWeekly: sum((i) => i.hiddenWeekly),
      hiddenBiweekly: sum((i) => i.hiddenBiweekly),
      packagesNeedReview: sum((i) => (i.package === 'needs_review' ? 1 : 0)),
      belowMinimum: sum((i) => (i.packageIssues.includes('classes_below_minimum') ? 1 : 0)),
      copiesChanged: sum((i) => (i.copyChanges ? 1 : 0)),
      openNegotiations: sum((i) => i.negotiations.open),
      acceptedNegotiations: sum((i) => i.negotiations.accepted),
    },
  };
}

async function isSuperAdmin(sql: Db, actorId: string): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const [a] = await sql<Array<{ ok: boolean }>>`
    SELECT (role = 'superadmin' AND status = 'active') AS ok FROM accounts WHERE id = ${actorId}`;
  return !!a?.ok;
}

export type ApplyResult =
  | { ok: true; runId: string; converted: number; skipped: number; failed: number }
  | { ok: false; reason: 'not_allowed' };

/** Applies the conversion, one listing per transaction; listings already converted are skipped. */
export async function applyPricingMigration(sql: Sql, actorId: string, now: Date = new Date()): Promise<ApplyResult> {
  if (!(await isSuperAdmin(sql, actorId))) return { ok: false, reason: 'not_allowed' };
  const runId = randomUUID();
  const candidates = await LISTINGS(sql);
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  for (const c of candidates) {
    if (!c.eligible) {
      skipped += 1;
      continue;
    }
    // One listing per transaction: a problem with one never stops or half-changes another.
    const did = await sql
      .begin(async (tx) => {
        // Lock the listing and look again: another run, or the teacher, may have changed it.
        await tx`SELECT id FROM teacher_listings WHERE id = ${c.id} FOR UPDATE`;
        const [l] = await LISTINGS(tx, c.id);
        if (!l || !l.eligible) return false;
        const plan = await planOne(tx, l);
        if (nothingToDo(plan)) return false;
        const prices = await pricesOf(tx, l.id);
        const h = prices.find((p) => p.model === 'hourly');
        const m = prices.find((p) => p.model === 'monthly');
        if (plan.hourly === 'converted' || plan.hourly === 'kept_not_offered') {
          await tx`UPDATE teacher_listings SET hourly_offered = ${plan.hourly === 'converted'},
                   hourly_currency = ${h!.currency}, hourly_rate_minor = ${h!.amountMinor}, hourly_minutes = ${h!.minutes}
                 WHERE id = ${l.id}`;
        }
        if (plan.package === 'needs_review' && m) {
          const [pkg] = await tx<Array<{ id: string }>>`
                 INSERT INTO learning_packages (teacher_id, status, currency, price_minor, classes, lesson_minutes,
                                                negotiable, terms_version, review_issues, legacy_source)
                 VALUES (${l.teacher_id}, 'needs_review', ${m.currency}, ${m.amountMinor}, ${m.sessions},
                         ${m.minutes}, false, ${PACKAGE_TERMS_VERSION}, ${plan.packageIssues},
                         ${tx.json({ model: 'monthly', currency: m.currency, amountMinor: m.amountMinor, sessions: m.sessions, minutes: m.minutes })})
                 RETURNING id`;
          // CR-16 §3 (assumption 3): the teacher is told in AA Pro; the home banner stays as it is.
          await packageNeedsDetails(tx, pkg!.id, l.teacher_id, now);
        }
        if (plan.copyChanges && l.published) {
          const hourly =
            plan.hourly === 'converted' && h
              ? { currency: h.currency, rateMinor: h.amountMinor, minutes: h.minutes }
              : null;
          const next = { ...l.published, prices: [], hourly, package: null };
          await tx`UPDATE teacher_listings SET published = ${tx.json(next as unknown as Parameters<typeof tx.json>[0])}
                 WHERE id = ${l.id}`;
        }
        await tx`INSERT INTO pricing_migration_log (run_id, listing_id, teacher_id, old_published, old_hourly,
                                                  package_created, summary, applied_by, applied_at)
               VALUES (${runId}, ${l.id}, ${l.teacher_id},
                       ${l.published ? tx.json(l.published as unknown as Parameters<typeof tx.json>[0]) : null},
                       ${tx.json({ offered: l.hourly_offered, currency: l.hourly_currency, rateMinor: l.hourly_rate_minor === null ? null : Number(l.hourly_rate_minor), minutes: l.hourly_minutes })},
                       ${plan.package === 'needs_review'},
                       ${tx.json({ hourly: plan.hourly, package: plan.package, issues: plan.packageIssues, hiddenWeekly: plan.hiddenWeekly, hiddenBiweekly: plan.hiddenBiweekly, copyChanges: plan.copyChanges })},
                       ${actorId}, ${now})`;
        return true;
      })
      .catch(() => {
        failed += 1;
        return false;
      });
    if (did) converted += 1;
  }
  await writeAudit(
    sql,
    {
      type: 'PRICING_MIGRATION_APPLIED',
      outcome: failed ? 'failure' : 'success',
      actorId,
      details: { run: runId, listings: converted, skipped, failed },
    },
    now,
  );
  return { ok: true, runId, converted, skipped, failed };
}

export type RollbackResult =
  { ok: true; restored: number; packagesKept: number } | { ok: false; reason: 'not_allowed' };

/**
 * Rolls back every live conversion: the public copy and hourly fields return to what they were; a
 * package the conversion created is removed **unless** the teacher has since completed or changed
 * it (then it is kept and counted). Earlier prices were never changed, so nothing else is needed.
 */
export async function rollbackPricingMigration(
  sql: Sql,
  actorId: string,
  now: Date = new Date(),
): Promise<RollbackResult> {
  if (!(await isSuperAdmin(sql, actorId))) return { ok: false, reason: 'not_allowed' };
  const logs = await sql<
    Array<{ id: string }>
  >`SELECT id FROM pricing_migration_log WHERE rolled_back_at IS NULL ORDER BY id`;
  let restored = 0;
  let packagesKept = 0;
  for (const { id } of logs) {
    await sql.begin(async (tx) => {
      const [g] = await tx<
        Array<{
          listing_id: string;
          teacher_id: string;
          old_published: ListingSnapshot | null;
          old_hourly: { offered: boolean; currency: Currency | null; rateMinor: number | null; minutes: number | null };
          package_created: boolean;
        }>
      >`SELECT listing_id, teacher_id, old_published, old_hourly, package_created FROM pricing_migration_log
        WHERE id = ${id} AND rolled_back_at IS NULL FOR UPDATE`;
      if (!g) return;
      const o = g.old_hourly;
      await tx`UPDATE teacher_listings SET hourly_offered = ${o.offered}, hourly_currency = ${o.currency},
                 hourly_rate_minor = ${o.rateMinor}, hourly_minutes = ${o.minutes},
                 published = CASE WHEN status IN ('published', 'paused') AND ${g.old_published !== null}
                                  THEN ${g.old_published ? tx.json(g.old_published as unknown as Parameters<typeof tx.json>[0]) : null}::jsonb
                                  ELSE published END
               WHERE id = ${g.listing_id}`;
      if (g.package_created) {
        const gone = await tx`DELETE FROM learning_packages WHERE teacher_id = ${g.teacher_id}
                              AND status = 'needs_review' AND legacy_source IS NOT NULL RETURNING id`;
        if (gone.length === 0) packagesKept += 1;
      }
      await tx`UPDATE pricing_migration_log SET rolled_back_at = ${now}, rolled_back_by = ${actorId} WHERE id = ${id}`;
      restored += 1;
    });
  }
  await writeAudit(
    sql,
    {
      type: 'PRICING_MIGRATION_ROLLED_BACK',
      outcome: 'success',
      actorId,
      details: { listings: restored, packagesKept },
    },
    now,
  );
  return { ok: true, restored, packagesKept };
}

/**
 * OC-106 (1): a backup of every record the conversion could touch, taken just before applying
 * (Super Admin download). Listing state, public copy, hourly fields, earlier prices and any learning
 * package — no email addresses, phone numbers or anything about children.
 */
export async function backupAffectedRecords(sql: Db, actorId: string, now: Date = new Date()) {
  if (!(await isSuperAdmin(sql, actorId))) return null;
  const rows = await LISTINGS(sql);
  const listings = [];
  for (const l of rows) {
    const [pkg] = await sql`SELECT * FROM learning_packages WHERE teacher_id = ${l.teacher_id}`;
    listings.push({
      listingId: l.id,
      publicId: l.public_id,
      teacherId: l.teacher_id,
      status: l.status,
      published: l.published,
      hourly: {
        offered: l.hourly_offered,
        currency: l.hourly_currency,
        rateMinor: l.hourly_rate_minor === null ? null : Number(l.hourly_rate_minor),
        minutes: l.hourly_minutes,
      },
      listingPrices: await pricesOf(sql, l.id),
      learningPackage: pkg ?? null,
    });
  }
  await writeAudit(
    sql,
    { type: 'PRICING_MIGRATION_BACKUP', outcome: 'success', actorId, details: { listings: listings.length } },
    now,
  );
  return { takenAt: now.toISOString(), purpose: 'CR-15 pricing migration backup (OC-106)', listings };
}
