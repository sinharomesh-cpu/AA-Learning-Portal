import 'server-only';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { type Currency, type ListingPrice, PRICE_MODELS, type PriceModel } from '@/lib/listing';
import { cleanText, DECLINE_REASONS, type DeclineReason, isDeclineReason } from '@/lib/linkRequests';
import {
  ANSWER_DAYS,
  DECLINE_WAIT_DAYS,
  DEFAULT_RATE_LIMITS,
  ENDED_SHOWN_DAYS,
  MESSAGE_MAX,
  modelLabel,
  type NegotiationKind,
  type NegotiationModel,
  type NegotiationStatus,
  OFFERS_MAX,
  parseOfferAmount,
  RATE_LIMIT_RANGES,
  type Side,
} from '@/lib/rateNegotiation';
import type { HourlyOffer, PackageTerms } from '@/lib/pricing';
import type { UsualTime } from '@/lib/usualTimes';
import { writeAudit } from './auth/audit';
import { queueEmail } from './auth/outbox';
import { CURRICULA } from './children';
import type { Db, Sql } from './db/client';
import * as inApp from './notifications/events';
import { inTx } from './notifications/notify';
import { isPricingV2, liveOfferFlags } from './pricingModel';
import { type ExpiryScope, liveListing } from './teacherEnquiries';

/**
 * Teacher rate negotiation (CR-13; FR-040; OC-98, OC-99, OC-100; boards RN1–RN7).
 *
 * A parent proposes a rate for one of a teacher's published asking prices, for their own child or
 * a prospective child (grade and curriculum only). The two sides take turns; at most six offers;
 * each offer gives the other side 14 days. Only that parent and that teacher see a negotiation;
 * everyone else, the AA Pro team included, gets "not found". An agreed rate is information only:
 * no booking, link, access or payment. Every rule is checked here, and migration 0021 checks turn
 * order, the offer limit, final statuses, expiry, one-active and the decline wait again.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const firstName = (name: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';
const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;

/** The usual time an hourly proposal was made for, as published (teacher's time zone). */
export interface ProposalSlot extends UsualTime {
  timeZone: string;
}

// ------------------------------------------------------------------ limits (FR-040.16)

export interface RateLimits {
  activePerParent: number;
  newPerDay: number;
}

export async function getRateLimits(sql: Db): Promise<RateLimits> {
  const rows = await sql<Array<{ key: string; value: number }>>`
    SELECT key, value FROM platform_settings WHERE key IN ('rate_active_per_parent', 'rate_new_per_day')`;
  const out = { ...DEFAULT_RATE_LIMITS };
  for (const r of rows) {
    if (r.key === 'rate_active_per_parent') out.activePerParent = Number(r.value);
    if (r.key === 'rate_new_per_day') out.newPerDay = Number(r.value);
  }
  return out;
}

/** Only the Super Admin changes the limits; every change is audited. */
export async function updateRateLimits(
  sql: Sql,
  actorId: string,
  input: { activePerParent: unknown; newPerDay: unknown },
  now: Date = new Date(),
): Promise<{ ok: true; limits: RateLimits } | { ok: false; reason: 'not_allowed' | 'invalid' }> {
  if (!UUID.test(actorId)) return { ok: false, reason: 'not_allowed' };
  const [actor] = await sql<Array<{ ok: boolean }>>`
    SELECT (role = 'superadmin' AND status = 'active') AS ok FROM accounts WHERE id = ${actorId}`;
  if (!actor?.ok) return { ok: false, reason: 'not_allowed' };
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').trim()));
  const next = { activePerParent: num(input.activePerParent), newPerDay: num(input.newPerDay) };
  for (const key of ['activePerParent', 'newPerDay'] as const) {
    const { min, max } = RATE_LIMIT_RANGES[key];
    if (!Number.isInteger(next[key]) || next[key] < min || next[key] > max) return { ok: false, reason: 'invalid' };
  }
  await sql.begin(async (tx) => {
    for (const [key, value] of [
      ['rate_active_per_parent', next.activePerParent],
      ['rate_new_per_day', next.newPerDay],
    ] as const) {
      await tx`INSERT INTO platform_settings (key, value, updated_by, updated_at)
               VALUES (${key}, ${value}, ${actorId}, ${now})
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                 updated_at = EXCLUDED.updated_at`;
    }
    await writeAudit(
      tx,
      {
        type: 'RATE_LIMITS_CHANGED',
        outcome: 'success',
        actorId,
        details: { activePerParent: next.activePerParent, newPerDay: next.newPerDay },
      },
      now,
    );
  });
  return { ok: true, limits: next };
}

