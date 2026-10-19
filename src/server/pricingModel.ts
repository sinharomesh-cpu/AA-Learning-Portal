import 'server-only';
import type { Currency } from '@/lib/listing';
import {
  checkHourly,
  checkPackage,
  type HourlyOffer,
  type HourlyProblem,
  PACKAGE_TERMS_VERSION,
  type PackageProblem,
  type PackageTerms,
  type PackageTime,
  TERMS_NOTE_MAX,
} from '@/lib/pricing';
import type { UsualTime } from '@/lib/usualTimes';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';
import { newPublicId } from './listingIds';

/**
 * CR-15 Phase A (FR-041, FR-042; OC-102 to OC-104): the teacher's hourly lessons, the Fixed /
 * Negotiable setting of each usual time, and the learning package — plus the Super Admin switch
 * that decides whether any of it is shown (pricing_model_v2, off until the owner approves).
 *
 * - The teacher always comes from the session; only an approved, active teacher changes offers.
 * - Hourly and package are independent: no function here reads one to set the other (P-7, P-8).
 * - Prices are never calculated from each other; the package price is whatever the teacher enters.
 * - Each save locks the teacher's account row, as saving usual times does, so a package can never
 *   be offered at a time that a simultaneous usual-times save removes.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------------- switch

/** Whether the CR-15 pricing model is shown (CR-15 reading 1). Off when the row is absent. */
export async function isPricingV2(sql: Db): Promise<boolean> {
  const [r] = await sql<Array<{ value: number }>>`SELECT value FROM platform_settings WHERE key = 'pricing_model_v2'`;
  return Number(r?.value) === 1;
}

