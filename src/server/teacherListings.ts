import 'server-only';
import { setNegotiableModels } from './rateNegotiations';
import { SUBJECT_IDS } from '@/fixtures/subjects';
import {
  checkPrices,
  LISTING_DAYS,
  type ListingPrice,
  type ListingSnapshot,
  type PriceProblem,
  REMINDER_DAYS,
  snapshotKey,
} from '@/lib/listing';
import { writeAudit } from './auth/audit';
import { queueEmail } from './auth/outbox';
import { CURRICULA } from './children';
import type { Db, Sql } from './db/client';
import { EXPERIENCE_MAX } from './teacherProfile';
import { newPublicId } from './listingIds';
import { listingReminder } from './notifications/events';
import { isPricingV2, offersForSnapshot } from './pricingModel';
import { getUsualTimes } from './teacherUsualTimes';

/**
 * "Looking for students" listings for teachers (PR-D2, board D5; OC-77, OC-79 C, OC-80, OC-85).
 *
 * - Only an approved, active teacher creates, publishes, pauses, withdraws or renews their own
 *   listing; the teacher always comes from the session (L-1).
 * - Subjects and grades must be within the approved profile (server and database).
 * - Publishing shows the public exactly the details previewed and agreed to (`published`);
 *   agreement is asked again only when those details change (OC-80 C-6).
 * - A published listing is shown for 60 days; a reminder is queued 7 days before; renewal needs
 *   three confirmations (L-2, L-3). Expired listings are hidden until renewed.
 * - Prices are information only: AA Pro never charges, collects or pays out money.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 24 * 60 * 60 * 1000;

/** Consent wording version shown on board D5 (asked again when public details change). */
export const LISTING_CONSENT_VERSION = 'listing-public-display-2026-10-17';

/** OC-77(10): 10 listing saves per teacher per rolling 24 hours (a setting, OC-80 C-4). */
export function listingSavesPerDay(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AA_LIMIT_LISTING_SAVES_PER_DAY);
  return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 10;
}

export type ListingStatus = 'none' | 'draft' | 'published' | 'paused' | 'withdrawn' | 'expired';

export interface OwnListing {
  publicId: string | null;
  status: ListingStatus;
  /** Draft values being edited. */
  subjects: string[];
  grades: number[];
  prices: ListingPrice[];
  /** What the public sees now (published or paused), or null. */
  publicCopy: ListingSnapshot | null;
  /** What the public would see if the teacher published the current draft. */
  preview: ListingSnapshot;
  /** The draft (or profile) differs from the public copy, so publishing asks for agreement again. */
  changedSincePublish: boolean;
  publishedAt: Date | null;
  expiresAt: Date | null;
  /** Shown or expiring within 7 days, or already expired. */
  renewalDue: boolean;
  approvedSubjects: string[];
  approvedGrades: number[];
  savesLeftToday: number;
}

interface ProfileRow {
  name: string;
  email: string;
  time_zone: string;
  account_status: string;
  approval_status: string;
  subjects: string[];
  grades: number[];
  curricula: string[];
  experience_years: number | null;
  bio: string | null;
  photo_id: string | null;
}

async function loadProfile(sql: Db, teacherId: string, lock = false): Promise<ProfileRow | undefined> {
  const [row] = await sql<ProfileRow[]>`
    SELECT a.display_name AS name, a.email, a.time_zone, a.status AS account_status, t.approval_status,
           t.subjects, t.grades, t.curricula, t.experience_years, t.bio,
           (SELECT p.id FROM teacher_photos p WHERE p.teacher_id = a.id AND p.status = 'approved') AS photo_id
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
    WHERE a.id = ${teacherId} AND a.role = 'teacher'
    ${lock ? sql`FOR UPDATE OF a, t` : sql``}`;
  return row;
}

const eligible = (p: ProfileRow | undefined): p is ProfileRow =>
  !!p && p.account_status === 'active' && p.approval_status === 'approved';