/** FR-040.20: the AA Pro team sees counts only. */
export async function negotiationCounts(sql: Db): Promise<Record<NegotiationStatus, number>> {
  const rows = await sql<Array<{ status: NegotiationStatus; n: number }>>`
    SELECT status, count(*)::int AS n FROM rate_negotiations GROUP BY status`;
  const out: Record<NegotiationStatus, number> = {
    pending: 0,
    countered: 0,
    accepted: 0,
    declined: 0,
    withdrawn: 0,
    expired: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

// ------------------------------------------------------------------ teacher switches (FR-040.1–.3)

export interface TeacherRateSettings {
  on: boolean;
  models: PriceModel[];
}

export async function getTeacherRateSettings(sql: Db, teacherId: string): Promise<TeacherRateSettings> {
  if (!UUID.test(teacherId)) return { on: false, models: [] };
  const [row] = await sql<Array<{ on: boolean; models: string[] }>>`
    SELECT rate_negotiation_on AS on, negotiable_models AS models FROM teacher_profiles WHERE account_id = ${teacherId}`;
  return { on: Boolean(row?.on), models: PRICE_MODELS.filter((m) => row?.models.includes(m)) };
}

async function approvedTeacher(sql: Db, teacherId: string): Promise<boolean> {
  if (!UUID.test(teacherId)) return false;
  const [row] = await sql<Array<{ ok: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
                   WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'active'
                     AND t.approval_status = 'approved') AS ok`;
  return Boolean(row?.ok);
}

/** RN4 dashboard control. Turning it off stops new proposals only; open negotiations go on. */
export async function setRateNegotiation(
  sql: Sql,
  teacherId: string,
  on: boolean,
  now: Date = new Date(),
): Promise<{ ok: boolean }> {
  if (!(await approvedTeacher(sql, teacherId))) return { ok: false };
  await sql.begin(async (tx) => {
    await tx`UPDATE teacher_profiles SET rate_negotiation_on = ${on} WHERE account_id = ${teacherId}`;
    await writeAudit(
      tx,
      { type: 'RATE_NEGOTIATION_SWITCHED', outcome: 'success', actorId: teacherId, details: { on } },
      now,
    );
  });
  return { ok: true };
}

/**
 * RN4 listing editor: the switch beside each price. It applies to the price's basis (hourly,
 * weekly …), takes effect on the public page at once, and is saved with the listing.
 */
export async function setNegotiableModels(tx: Db, teacherId: string, models: string[], now: Date): Promise<void> {
  const clean = PRICE_MODELS.filter((m) => models.includes(m));
  const [before] = await tx<Array<{ models: string[] }>>`
    SELECT negotiable_models AS models FROM teacher_profiles WHERE account_id = ${teacherId}`;
  if ((before?.models ?? []).slice().sort().join() === [...clean].sort().join()) return;
  await tx`UPDATE teacher_profiles SET negotiable_models = ${clean} WHERE account_id = ${teacherId}`;
  await writeAudit(
    tx,
    { type: 'RATE_PRICES_SWITCHED', outcome: 'success', actorId: teacherId, details: { models: clean.join(',') } },
    now,
  );
}

/** RN1: which of a published listing's prices take proposals now (both switches on). */
export async function negotiablePriceFlags(sql: Db, publicId: string, now: Date = new Date()): Promise<boolean[]> {
  const live = await liveListing(sql, publicId, now);
  if (!live) return [];
  const s = await getTeacherRateSettings(sql, live.teacher_id);
  return live.published.prices.map((p) => s.on && s.models.includes(p.model));
}

// ------------------------------------------------------------------ expiry (FR-040.12)

/**
 * Negotiations whose 14 days have passed become Expired. Safe to call on every page.
 * CR-16: the expiry, its audit, the emails and both sides' in-app notifications are one
 * transaction (§13.2 (2)). With `scope`, only that teacher's or parent's own negotiations (§7.6).
 */
export async function expireRateNegotiations(sql: Db, now: Date = new Date(), scope?: ExpiryScope): Promise<number> {
  if (scope && !(scope.teacherId && UUID.test(scope.teacherId)) && !(scope.parentId && UUID.test(scope.parentId))) {
    return 0;
  }
  return inTx(sql, async (tx) => {
    const rows = await tx<
      Array<{ id: string; teacher_id: string; parent_id: string; t_email: string | null; p_email: string | null }>
    >`
      WITH e AS (
        UPDATE rate_negotiations SET status = 'expired', turn = NULL, ended_at = expires_at
        WHERE status IN ('pending', 'countered') AND expires_at <= ${now}
          ${scope?.teacherId ? tx`AND teacher_id = ${scope.teacherId}` : tx``}
          ${scope?.parentId ? tx`AND parent_id = ${scope.parentId}` : tx``}
        RETURNING id, teacher_id, parent_id)
      SELECT e.id, e.teacher_id, e.parent_id,
             CASE WHEN t.status = 'active' THEN t.email END AS t_email,
             CASE WHEN p.status = 'active' THEN p.email END AS p_email
      FROM e JOIN accounts t ON t.id = e.teacher_id JOIN accounts p ON p.id = e.parent_id`;
    for (const r of rows) {
      await writeAudit(tx, { type: 'RATE_EXPIRED', outcome: 'success', details: { negotiation: r.id } }, now);
      for (const to of [r.t_email, r.p_email]) {
        if (to) {
          await queueEmail(tx, {
            to,
            template: 'rate_proposal_expired',
            payload: {},
            dedupeKey: `rate_expired:${r.id}:${to}`,
          });
        }
      }
      await inApp.rateExpired(tx, r.id, now);
    }
    return rows.length;
  });
}

// ------------------------------------------------------------------ the proposal form (RN2)

export interface ProposalPrice extends ListingPrice {
  index: number;
}

export interface ProposalChild {
  id: string;
  name: string;
  grade: number;
  curriculum: string | null;
  /** The child's subjects that this teacher lists. */
  subjects: string[];
}

export interface DeclineWait {
  childKey: string;
  model: NegotiationModel;
  until: Date;
}

export interface ProposalForm {
  publicId: string;
  teacherId: string;
  teacherName: string;
  subjects: string[];
  /** Only the prices that take proposals now. */
  prices: ProposalPrice[];
  /** Prices shown as fixed (for information). */
  fixed: ListingPrice[];
  children: ProposalChild[];
  waits: DeclineWait[];
  limits: RateLimits;
  /**
   * CR-15 (switch on): the hourly offer with each time's live setting, and the package with its
   * own setting. Old prices are not offered for proposals then (`prices` is empty).
   */
  v2: {
    hourly: HourlyOffer | null;
    slots: Array<UsualTime & { negotiable: boolean }>;
    package: PackageTerms | null;
    packageNegotiable: boolean;
    timeZone: string;
  } | null;
}

/** The 7-day waits this parent has with this teacher (FR-040.15: shown wherever they could propose). */
export async function declineWaits(
  sql: Db,
  parentId: string,
  teacherId: string,
  now: Date = new Date(),
): Promise<DeclineWait[]> {
  if (!UUID.test(parentId) || !UUID.test(teacherId)) return [];
  const rows = await sql<Array<{ child_key: string; model: NegotiationModel; ended_at: Date }>>`
    SELECT child_key, model, max(ended_at) AS ended_at FROM rate_negotiations
    WHERE parent_id = ${parentId} AND teacher_id = ${teacherId} AND status = 'declined'
      AND ended_at > ${addDays(now, -DECLINE_WAIT_DAYS)}
    GROUP BY child_key, model`;
  return rows.map((r) => ({ childKey: r.child_key, model: r.model, until: addDays(r.ended_at, DECLINE_WAIT_DAYS) }));
}

/** The parent's 7-day waits with the teacher behind a public listing (RN1). */
export async function parentWaitsForListing(
  sql: Db,
  parentId: string,
  publicId: string,
  now: Date = new Date(),
): Promise<DeclineWait[]> {
  const live = await liveListing(sql, publicId, now);
  return live ? declineWaits(sql, parentId, live.teacher_id, now) : [];
}

/** "a Grade 4 (ICSE) child" for a prospective child's key. */
export function prospectiveLabel(childKey: string): string {
  const [, grade, curriculum] = childKey.split(':');
  return `a Grade ${grade}${curriculum ? ` (${curriculum})` : ''} child`;
}

export const ownChildKey = (childId: string) => `child:${childId}`;
export const prospectiveKey = (grade: number, curriculum: string | null) => `grade:${grade}:${curriculum ?? ''}`;

export async function proposalForm(
  sql: Db,
  parentId: string,
  publicId: string,
  now: Date = new Date(),
): Promise<ProposalForm | null> {
  if (!UUID.test(parentId)) return null;
  const live = await liveListing(sql, publicId, now);
  if (!live) return null;
  const settings = await getTeacherRateSettings(sql, live.teacher_id);
  const listed = live.published.subjects;
  const kids = await sql<
    Array<{ id: string; name: string; grade: number; curriculum: string | null; subjects: string[] }>
  >`
    SELECT a.id, a.display_name AS name, p.grade, p.curriculum, p.subjects
    FROM guardian_links g JOIN accounts a ON a.id = g.student_id JOIN student_profiles p ON p.account_id = a.id
    JOIN accounts par ON par.id = g.parent_id AND par.status = 'active' AND par.role = 'parent'
    WHERE g.parent_id = ${parentId} AND g.status = 'active' AND a.status = 'active'
    ORDER BY a.display_name`;
  const v2 = await isPricingV2(sql);
  const prices = v2 ? [] : live.published.prices.map((p, index) => ({ ...p, index }));
  const open = (p: ListingPrice) => settings.on && settings.models.includes(p.model);
  const flags = v2 ? await liveOfferFlags(sql, publicId, live.published.usualTimes) : null;
  return {
    publicId,
    teacherId: live.teacher_id,
    teacherName: live.published.name,
    subjects: listed,
    prices: prices.filter(open),
    fixed: v2 ? [] : live.published.prices.filter((p) => !open(p)),
    children: kids.map((k) => ({
      id: k.id,
      name: k.name,
      grade: Number(k.grade),
      curriculum: k.curriculum,
      subjects: listed.filter((s) => k.subjects.includes(s)),
    })),
    waits: await declineWaits(sql, parentId, live.teacher_id, now),
    limits: await getRateLimits(sql),
    v2: flags
      ? {
          hourly: live.published.hourly ?? null,
          slots: flags.slots,
          package: live.published.package ?? null,
          packageNegotiable: flags.packageNegotiable,
          timeZone: live.published.timeZone,
        }
      : null,
  };
}

// ------------------------------------------------------------------ proposing (FR-040.4–.8, .14–.16)

export interface ProposalInput {
  publicId: string;
  /** CR-15: 'hourly' (with `slot`) or 'package'; absent for the earlier prices (`priceIndex`). */
  kind?: 'hourly' | 'package';
  slot?: UsualTime | null;
  priceIndex: number;
  /** The parent's own child, or null for a prospective child. */
  childId: string | null;
  grade: number | null;
  curriculum: string | null;
  subject: string;
  amount: string;
  sessions: number | null;
  minutes: number;
  message: string;
}

export type OfferProblem = 'amount' | 'sessions' | 'minutes' | 'message';
export type ProposalProblem = OfferProblem | 'child' | 'grade' | 'curriculum' | 'subject' | 'price' | 'slot';

export type ProposeResult =
  | { ok: true; id: string; expiresAt: Date; teacherName: string }
  | { ok: false; reason: 'not_allowed' | 'gone' | 'not_negotiable' }
  | { ok: false; reason: 'invalid'; problems: ProposalProblem[] }
  | { ok: false; reason: 'already'; existingId: string }
  | { ok: false; reason: 'wait'; until: Date }
  | { ok: false; reason: 'active_limit'; limit: number }
  | { ok: false; reason: 'daily_limit'; limit: number; timeZone: string };

/** Offer terms checks shared by proposals and counter-offers (FR-040.7–.8). */
function checkOffer(
  model: NegotiationModel,
  input: { amount: string; sessions: number | null; minutes: number; message: string },
): { problems: OfferProblem[]; amountMinor: number; sessions: number | null; message: string | null } {
  const problems: OfferProblem[] = [];
  const amountMinor = parseOfferAmount(input.amount) ?? 0;
  if (!amountMinor) problems.push('amount');
  const perLesson = model === 'hourly' || model === 'package';
  const sessions = perLesson ? null : input.sessions;
  if (!perLesson && !(Number.isInteger(sessions) && sessions! >= 1 && sessions! <= 31)) problems.push('sessions');
  if (!(Number.isInteger(input.minutes) && input.minutes >= 10 && input.minutes <= 40)) problems.push('minutes');
  const message = cleanText(input.message, MESSAGE_MAX);
  if (message === 'too_long') problems.push('message');
  return { problems, amountMinor, sessions, message: message === 'too_long' ? null : message };
}

/** Start of the parent's calendar day (FR-040.16), in their own time zone. */
async function dayStart(sql: Db, now: Date, timeZone: string): Promise<Date> {
  const [row] = await sql<Array<{ start: Date }>>`
    SELECT (date_trunc('day', ${now}::timestamptz AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone}) AS start`;
  return row!.start;
}

async function refuse(tx: Db, actorId: string, reason: string, now: Date, negotiationId?: string): Promise<void> {
  await writeAudit(
    tx,
    {
      type: 'RATE_REFUSED',
      outcome: 'denied',
      actorId: UUID.test(actorId) ? actorId : null,
      details: { reason, ...(negotiationId && UUID.test(negotiationId) ? { negotiation: negotiationId } : {}) },
    },
    now,
  );
}

export async function proposeRate(
  sql: Sql,
  parentId: string,
  input: ProposalInput,
  baseUrl: string,
  now: Date = new Date(),
): Promise<ProposeResult> {
  if (!UUID.test(parentId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx): Promise<ProposeResult> => {
    // One parent at a time: limits, one-active and the decline wait are checked under this lock.
    const [parent] = await tx<Array<{ display_name: string; time_zone: string }>>`
      SELECT display_name, time_zone FROM accounts WHERE id = ${parentId} AND role = 'parent' AND status = 'active'
      FOR UPDATE`;
    if (!parent) return { ok: false, reason: 'not_allowed' };
    const live = await liveListing(tx, input.publicId, now, true);
    if (!live) return { ok: false, reason: 'gone' };
    // What is being negotiated: an earlier price (switch off) or, under CR-15, the hourly rate at
    // one negotiable time or the package's total price. Only the published copy counts.
    const v2 = await isPricingV2(tx);
    const settings = await getTeacherRateSettings(tx, live.teacher_id);
    let kind: NegotiationKind = 'legacy';
    let price: {
      model: NegotiationModel;
      currency: Currency;
      amountMinor: number;
      sessions: number | null;
      minutes: number;
    };
    let slot: ProposalSlot | null = null;
    let packageTerms: PackageTerms | null = null;
    if (!v2) {
      if (input.kind) return { ok: false, reason: 'not_negotiable' };
      const chosen = Number.isInteger(input.priceIndex) ? live.published.prices[input.priceIndex] : undefined;
      if (!chosen) return { ok: false, reason: 'invalid', problems: ['price'] };
      if (!settings.on || !settings.models.includes(chosen.model)) {
        await refuse(tx, parentId, 'not_negotiable', now);
        return { ok: false, reason: 'not_negotiable' };
      }
      price = chosen;
    } else if (input.kind === 'hourly') {
      const h = live.published.hourly;
      const t = input.slot;
      const shown =
        h && t
          ? live.published.usualTimes.find((u) => u.weekday === t.weekday && u.start === t.start && u.end === t.end)
          : undefined;
      if (!h || !shown) return { ok: false, reason: 'invalid', problems: ['slot'] };
      // P-8: only a time marked Open to offers now, with the teacher's master switch on.
      const flags = await liveOfferFlags(tx, input.publicId, [shown]);
      if (!flags.slots[0]?.negotiable) {
        await refuse(tx, parentId, 'not_negotiable', now);
        return { ok: false, reason: 'not_negotiable' };
      }
      kind = 'hourly';
      price = { model: 'hourly', currency: h.currency, amountMinor: h.rateMinor, sessions: null, minutes: h.minutes };
      slot = { weekday: shown.weekday, start: shown.start, end: shown.end, timeZone: live.published.timeZone };
    } else if (input.kind === 'package') {
      const pk = live.published.package;
      if (!pk) return { ok: false, reason: 'invalid', problems: ['price'] };
      const flags = await liveOfferFlags(tx, input.publicId, []);
      if (!flags.packageNegotiable) {
        await refuse(tx, parentId, 'not_negotiable', now);
        return { ok: false, reason: 'not_negotiable' };
      }
      kind = 'package';
      price = {
        model: 'package',
        currency: pk.currency,
        amountMinor: pk.priceMinor,
        sessions: null,
        minutes: pk.minutes,
      };
      packageTerms = pk;
    } else {
      // CR-15 (P-9): no new proposals on the earlier prices once the new model is on.
      await refuse(tx, parentId, 'not_negotiable', now);
      return { ok: false, reason: 'not_negotiable' };
    }

    const problems: ProposalProblem[] = [];
    const listed = live.published.subjects;
    let grade: number;
    let curriculum: string | null;
    let childKey: string;
    let allowed = listed;
    if (input.childId) {
      const [child] = UUID.test(input.childId)
        ? await tx<Array<{ grade: number; curriculum: string | null; subjects: string[] }>>`
            SELECT p.grade, p.curriculum, p.subjects
            FROM guardian_links g JOIN student_profiles p ON p.account_id = g.student_id
            JOIN accounts a ON a.id = g.student_id
            WHERE g.parent_id = ${parentId} AND g.student_id = ${input.childId} AND g.status = 'active'
              AND a.status = 'active'`
        : [];
      if (!child) return { ok: false, reason: 'invalid', problems: ['child'] };
      grade = Number(child.grade);
      curriculum = child.curriculum;
      childKey = ownChildKey(input.childId);
      allowed = listed.filter((s) => child.subjects.includes(s));
    } else {
      grade = input.grade ?? 0;
      curriculum = input.curriculum;
      if (!(Number.isInteger(grade) && grade >= 1 && grade <= 12)) problems.push('grade');
      if (curriculum === null || !(CURRICULA as readonly string[]).includes(curriculum)) problems.push('curriculum');
      childKey = prospectiveKey(grade, curriculum);
    }
    if (!allowed.includes(input.subject)) problems.push('subject');
    // P-6: hourly and package offers are an amount only; the length is the published one.
    const offer = checkOffer(
      price.model,
      kind === 'legacy' ? input : { ...input, minutes: price.minutes, sessions: null },
    );
    problems.push(...offer.problems);
    if (problems.length) return { ok: false, reason: 'invalid', problems };

    await expireRateNegotiations(tx, now);
    const [existing] = await tx<Array<{ id: string }>>`
      SELECT id FROM rate_negotiations
      WHERE parent_id = ${parentId} AND teacher_id = ${live.teacher_id} AND child_key = ${childKey}
        AND model = ${price.model} AND status IN ('pending', 'countered')`;
    if (existing) {
      await refuse(tx, parentId, 'already', now);
      return { ok: false, reason: 'already', existingId: existing.id };
    }
    const [declined] = await tx<Array<{ at: Date | null }>>`
      SELECT max(ended_at) AS at FROM rate_negotiations
      WHERE parent_id = ${parentId} AND teacher_id = ${live.teacher_id} AND child_key = ${childKey}
        AND model = ${price.model} AND status = 'declined'`;
    if (declined?.at && addDays(declined.at, DECLINE_WAIT_DAYS) > now) {
      await refuse(tx, parentId, 'decline_wait', now);
      return { ok: false, reason: 'wait', until: addDays(declined.at, DECLINE_WAIT_DAYS) };
    }
    const limits = await getRateLimits(tx);
    const since = await dayStart(tx, now, parent.time_zone);
    const [counts] = await tx<Array<{ active: number; today: number }>>`
      SELECT count(*) FILTER (WHERE status IN ('pending', 'countered'))::int AS active,
             count(*) FILTER (WHERE created_at >= ${since})::int AS today
      FROM rate_negotiations WHERE parent_id = ${parentId}`;
    if ((counts?.active ?? 0) >= limits.activePerParent) {
      await refuse(tx, parentId, 'active_limit', now);
      return { ok: false, reason: 'active_limit', limit: limits.activePerParent };
    }
    if ((counts?.today ?? 0) >= limits.newPerDay) {
      await refuse(tx, parentId, 'daily_limit', now);
      return { ok: false, reason: 'daily_limit', limit: limits.newPerDay, timeZone: parent.time_zone };
    }

    const expiresAt = addDays(now, ANSWER_DAYS);
    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO rate_negotiations (parent_id, teacher_id, listing_public_id, child_id, child_key, grade, curriculum,
                                     subject, model, currency, asking_amount_minor, asking_sessions, asking_minutes,
                                     status, turn, offers, created_at, last_action_at, expires_at, kind, slot,
                                     package_terms)
      VALUES (${parentId}, ${live.teacher_id}, ${input.publicId}, ${input.childId}, ${childKey}, ${grade},
              ${curriculum}, ${input.subject}, ${price.model}, ${price.currency}, ${price.amountMinor},
              ${price.sessions}, ${price.minutes}, 'pending', 'teacher', 1, ${now}, ${now}, ${expiresAt}, ${kind},
              ${slot ? tx.json(slot as unknown as Parameters<typeof tx.json>[0]) : null},
              ${packageTerms ? tx.json(packageTerms as unknown as Parameters<typeof tx.json>[0]) : null})
      RETURNING id`;
    await tx`INSERT INTO rate_offers (negotiation_id, seq, made_by, amount_minor, sessions, minutes, message, created_at)
             VALUES (${row!.id}, 1, 'parent', ${offer.amountMinor}, ${offer.sessions},
                     ${kind === 'legacy' ? input.minutes : price.minutes}, ${offer.message}, ${now})`;
    const [teacher] = await tx<Array<{ email: string; name: string }>>`
      SELECT email, display_name AS name FROM accounts WHERE id = ${live.teacher_id}`;
    await queueEmail(tx, {
      to: teacher!.email,
      template: 'rate_proposal_received',
      payload: {
        name: teacher!.name,
        parentFirstName: firstName(parent.display_name),
        basis: modelLabel(price.model),
        subject: subjectName(input.subject),
        link: `${baseUrl}/teacher/enquiries/rates`,
      },
      dedupeKey: `rate_offer:${row!.id}:1`,
    });
    await inApp.rateOffer(tx, row!.id, 1, 'teacher', now);
    await writeAudit(
      tx,
      {
        type: 'RATE_PROPOSED',
        outcome: 'success',
        actorId: parentId,
        subjectId: live.teacher_id,
        details: { negotiation: row!.id, model: price.model, kind },
      },
      now,
    );
    return { ok: true, id: row!.id, expiresAt, teacherName: live.published.name };
  });
}