/** Only the Super Admin turns it on or off; audited. */
export async function setPricingV2(
  sql: Sql,
  actorId: string,
  on: boolean,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'not_allowed' }> {
  if (!UUID.test(actorId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx) => {
    const [actor] = await tx<Array<{ ok: boolean }>>`
      SELECT (role = 'superadmin' AND status = 'active') AS ok FROM accounts WHERE id = ${actorId}`;
    if (!actor?.ok) return { ok: false, reason: 'not_allowed' } as const;
    if (on) {
      await tx`INSERT INTO platform_settings (key, value, updated_by, updated_at)
               VALUES ('pricing_model_v2', 1, ${actorId}, ${now})
               ON CONFLICT (key) DO UPDATE SET value = 1, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`;
    } else {
      await tx`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
    }
    await writeAudit(tx, { type: 'PRICING_MODEL_SWITCHED', outcome: 'success', actorId, details: { on } }, now);
    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------------- reading

export interface UsualSlot extends UsualTime {
  /** P-8: Negotiation available for hourly lessons at this time. */
  negotiable: boolean;
}

export interface OwnPackage extends Omit<
  PackageTerms,
  'currency' | 'priceMinor' | 'classes' | 'perWeek' | 'minutes' | 'weeks'
> {
  status: 'draft' | 'offered' | 'needs_review';
  currency: Currency | null;
  priceMinor: number | null;
  classes: number | null;
  perWeek: number | null;
  minutes: number | null;
  weeks: number | null;
  negotiable: boolean;
  reviewIssues: string[];
  /** The old monthly price this came from (P-9), shown during review. */
  legacySource: Record<string, unknown> | null;
}

export interface TeacherOffers {
  hourly: { offered: boolean; currency: Currency | null; rateMinor: number | null; minutes: number | null };
  slots: UsualSlot[];
  package: OwnPackage | null;
}

export async function getUsualSlots(sql: Db, teacherId: string): Promise<UsualSlot[]> {
  if (!UUID.test(teacherId)) return [];
  const rows = await sql<Array<{ weekday: number; start_minute: number; end_minute: number; negotiable: boolean }>>`
    SELECT weekday, start_minute, end_minute, negotiable FROM teacher_usual_times
    WHERE teacher_id = ${teacherId} ORDER BY weekday, start_minute`;
  return rows.map((r) => ({
    weekday: Number(r.weekday),
    start: Number(r.start_minute),
    end: Number(r.end_minute),
    negotiable: r.negotiable,
  }));
}

interface PackageRow {
  status: OwnPackage['status'];
  currency: Currency | null;
  price_minor: string | number | null;
  classes: number | null;
  classes_per_week: number | null;
  lesson_minutes: number | null;
  completion_weeks: number | null;
  times: PackageTime[];
  negotiable: boolean;
  terms_version: string | null;
  terms_note: string | null;
  review_issues: string[];
  legacy_source: Record<string, unknown> | null;
}

const num = (v: string | number | null) => (v === null ? null : Number(v));

function toOwnPackage(r: PackageRow): OwnPackage {
  return {
    status: r.status,
    currency: r.currency,
    priceMinor: num(r.price_minor),
    classes: num(r.classes),
    perWeek: num(r.classes_per_week),
    minutes: num(r.lesson_minutes),
    weeks: num(r.completion_weeks),
    times: r.times.map((t) => ({ weekday: Number(t.weekday), start: Number(t.start) })),
    negotiable: r.negotiable,
    termsVersion: r.terms_version ?? PACKAGE_TERMS_VERSION,
    termsNote: r.terms_note,
    reviewIssues: r.review_issues,
    legacySource: r.legacy_source,
  };
}

export async function getOwnPackage(sql: Db, teacherId: string): Promise<OwnPackage | null> {
  if (!UUID.test(teacherId)) return null;
  const [r] = await sql<PackageRow[]>`
    SELECT status, currency, price_minor, classes, classes_per_week, lesson_minutes, completion_weeks, times,
           negotiable, terms_version, terms_note, review_issues, legacy_source
    FROM learning_packages WHERE teacher_id = ${teacherId}`;
  return r ? toOwnPackage(r) : null;
}

export async function getTeacherOffers(sql: Db, teacherId: string): Promise<TeacherOffers> {
  const empty = { offered: false, currency: null, rateMinor: null, minutes: null };
  if (!UUID.test(teacherId)) return { hourly: empty, slots: [], package: null };
  const [l] = await sql<
    Array<{
      hourly_offered: boolean;
      hourly_currency: Currency | null;
      hourly_rate_minor: string | null;
      hourly_minutes: number | null;
    }>
  >`SELECT hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes FROM teacher_listings WHERE teacher_id = ${teacherId}`;
  return {
    hourly: l
      ? {
          offered: l.hourly_offered,
          currency: l.hourly_currency,
          rateMinor: num(l.hourly_rate_minor),
          minutes: num(l.hourly_minutes),
        }
      : empty,
    slots: await getUsualSlots(sql, teacherId),
    package: await getOwnPackage(sql, teacherId),
  };
}

/**
 * What a published listing shows for each offer (folded into the public copy by the listing's
 * preview-and-agree step, OC-77(1)). Null when not offered.
 */
export async function offersForSnapshot(
  sql: Db,
  teacherId: string,
): Promise<{ hourly: HourlyOffer | null; package: PackageTerms | null }> {
  const o = await getTeacherOffers(sql, teacherId);
  const h = o.hourly;
  const hourly =
    h.offered && h.currency && h.rateMinor && h.minutes
      ? { currency: h.currency, rateMinor: h.rateMinor, minutes: h.minutes }
      : null;
  const p = o.package;
  const pkg =
    p && p.status === 'offered'
      ? {
          currency: p.currency!,
          priceMinor: p.priceMinor!,
          classes: p.classes!,
          perWeek: p.perWeek!,
          minutes: p.minutes!,
          weeks: p.weeks!,
          times: [...p.times].sort((a, b) => a.weekday - b.weekday || a.start - b.start),
          termsVersion: p.termsVersion,
          termsNote: p.termsNote,
        }
      : null;
  return { hourly, package: pkg };
}

// ---------------------------------------------------------------------------------- writing

type Denied = { ok: false; reason: 'not_allowed' };

/** Locks and checks the teacher (approved and active), like saveUsualTimes. */
async function lockTeacher(tx: Db, teacherId: string): Promise<boolean> {
  const [t] = await tx`
    SELECT a.id FROM accounts a JOIN teacher_profiles p ON p.account_id = a.id
    WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'active' AND p.approval_status = 'approved'
    FOR UPDATE OF a`;
  return !!t;
}

export type SaveHourlyResult = { ok: true } | Denied | { ok: false; reason: 'invalid'; problems: HourlyProblem[] };

/**
 * FR-041: saves the hourly offer on the teacher's listing draft. Turning it off keeps the values
 * so they can be offered again. Never touches the package (P-7).
 */
export async function saveHourly(
  sql: Sql,
  teacherId: string,
  input: { offered: boolean; currency: string; rateMinor: number; minutes: number },
  now: Date = new Date(),
): Promise<SaveHourlyResult> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx): Promise<SaveHourlyResult> => {
    if (!(await lockTeacher(tx, teacherId))) return { ok: false, reason: 'not_allowed' };
    let [listing] = await tx<
      Array<{ id: string }>
    >`SELECT id FROM teacher_listings WHERE teacher_id = ${teacherId} FOR UPDATE`;
    if (!listing) {
      // First save before the rest of the listing: a draft listing within the approved profile.
      [listing] = await tx<Array<{ id: string }>>`
        INSERT INTO teacher_listings (public_id, teacher_id, subjects, grades)
        SELECT ${newPublicId()}, ${teacherId}, subjects, grades FROM teacher_profiles WHERE account_id = ${teacherId}
        RETURNING id`;
    }
    if (!listing) return { ok: false, reason: 'not_allowed' };
    const offer = { currency: input.currency as Currency, rateMinor: input.rateMinor, minutes: input.minutes };
    const problems = checkHourly(offer, await getUsualSlots(tx, teacherId));
    // Turning hourly lessons off never needs valid values; the stored ones are kept.
    if (input.offered && problems.length) return { ok: false, reason: 'invalid', problems };
    if (!input.offered) {
      await tx`UPDATE teacher_listings SET hourly_offered = false WHERE id = ${listing.id}`;
    } else {
      await tx`UPDATE teacher_listings SET hourly_offered = true, hourly_currency = ${offer.currency},
                 hourly_rate_minor = ${offer.rateMinor}, hourly_minutes = ${offer.minutes}
               WHERE id = ${listing.id}`;
    }
    await writeAudit(
      tx,
      {
        type: 'HOURLY_OFFER_SAVED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: teacherId,
        details: { offered: input.offered },
      },
      now,
    );
    return { ok: true };
  });
}

/**
 * P-8: the Fixed rate / Negotiation available setting of one usual time. Applies at once (as the
 * CR-13 switches did); never changes the package or any open proposal.
 */
export async function setSlotNegotiable(
  sql: Sql,
  teacherId: string,
  slot: UsualTime,
  negotiable: boolean,
  now: Date = new Date(),
): Promise<{ ok: true } | Denied | { ok: false; reason: 'not_found' }> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx) => {
    if (!(await lockTeacher(tx, teacherId))) return { ok: false, reason: 'not_allowed' } as const;
    const rows = await tx`
      UPDATE teacher_usual_times SET negotiable = ${negotiable}
      WHERE teacher_id = ${teacherId} AND weekday = ${slot.weekday} AND start_minute = ${slot.start}
        AND end_minute = ${slot.end}
      RETURNING id`;
    if (rows.length === 0) return { ok: false, reason: 'not_found' } as const;
    await writeAudit(
      tx,
      {
        type: 'SLOT_NEGOTIATION_CHANGED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: teacherId,
        details: { weekday: slot.weekday, start: slot.start, negotiable },
      },
      now,
    );
    return { ok: true } as const;
  });
}

export interface PackageInput {
  /** Offer the package (validated) or keep it as a draft. */
  offer: boolean;
  currency: string;
  priceMinor: number | null;
  classes: number | null;
  perWeek: number | null;
  minutes: number | null;
  weeks: number | null;
  times: PackageTime[];
  termsNote: string;
}

export type SavePackageResult =
  { ok: true; status: OwnPackage['status'] } | Denied | { ok: false; reason: 'invalid'; problems: PackageProblem[] };

const inRange = (n: number | null, lo: number, hi: number) => n === null || (Number.isInteger(n) && n >= lo && n <= hi);

/**
 * FR-042: saves the teacher's package. Offering it needs every rule (P-1, P-2, R-3 to R-6); a draft
 * may be incomplete. A package flagged for review (P-9) leaves review only when it is completed and
 * offered. The price is stored exactly as entered — never derived from the hourly rate (P-7).
 */
export async function savePackage(
  sql: Sql,
  teacherId: string,
  input: PackageInput,
  now: Date = new Date(),
): Promise<SavePackageResult> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  const note = input.termsNote.normalize('NFC').trim().slice(0, TERMS_NOTE_MAX) || null;
  const times = input.times.map((t) => ({ weekday: Number(t.weekday), start: Number(t.start) })).slice(0, 7);
  return sql.begin(async (tx): Promise<SavePackageResult> => {
    if (!(await lockTeacher(tx, teacherId))) return { ok: false, reason: 'not_allowed' };
    const current = await getOwnPackage(tx, teacherId);
    let status: OwnPackage['status'];
    let issues = current?.reviewIssues ?? [];
    if (input.offer) {
      const terms: PackageTerms = {
        currency: input.currency as Currency,
        priceMinor: input.priceMinor ?? 0,
        classes: input.classes ?? 0,
        perWeek: input.perWeek ?? 0,
        minutes: input.minutes ?? 0,
        weeks: input.weeks ?? 0,
        times,
        termsVersion: PACKAGE_TERMS_VERSION,
        termsNote: note,
      };
      const problems = checkPackage(terms, await getUsualSlots(tx, teacherId));
      if (problems.length) return { ok: false, reason: 'invalid', problems };
      status = 'offered';
      issues = [];
    } else {
      // A draft keeps what was typed, within the columns' ranges.
      const problems: PackageProblem[] = [];
      if (input.currency && !['INR', 'SGD', 'USD'].includes(input.currency)) problems.push('currency');
      if (!inRange(input.priceMinor, 1, 1_000_000_000)) problems.push('price');
      if (!inRange(input.classes, 1, 60)) problems.push('classes');
      if (!inRange(input.perWeek, 1, 7)) problems.push('per_week');
      if (!inRange(input.minutes, 10, 40)) problems.push('minutes');
      if (!inRange(input.weeks, 1, 26)) problems.push('weeks_long');
      if (problems.length) return { ok: false, reason: 'invalid', problems };
      status = current?.status === 'needs_review' ? 'needs_review' : 'draft';
    }
    const values = {
      status,
      currency: input.currency || null,
      price_minor: input.priceMinor,
      classes: input.classes,
      classes_per_week: input.perWeek,
      lesson_minutes: input.minutes,
      completion_weeks: input.weeks,
      times: tx.json(times),
      terms_version: PACKAGE_TERMS_VERSION,
      terms_note: note,
      review_issues: issues,
    };
    if (current) {
      await tx`UPDATE learning_packages SET ${tx(values)} WHERE teacher_id = ${teacherId}`;
    } else {
      await tx`INSERT INTO learning_packages ${tx({ ...values, teacher_id: teacherId })}`;
    }
    await writeAudit(
      tx,
      {
        type: 'PACKAGE_SAVED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: teacherId,
        details: { status, fromReview: current?.status === 'needs_review' && status === 'offered' },
      },
      now,
    );
    return { ok: true, status };
  });
}

/** Stop offering the package (PM8 "Remove the package"): kept as a draft, history kept. */
export async function withdrawPackage(
  sql: Sql,
  teacherId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | Denied | { ok: false; reason: 'not_found' }> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx) => {
    if (!(await lockTeacher(tx, teacherId))) return { ok: false, reason: 'not_allowed' } as const;
    const rows = await tx`UPDATE learning_packages SET status = 'draft', review_issues = '{}'
                          WHERE teacher_id = ${teacherId} AND status <> 'draft' RETURNING id`;
    if (rows.length === 0) return { ok: false, reason: 'not_found' } as const;
    await writeAudit(
      tx,
      { type: 'PACKAGE_WITHDRAWN', outcome: 'success', actorId: teacherId, subjectId: teacherId },
      now,
    );
    return { ok: true } as const;
  });
}

/** P-6, P-8: the package's own Fixed price / Negotiation available setting; applies at once. */
export async function setPackageNegotiable(
  sql: Sql,
  teacherId: string,
  negotiable: boolean,
  now: Date = new Date(),
): Promise<{ ok: true } | Denied | { ok: false; reason: 'not_found' }> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx) => {
    if (!(await lockTeacher(tx, teacherId))) return { ok: false, reason: 'not_allowed' } as const;
    const rows = await tx`UPDATE learning_packages SET negotiable = ${negotiable}
                          WHERE teacher_id = ${teacherId} RETURNING id`;
    if (rows.length === 0) return { ok: false, reason: 'not_found' } as const;
    await writeAudit(
      tx,
      {
        type: 'PACKAGE_NEGOTIATION_CHANGED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: teacherId,
        details: { negotiable },
      },
      now,
    );
    return { ok: true } as const;
  });
}

/**
 * Used by saveUsualTimes (inside its locked transaction): the offered package's class times that
 * would no longer fit the new usual times. Saving is refused if any (CR-15 reading 4).
 */
export async function packageTimesOutside(tx: Db, teacherId: string, next: UsualTime[]): Promise<PackageTime[]> {
  const p = await getOwnPackage(tx, teacherId);
  if (!p || p.status !== 'offered' || !p.minutes) return [];
  return p.times.filter(
    (t) => !next.some((u) => u.weekday === t.weekday && u.start <= t.start && t.start + p.minutes! <= u.end),
  );
}

/**
 * Public pages (P-8, R-8): the live Fixed / Negotiable state of each usual time shown on a
 * published copy, and of the package. Negotiable only while the teacher's master switch
 * ("Accept rate proposals", CR-13) is on. Times in the copy that the teacher has since removed
 * show as Fixed (no new proposals there).
 */
export async function liveOfferFlags(
  sql: Db,
  publicId: string,
  times: UsualTime[],
): Promise<{ slots: UsualSlot[]; packageNegotiable: boolean }> {
  const [t] = await sql<Array<{ teacher_id: string; master: boolean; pkg: boolean | null }>>`
    SELECT l.teacher_id, p.rate_negotiation_on AS master,
           (SELECT k.negotiable FROM learning_packages k WHERE k.teacher_id = l.teacher_id AND k.status = 'offered') AS pkg
    FROM teacher_listings l JOIN teacher_profiles p ON p.account_id = l.teacher_id
    WHERE l.public_id = ${publicId}`;
  if (!t) return { slots: times.map((x) => ({ ...x, negotiable: false })), packageNegotiable: false };
  const live = new Set(
    (await getUsualSlots(sql, t.teacher_id)).filter((s) => s.negotiable).map((s) => `${s.weekday}:${s.start}:${s.end}`),
  );
  return {
    slots: times.map((x) => ({ ...x, negotiable: t.master && live.has(`${x.weekday}:${x.start}:${x.end}`) })),
    packageNegotiable: t.master && t.pkg === true,
  };
}