interface ListingRow {
  id: string;
  public_id: string;
  status: 'draft' | 'published' | 'paused' | 'withdrawn';
  subjects: string[];
  grades: number[];
  published: ListingSnapshot | null;
  published_at: Date | null;
  expires_at: Date | null;
}

async function loadListing(sql: Db, teacherId: string, lock = false): Promise<ListingRow | undefined> {
  const [row] = await sql<ListingRow[]>`
    SELECT id, public_id, status, subjects, grades, published, published_at, expires_at
    FROM teacher_listings WHERE teacher_id = ${teacherId}
    ${lock ? sql`FOR UPDATE` : sql``}`;
  return row ? { ...row, grades: row.grades.map(Number) } : undefined;
}

async function loadPrices(sql: Db, listingId: string): Promise<ListingPrice[]> {
  const rows = await sql<
    Array<{
      model: ListingPrice['model'];
      currency: ListingPrice['currency'];
      amount_minor: number;
      sessions: number | null;
      minutes: number;
    }>
  >`SELECT model, currency, amount_minor, sessions, minutes FROM listing_prices
    WHERE listing_id = ${listingId} ORDER BY position`;
  return rows.map((r) => ({
    model: r.model,
    currency: r.currency,
    amountMinor: Number(r.amount_minor),
    sessions: r.sessions === null ? null : Number(r.sessions),
    minutes: Number(r.minutes),
  }));
}

const sortSubjects = (xs: string[]) => SUBJECT_IDS.filter((s) => xs.includes(s));
const sortGrades = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

async function snapshotOf(
  sql: Db,
  teacherId: string,
  p: ProfileRow,
  draft: { subjects: string[]; grades: number[]; prices: ListingPrice[] },
): Promise<ListingSnapshot> {
  const snap: ListingSnapshot = {
    name: p.name,
    subjects: sortSubjects(draft.subjects),
    grades: sortGrades(draft.grades),
    curricula: p.curricula,
    experienceYears: p.experience_years === null ? null : Number(p.experience_years),
    bio: p.bio ?? '',
    timeZone: p.time_zone,
    usualTimes: await getUsualTimes(sql, teacherId),
    prices: draft.prices,
    photoId: p.photo_id,
  };
  if (!(await isPricingV2(sql))) return snap;
  // CR-15: old prices are hidden (kept in listing_prices); the two offers are shown instead.
  const offers = await offersForSnapshot(sql, teacherId);
  return { ...snap, prices: [], hourly: offers.hourly, package: offers.package };
}

/** What publishing these values would show now (the same copy saveListing builds). */
export async function previewListing(
  sql: Db,
  teacherId: string,
  draft: { subjects: string[]; grades: number[]; prices: ListingPrice[] },
): Promise<ListingSnapshot | null> {
  if (!UUID.test(teacherId)) return null;
  const p = await loadProfile(sql, teacherId);
  return p ? snapshotOf(sql, teacherId, p, draft) : null;
}

function statusOf(row: ListingRow | undefined, now: Date): ListingStatus {
  if (!row) return 'none';
  if ((row.status === 'published' || row.status === 'paused') && row.expires_at && row.expires_at <= now)
    return 'expired';
  return row.status;
}