// ------------------------------------------------------------------ answering (FR-040.10–.13)

interface Locked {
  id: string;
  parent_id: string;
  teacher_id: string;
  status: NegotiationStatus;
  turn: Side | null;
  offers: number;
  expires_at: Date;
  model: NegotiationModel;
  kind: NegotiationKind;
  asking_minutes: number;
  currency: Currency;
  subject: string;
  t_email: string | null;
  t_name: string;
  p_email: string | null;
  p_name: string;
}

export type ActionRefusal = 'not_found' | 'ended' | 'expired' | 'not_your_turn' | 'final_offer';

/** Locks a negotiation that belongs to this side; anyone else gets "not found" (FR-040.20). */
async function lockFor(
  tx: Db,
  side: Side,
  actorId: string,
  id: string,
  now: Date,
): Promise<{ n: Locked } | { reason: ActionRefusal }> {
  if (!UUID.test(actorId) || !UUID.test(id)) return { reason: 'not_found' };
  const [n] = await tx<Locked[]>`
    SELECT r.id, r.parent_id, r.teacher_id, r.status, r.turn, r.offers, r.expires_at, r.model, r.kind, r.asking_minutes,
           r.currency, r.subject,
           CASE WHEN t.status = 'active' THEN t.email END AS t_email, t.display_name AS t_name,
           CASE WHEN p.status = 'active' THEN p.email END AS p_email, p.display_name AS p_name
    FROM rate_negotiations r
    JOIN accounts t ON t.id = r.teacher_id
    JOIN accounts p ON p.id = r.parent_id
    WHERE r.id = ${id}
      AND ${side === 'parent' ? tx`r.parent_id = ${actorId} AND p.role = 'parent' AND p.status = 'active'` : tx`r.teacher_id = ${actorId} AND t.role = 'teacher' AND t.status = 'active'`}
    FOR UPDATE OF r`;
  if (!n) return { reason: 'not_found' };
  if ((n.status === 'pending' || n.status === 'countered') && n.expires_at <= now) {
    await expireRateNegotiations(tx, now);
    return { reason: 'expired' };
  }
  if (n.status === 'expired') return { reason: 'expired' };
  if (n.status !== 'pending' && n.status !== 'countered') return { reason: 'ended' };
  return { n: { ...n, offers: Number(n.offers) } };
}

const other = (side: Side): Side => (side === 'parent' ? 'teacher' : 'parent');

export type CounterResult =
  | { ok: true; offer: number; expiresAt: Date }
  | { ok: false; reason: ActionRefusal }
  | { ok: false; reason: 'invalid'; problems: OfferProblem[] };

/** FR-040.10–.12: a counter-offer by the side whose turn it is; never a 7th offer. */
export async function counterRate(
  sql: Sql,
  side: Side,
  actorId: string,
  id: string,
  input: { amount: string; sessions: number | null; minutes: number; message: string },
  baseUrl: string,
  now: Date = new Date(),
): Promise<CounterResult> {
  return sql.begin(async (tx): Promise<CounterResult> => {
    const locked = await lockFor(tx, side, actorId, id, now);
    if ('reason' in locked) {
      await refuse(tx, actorId, locked.reason, now, id);
      return { ok: false, reason: locked.reason };
    }
    const { n } = locked;
    if (n.turn !== side) {
      await refuse(tx, actorId, 'not_your_turn', now, id);
      return { ok: false, reason: 'not_your_turn' };
    }
    if (n.offers >= OFFERS_MAX) {
      await refuse(tx, actorId, 'final_offer', now, id);
      return { ok: false, reason: 'final_offer' };
    }
    // P-6: on hourly and package proposals a counter-offer changes the amount only.
    const terms = n.kind === 'legacy' ? input : { ...input, minutes: Number(n.asking_minutes), sessions: null };
    const offer = checkOffer(n.model, terms);
    if (offer.problems.length) return { ok: false, reason: 'invalid', problems: offer.problems };
    const seq = n.offers + 1;
    const expiresAt = addDays(now, ANSWER_DAYS);
    await tx`INSERT INTO rate_offers (negotiation_id, seq, made_by, amount_minor, sessions, minutes, message, created_at)
             VALUES (${n.id}, ${seq}, ${side}, ${offer.amountMinor}, ${offer.sessions}, ${terms.minutes},
                     ${offer.message}, ${now})`;
    await tx`UPDATE rate_negotiations
             SET status = 'countered', turn = ${other(side)}, offers = ${seq}, last_action_at = ${now},
                 expires_at = ${expiresAt}
             WHERE id = ${n.id}`;
    await notify(tx, n, side, 'rate_counter_offer', `${seq}`, baseUrl);
    await inApp.rateOffer(tx, n.id, seq, other(side), now);
    await writeAudit(
      tx,
      { type: 'RATE_COUNTERED', outcome: 'success', actorId, details: { negotiation: n.id, offer: seq, by: side } },
      now,
    );
    return { ok: true, offer: seq, expiresAt };
  });
}