async function savesToday(sql: Db, teacherId: string, now: Date): Promise<number> {
  const [r] = await sql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM rate_events
    WHERE account_id = ${teacherId} AND kind = 'listing_save' AND occurred_at > ${new Date(now.getTime() - DAY)}`;
  return r?.n ?? 0;
}

/** The teacher's own listing for the editor (board D5). Null when the teacher may not list. */
export async function getOwnListing(sql: Db, teacherId: string, now: Date = new Date()): Promise<OwnListing | null> {
  if (!UUID.test(teacherId)) return null;
  const p = await loadProfile(sql, teacherId);
  if (!eligible(p)) return null;
  const row = await loadListing(sql, teacherId);
  const prices = row ? await loadPrices(sql, row.id) : [];
  const draft = row
    ? { subjects: row.subjects, grades: row.grades, prices }
    : { subjects: p.subjects, grades: p.grades.map(Number), prices: [] };
  const preview = await snapshotOf(sql, teacherId, p, draft);
  const status = statusOf(row, now);
  const publicCopy = row?.published ?? null;
  return {
    publicId: row?.public_id ?? null,
    status,
    subjects: draft.subjects,
    grades: draft.grades,
    prices,
    publicCopy,
    preview,
    changedSincePublish: publicCopy !== null && snapshotKey(publicCopy) !== snapshotKey(preview),
    publishedAt: row?.published_at ?? null,
    expiresAt: row?.expires_at ?? null,
    renewalDue:
      (status === 'published' || status === 'paused' || status === 'expired') &&
      !!row?.expires_at &&
      row.expires_at.getTime() - now.getTime() <= REMINDER_DAYS * DAY,
    approvedSubjects: sortSubjects(p.subjects),
    approvedGrades: sortGrades(p.grades.map(Number)),
    savesLeftToday: Math.max(0, listingSavesPerDay() - (await savesToday(sql, teacherId, now))),
  };
}

export interface ListingInput {
  subjects: string[];
  grades: number[];
  curricula: string[];
  experienceYears: number | null;
  prices: ListingPrice[];
  /** CR-13 RN4: the bases (hourly, weekly …) whose price switch is on; applies at once. */
  negotiableModels?: string[];
  /**
   * snapshotKey() of the preview the teacher saw when agreeing. Publishing is refused if the
   * details built on the server differ, so the agreement always matches what is shown.
   */
  previewKey?: string;
}

export type ListingProblem =
  | 'preview_changed'
  | 'subjects'
  | 'grades'
  | 'subjects_required'
  | 'grades_required'
  | 'curricula'
  | 'experience'
  | 'consent'
  | 'expired'
  | `price_${PriceProblem}`;

export type SaveListingResult =
  | { ok: true; outcome: 'draft_saved' | 'draft_saved_public_unchanged' | 'published' | 'unchanged' }
  | { ok: false; reason: 'not_allowed' | 'rate_limited' }
  | { ok: false; reason: 'invalid'; problems: ListingProblem[] };

/**
 * Saves the draft and, with `intent: 'publish'`, shows it publicly. Publishing asks for the
 * teacher's agreement whenever the public details would change.
 */
export async function saveListing(
  sql: Sql,
  teacherId: string,
  input: ListingInput,
  intent: 'draft' | 'publish',
  consent: boolean,
  now: Date = new Date(),
): Promise<SaveListingResult> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx): Promise<SaveListingResult> => {
    const p = await loadProfile(tx, teacherId, true);
    if (!eligible(p)) return { ok: false, reason: 'not_allowed' };
    if ((await savesToday(tx, teacherId, now)) >= listingSavesPerDay()) return { ok: false, reason: 'rate_limited' };

    const subjects = sortSubjects(input.subjects);
    const grades = sortGrades(input.grades);
    const problems: ListingProblem[] = [];
    if (input.subjects.some((s) => !p.subjects.includes(s))) problems.push('subjects');
    if (input.grades.some((g) => !p.grades.map(Number).includes(g))) problems.push('grades');
    if (!input.curricula.every((c) => (CURRICULA as readonly string[]).includes(c))) problems.push('curricula');
    const exp = input.experienceYears;
    if (exp !== null && !(Number.isInteger(exp) && exp >= 0 && exp <= EXPERIENCE_MAX)) problems.push('experience');
    // CR-15: under the new pricing model old prices are neither edited nor rewritten (P-9 history).
    const v2 = await isPricingV2(tx);
    const priceProblem = v2 ? null : checkPrices(input.prices);
    if (priceProblem) problems.push(`price_${priceProblem}`);
    if (intent === 'publish') {
      if (subjects.length === 0) problems.push('subjects_required');
      if (grades.length === 0) problems.push('grades_required');
    }
    if (problems.length) return { ok: false, reason: 'invalid', problems };

    // Curriculum and experience live on the profile (one source, D1a); saving here updates it.
    const curricula = CURRICULA.filter((c) => input.curricula.includes(c));
    await tx`UPDATE teacher_profiles SET curricula = ${curricula}, experience_years = ${exp}
             WHERE account_id = ${teacherId}`;

    let row = await loadListing(tx, teacherId, true);
    if (!row) {
      await tx`INSERT INTO teacher_listings (public_id, teacher_id, subjects, grades)
               VALUES (${newPublicId()}, ${teacherId}, ${subjects}, ${grades})`;
      row = (await loadListing(tx, teacherId, true))!;
    } else {
      await tx`UPDATE teacher_listings SET subjects = ${subjects}, grades = ${grades} WHERE id = ${row.id}`;
    }
    if (!v2) {
      await tx`DELETE FROM listing_prices WHERE listing_id = ${row.id}`;
      for (const [i, price] of input.prices.entries()) {
        await tx`INSERT INTO listing_prices (listing_id, position, model, currency, amount_minor, sessions, minutes)
                 VALUES (${row.id}, ${i + 1}, ${price.model}, ${price.currency}, ${price.amountMinor},
                         ${price.sessions}, ${price.minutes})`;
      }
    }
    if (input.negotiableModels && !v2) {
      const models = input.prices.map((x) => x.model);
      await setNegotiableModels(
        tx,
        teacherId,
        input.negotiableModels.filter((m) => (models as string[]).includes(m)),
        now,
      );
    }
    await tx`INSERT INTO rate_events (account_id, kind, occurred_at) VALUES (${teacherId}, 'listing_save', ${now})`;
    await tx`DELETE FROM rate_events WHERE account_id = ${teacherId} AND occurred_at < ${new Date(now.getTime() - 7 * DAY)}`;

    const fresh = await loadProfile(tx, teacherId);
    const prices = v2 ? await loadPrices(tx, row.id) : input.prices;
    const preview = await snapshotOf(tx, teacherId, fresh!, { subjects, grades, prices });
    const status = statusOf(row, now);
    const shownNow = row.status === 'published' || row.status === 'paused';

    if (intent === 'draft') {
      await writeAudit(
        tx,
        { type: 'LISTING_SAVED', outcome: 'success', actorId: teacherId, subjectId: teacherId },
        now,
      );
      return { ok: true, outcome: shownNow ? 'draft_saved_public_unchanged' : 'draft_saved' };
    }

    const unchanged = shownNow && row.published && snapshotKey(row.published) === snapshotKey(preview);
    if (status === 'expired') return { ok: false, reason: 'invalid', problems: ['expired'] };
    if (unchanged) {
      // Same details: no new agreement needed; a paused listing is shown again.
      if (row.status === 'paused') {
        await tx`UPDATE teacher_listings SET status = 'published' WHERE id = ${row.id}`;
        await writeAudit(
          tx,
          { type: 'LISTING_RESUMED', outcome: 'success', actorId: teacherId, subjectId: teacherId },
          now,
        );
        return { ok: true, outcome: 'published' };
      }
      return { ok: true, outcome: 'unchanged' };
    }
    if (!consent) return { ok: false, reason: 'invalid', problems: ['consent'] };
    if (input.previewKey !== snapshotKey(preview)) {
      // Nothing is published; the draft above is kept so the teacher can check and try again.
      return { ok: false, reason: 'invalid', problems: ['preview_changed'] };
    }
    const fresh60 = !shownNow;
    await tx`UPDATE teacher_listings
             SET status = 'published', published = ${tx.json(preview as unknown as Parameters<typeof tx.json>[0])},
                 consent_version = ${LISTING_CONSENT_VERSION}, consent_at = ${now},
                 published_at = ${fresh60 ? now : row.published_at},
                 expires_at = ${fresh60 ? new Date(now.getTime() + LISTING_DAYS * DAY) : row.expires_at},
                 reminder_queued_for = CASE WHEN ${fresh60} THEN NULL ELSE reminder_queued_for END
             WHERE id = ${row.id}`;
    await writeAudit(
      tx,
      {
        type: 'LISTING_PUBLISHED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: teacherId,
        details: { consentVersion: LISTING_CONSENT_VERSION, again: !fresh60 },
      },
      now,
    );
    return { ok: true, outcome: 'published' };
  });
}

export type ListingActionResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'confirm' };

/** Pause (hide, keep the details) or withdraw (close; publishing again starts a new period). */
export async function setListingStatus(
  sql: Sql,
  teacherId: string,
  action: 'pause' | 'withdraw',
  now: Date = new Date(),
): Promise<ListingActionResult> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx): Promise<ListingActionResult> => {
    // Pausing or withdrawing is always allowed for the teacher's own listing, even if they are
    // no longer eligible to publish: it only ever hides it.
    const row = await loadListing(tx, teacherId, true);
    if (!row) return { ok: false, reason: 'not_found' };
    if (action === 'pause') {
      if (row.status !== 'published') return { ok: false, reason: 'not_found' };
      await tx`UPDATE teacher_listings SET status = 'paused' WHERE id = ${row.id}`;
    } else {
      if (row.status !== 'published' && row.status !== 'paused') return { ok: false, reason: 'not_found' };
      await tx`UPDATE teacher_listings SET status = 'withdrawn', published = NULL, published_at = NULL,
                 expires_at = NULL, consent_at = NULL, consent_version = NULL, reminder_queued_for = NULL
               WHERE id = ${row.id}`;
    }
    await writeAudit(
      tx,
      {
        type: action === 'pause' ? 'LISTING_PAUSED' : 'LISTING_WITHDRAWN',
        outcome: 'success',
        actorId: teacherId,
        subjectId: teacherId,
      },
      now,
    );
    return { ok: true };
  });
}

/** L-3: renewal for another 60 days needs all three confirmations. */
export async function renewListing(
  sql: Sql,
  teacherId: string,
  confirm: { times: boolean; prices: boolean; subjects: boolean },
  now: Date = new Date(),
): Promise<ListingActionResult> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  if (!(confirm.times && confirm.prices && confirm.subjects)) return { ok: false, reason: 'confirm' };
  return sql.begin(async (tx): Promise<ListingActionResult> => {
    const p = await loadProfile(tx, teacherId, true);
    if (!eligible(p)) return { ok: false, reason: 'not_allowed' };
    const row = await loadListing(tx, teacherId, true);
    if (!row || (row.status !== 'published' && row.status !== 'paused')) return { ok: false, reason: 'not_found' };
    await tx`UPDATE teacher_listings SET expires_at = ${new Date(now.getTime() + LISTING_DAYS * DAY)},
               reminder_queued_for = NULL
             WHERE id = ${row.id}`;
    await writeAudit(
      tx,
      { type: 'LISTING_RENEWED', outcome: 'success', actorId: teacherId, subjectId: teacherId },
      now,
    );
    return { ok: true };
  });
}

/**
 * L-2: queue one reminder per listing period, 7 days before it ends (queued only, not sent,
 * until real email is approved). Called when a teacher opens /teacher/listing and, since CR-16
 * (Q-6 option B), by the shared once-a-minute sweep on signed-in requests (§7.3, §7.5). Each run
 * selects every listing whose window has started and whose period has no reminder yet (catch-up),
 * earliest-ending first. The in-app reminder is created in the same transaction as the email.
 * Returns how many were queued.
 */
export async function queueListingReminders(sql: Sql, baseUrl: string, now: Date = new Date()): Promise<number> {
  const due = await sql<
    Array<{ id: string; teacher_id: string; email: string; name: string; time_zone: string; expires_at: Date }>
  >`
    SELECT l.id, l.teacher_id, a.email, a.display_name AS name, a.time_zone, l.expires_at
    FROM teacher_listings l JOIN accounts a ON a.id = l.teacher_id
    JOIN teacher_profiles t ON t.account_id = a.id
    WHERE l.status = 'published' AND l.expires_at > ${now}
      AND l.expires_at <= ${new Date(now.getTime() + REMINDER_DAYS * DAY)}
      AND l.reminder_queued_for IS DISTINCT FROM l.expires_at
      AND a.status = 'active' AND t.approval_status = 'approved'
    ORDER BY l.expires_at, l.id
    LIMIT 100`;
  let queued = 0;
  for (const d of due) {
    const endsOn = new Intl.DateTimeFormat('en-GB', {
      timeZone: d.time_zone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d.expires_at);
    await sql.begin(async (tx) => {
      const updated = await tx`UPDATE teacher_listings SET reminder_queued_for = expires_at
                               WHERE id = ${d.id} AND reminder_queued_for IS DISTINCT FROM expires_at
                               RETURNING id`;
      if (updated.length === 0) return;
      await queueEmail(tx, {
        to: d.email,
        template: 'listing_expiry_reminder',
        payload: { name: d.name, endsOn, listingUrl: `${baseUrl}/teacher/listing` },
        dedupeKey: `listing_reminder:${d.id}:${d.expires_at.toISOString()}`,
      });
      await listingReminder(tx, { id: d.id, teacherId: d.teacher_id, expiresAt: d.expires_at, endsOn }, now);
      queued += 1;
    });
  }
  return queued;
}

/**
 * L-5: after an approved change narrows the teacher's subjects or grades, the listing keeps only
 * approved ones. A public listing left with no subject or grade goes back to draft. Called inside
 * the approver's transaction.
 */
export async function syncListingWithProfile(tx: Db, teacherId: string, now: Date = new Date()): Promise<void> {
  const [p] = await tx<Array<{ subjects: string[]; grades: number[] }>>`
    SELECT subjects, grades FROM teacher_profiles WHERE account_id = ${teacherId}`;
  const row = await loadListing(tx, teacherId, true);
  if (!p || !row) return;
  const okSubjects = (xs: string[]) => xs.filter((s) => p.subjects.includes(s));
  const okGrades = (xs: number[]) => xs.filter((g) => p.grades.map(Number).includes(Number(g)));
  const copy = row.published;
  let published: ListingSnapshot | null = copy;
  let status = row.status;
  if (copy) {
    const subjects = okSubjects(copy.subjects);
    const grades = okGrades(copy.grades);
    published = subjects.length && grades.length ? { ...copy, subjects, grades } : null;
    if (!published) status = 'draft';
  }
  const json = (v: ListingSnapshot) => tx.json(v as unknown as Parameters<typeof tx.json>[0]);
  if (published) {
    await tx`UPDATE teacher_listings
             SET subjects = ${okSubjects(row.subjects)}, grades = ${okGrades(row.grades)}, published = ${json(published)}
             WHERE id = ${row.id}`;
  } else {
    await tx`UPDATE teacher_listings
             SET subjects = ${okSubjects(row.subjects)}, grades = ${okGrades(row.grades)}, status = ${status},
                 published = NULL, published_at = NULL, expires_at = NULL, consent_at = NULL,
                 consent_version = NULL, reminder_queued_for = NULL
             WHERE id = ${row.id}`;
  }
  if (copy && (!published || snapshotKey(copy) !== snapshotKey(published))) {
    await writeAudit(
      tx,
      {
        type: published ? 'LISTING_NARROWED' : 'LISTING_RETURNED_TO_DRAFT',
        outcome: 'success',
        subjectId: teacherId,
        details: { reason: 'approved_profile_change' },
      },
      now,
    );
  }
}