async function notify(
  tx: Db,
  n: Locked,
  by: Side,
  template: 'rate_counter_offer' | 'rate_proposal_accepted' | 'rate_proposal_declined' | 'rate_proposal_withdrawn',
  key: string,
  baseUrl: string,
) {
  const toTeacher = by === 'parent';
  const to = toTeacher ? n.t_email : n.p_email;
  if (!to) return;
  await queueEmail(tx, {
    to,
    template,
    payload: {
      name: toTeacher ? n.t_name : firstName(n.p_name),
      // No child name, ever; the parent's first name only (FR-040.9).
      from: toTeacher ? firstName(n.p_name) : n.t_name,
      basis: modelLabel(n.model),
      link: `${baseUrl}${toTeacher ? '/teacher/enquiries/rates' : '/parent/enquiries/rates'}`,
    },
    dedupeKey: `rate_${template}:${n.id}:${key}`,
  });
}

export type AnswerResult = { ok: true } | { ok: false; reason: ActionRefusal | 'invalid' };

/** FR-040.10: accept or decline the latest offer, by the side whose turn it is. */
export async function answerRate(
  sql: Sql,
  side: Side,
  actorId: string,
  id: string,
  answer: 'accept' | 'decline',
  reason: string | null,
  baseUrl: string,
  now: Date = new Date(),
): Promise<AnswerResult> {
  if (answer === 'decline' && reason !== null && reason !== '' && !isDeclineReason(reason)) {
    return { ok: false, reason: 'invalid' };
  }
  const why: DeclineReason | null = answer === 'decline' && reason && isDeclineReason(reason) ? reason : null;
  return sql.begin(async (tx): Promise<AnswerResult> => {
    const locked = await lockFor(tx, side, actorId, id, now);
    if ('reason' in locked) {
      await refuse(tx, actorId, locked.reason, now, id);
      return { ok: false, reason: locked.reason };
    }
    const { n } = locked;
    if (n.turn !== side) {
      await refuse(tx, actorId, 'not_your_turn', now, id);
      return { ok: false, reason: 'not_your_turn' };
    }
    if (answer === 'accept') {
      const [last] = await tx<Array<{ amount_minor: string; sessions: number | null; minutes: number }>>`
        SELECT amount_minor, sessions, minutes FROM rate_offers WHERE negotiation_id = ${n.id}
        ORDER BY seq DESC LIMIT 1`;
      await tx`UPDATE rate_negotiations
               SET status = 'accepted', turn = NULL, ended_at = ${now}, ended_by = ${side}, last_action_at = ${now},
                   agreed_amount_minor = ${Number(last!.amount_minor)}, agreed_sessions = ${last!.sessions},
                   agreed_minutes = ${last!.minutes}
               WHERE id = ${n.id}`;
    } else {
      await tx`UPDATE rate_negotiations
               SET status = 'declined', turn = NULL, ended_at = ${now}, ended_by = ${side}, last_action_at = ${now},
                   decline_reason = ${why}
               WHERE id = ${n.id}`;
    }
    await notify(
      tx,
      n,
      side,
      answer === 'accept' ? 'rate_proposal_accepted' : 'rate_proposal_declined',
      'answer',
      baseUrl,
    );
    await inApp.rateAnswered(tx, n.id, side, answer, now);
    await writeAudit(
      tx,
      {
        type: answer === 'accept' ? 'RATE_ACCEPTED' : 'RATE_DECLINED',
        outcome: 'success',
        actorId,
        details: { negotiation: n.id, by: side, ...(why ? { reason: why } : {}) },
      },
      now,
    );
    return { ok: true };
  });
}

/** FR-040.10: the parent withdraws at any time before acceptance. No wait follows (OC-100). */
export async function withdrawRate(
  sql: Sql,
  parentId: string,
  id: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: ActionRefusal }> {
  return sql.begin(async (tx) => {
    const locked = await lockFor(tx, 'parent', parentId, id, now);
    if ('reason' in locked) {
      await refuse(tx, parentId, locked.reason, now, id);
      return { ok: false as const, reason: locked.reason };
    }
    const { n } = locked;
    await tx`UPDATE rate_negotiations
             SET status = 'withdrawn', turn = NULL, ended_at = ${now}, ended_by = 'parent', last_action_at = ${now}
             WHERE id = ${n.id}`;
    await notify(tx, n, 'parent', 'rate_proposal_withdrawn', 'withdrawn', baseUrl);
    await inApp.rateWithdrawn(tx, n.id, now);
    await writeAudit(
      tx,
      { type: 'RATE_WITHDRAWN', outcome: 'success', actorId: parentId, details: { negotiation: n.id } },
      now,
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------------------------ lists (RN3, RN5, RN7)

export interface OfferView {
  seq: number;
  by: Side;
  amountMinor: number;
  sessions: number | null;
  minutes: number;
  message: string | null;
  at: Date;
}

export interface NegotiationView {
  id: string;
  status: NegotiationStatus;
  turn: Side | null;
  offers: number;
  model: NegotiationModel;
  /** CR-15: 'hourly' (with `slot`), 'package' (with `packageTerms`) or 'legacy' (earlier prices). */
  kind: NegotiationKind;
  slot: ProposalSlot | null;
  packageTerms: PackageTerms | null;
  currency: Currency;
  subject: string;
  grade: number;
  curriculum: string | null;
  /** True for a prospective child (grade and curriculum only). */
  prospective: boolean;
  asking: { amountMinor: number; sessions: number | null; minutes: number };
  agreed: { amountMinor: number; sessions: number | null; minutes: number } | null;
  createdAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  endedBy: Side | null;
  declineReason: DeclineReason | null;
  history: OfferView[];
  /** After a decline: when the parent may start a new negotiation for the same teacher, child and basis. */
  askAgainFrom: Date | null;
}

export interface ParentNegotiation extends NegotiationView {
  teacherName: string;
  teacherId: string;
  publicId: string;
  childId: string | null;
  /** The parent's own child's name (never shown to the teacher). */
  childName: string | null;
}

export interface TeacherNegotiation extends NegotiationView {
  parentFirstName: string;
}

interface Row {
  id: string;
  status: NegotiationStatus;
  turn: Side | null;
  offers: number;
  model: NegotiationModel;
  kind: NegotiationKind;
  slot: ProposalSlot | null;
  package_terms: PackageTerms | null;
  currency: Currency;
  subject: string;
  grade: number;
  curriculum: string | null;
  child_id: string | null;
  child_key: string;
  asking_amount_minor: string;
  asking_sessions: number | null;
  asking_minutes: number;
  agreed_amount_minor: string | null;
  agreed_sessions: number | null;
  agreed_minutes: number | null;
  created_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  ended_by: Side | null;
  decline_reason: DeclineReason | null;
}

async function histories(sql: Db, ids: string[]): Promise<Map<string, OfferView[]>> {
  const out = new Map<string, OfferView[]>();
  if (ids.length === 0) return out;
  const rows = await sql<
    Array<{
      negotiation_id: string;
      seq: number;
      made_by: Side;
      amount_minor: string;
      sessions: number | null;
      minutes: number;
      message: string | null;
      created_at: Date;
    }>
  >`SELECT negotiation_id, seq, made_by, amount_minor, sessions, minutes, message, created_at
    FROM rate_offers WHERE negotiation_id = ANY(${ids}) ORDER BY negotiation_id, seq`;
  for (const r of rows) {
    const list = out.get(r.negotiation_id) ?? [];
    list.push({
      seq: Number(r.seq),
      by: r.made_by,
      amountMinor: Number(r.amount_minor),
      sessions: r.sessions === null ? null : Number(r.sessions),
      minutes: Number(r.minutes),
      message: r.message,
      at: r.created_at,
    });
    out.set(r.negotiation_id, list);
  }
  return out;
}

function view(r: Row, history: OfferView[]): NegotiationView {
  return {
    id: r.id,
    status: r.status,
    turn: r.turn,
    offers: Number(r.offers),
    model: r.model,
    kind: r.kind,
    slot: r.slot,
    packageTerms: r.package_terms,
    currency: r.currency,
    subject: r.subject,
    grade: Number(r.grade),
    curriculum: r.curriculum,
    prospective: !r.child_key.startsWith('child:'),
    asking: {
      amountMinor: Number(r.asking_amount_minor),
      sessions: r.asking_sessions === null ? null : Number(r.asking_sessions),
      minutes: Number(r.asking_minutes),
    },
    agreed:
      r.agreed_amount_minor === null
        ? null
        : {
            amountMinor: Number(r.agreed_amount_minor),
            sessions: r.agreed_sessions === null ? null : Number(r.agreed_sessions),
            minutes: Number(r.agreed_minutes),
          },
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    endedAt: r.ended_at,
    endedBy: r.ended_by,
    declineReason: r.decline_reason,
    history,
    askAgainFrom: r.status === 'declined' && r.ended_at ? addDays(r.ended_at, DECLINE_WAIT_DAYS) : null,
  };
}

const ROW_COLUMNS = (sql: Db) => sql`
  r.id, r.status, r.turn, r.offers, r.model, r.kind, r.slot, r.package_terms, r.currency, r.subject, r.grade, r.curriculum, r.child_id, r.child_key,
  r.asking_amount_minor, r.asking_sessions, r.asking_minutes, r.agreed_amount_minor, r.agreed_sessions,
  r.agreed_minutes, r.created_at, r.expires_at, r.ended_at, r.ended_by, r.decline_reason`;

/** RN3: the parent's negotiations: active and accepted ones always, other ended ones for 30 days. */
export async function listParentNegotiations(
  sql: Db,
  parentId: string,
  now: Date = new Date(),
): Promise<ParentNegotiation[]> {
  if (!UUID.test(parentId)) return [];
  await expireRateNegotiations(sql, now);
  const rows = await sql<
    Array<Row & { teacher_name: string; teacher_id: string; public_id: string; child_name: string | null }>
  >`
    SELECT ${ROW_COLUMNS(sql)}, t.display_name AS teacher_name, r.teacher_id, r.listing_public_id AS public_id,
           c.display_name AS child_name
    FROM rate_negotiations r
    JOIN accounts p ON p.id = r.parent_id AND p.role = 'parent' AND p.status = 'active'
    JOIN accounts t ON t.id = r.teacher_id
    LEFT JOIN accounts c ON c.id = r.child_id
    WHERE r.parent_id = ${parentId}
      AND (r.status IN ('pending', 'countered', 'accepted') OR r.ended_at > ${addDays(now, -ENDED_SHOWN_DAYS)})
    ORDER BY (r.status IN ('pending', 'countered')) DESC, r.last_action_at DESC`;
  const h = await histories(
    sql,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    ...view(r, h.get(r.id) ?? []),
    teacherName: r.teacher_name,
    teacherId: r.teacher_id,
    publicId: r.public_id,
    childId: r.child_id,
    childName: r.child_name,
  }));
}

/** RN5: the teacher's negotiations, minimum details only: never a child's name or id (FR-040.9). */
export async function listTeacherNegotiations(
  sql: Db,
  teacherId: string,
  now: Date = new Date(),
): Promise<TeacherNegotiation[]> {
  if (!(await approvedTeacher(sql, teacherId))) return [];
  await expireRateNegotiations(sql, now);
  const rows = await sql<Array<Row & { parent_name: string }>>`
    SELECT ${ROW_COLUMNS(sql)}, p.display_name AS parent_name
    FROM rate_negotiations r
    JOIN accounts p ON p.id = r.parent_id
    WHERE r.teacher_id = ${teacherId}
      AND (r.status IN ('pending', 'countered', 'accepted') OR r.ended_at > ${addDays(now, -ENDED_SHOWN_DAYS)})
    ORDER BY (r.turn = 'teacher') DESC NULLS LAST, (r.status IN ('pending', 'countered')) DESC, r.last_action_at DESC`;
  const h = await histories(
    sql,
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const v = view({ ...r, child_id: null }, h.get(r.id) ?? []);
    return { ...v, askAgainFrom: null, parentFirstName: firstName(r.parent_name) };
  });
}

/** RN4 panel: how many negotiations wait for this teacher's answer. */
export async function teacherWaitingCount(sql: Db, teacherId: string, now: Date = new Date()): Promise<number> {
  if (!UUID.test(teacherId)) return 0;
  const [row] = await sql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM rate_negotiations
    WHERE teacher_id = ${teacherId} AND turn = 'teacher' AND expires_at > ${now}`;
  return row?.n ?? 0;
}

export { DECLINE_REASONS };

export { modelLabel, type NegotiationKind, type NegotiationModel };
