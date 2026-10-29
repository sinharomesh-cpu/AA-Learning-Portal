import 'server-only';
import { SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { formatLessonTime, localDate } from '@/lib/lessonDisplay';
import { zoneOffsetMinutes } from '@/lib/localTime';
import { wallTimeToUtc } from './assignments';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';
import { dropLessonReminders } from './lessonReminders';
import { askForMeetingPermission, purgeMeetingLinks } from './meetingLinks';
import { notify } from './notifications/notify';

/**
 * Human Teacher lessons (CR-17 PR 2; migration 0029, M1 revision 2; owner approval of the 16
 * defaults on 23 Oct 2026 and of PR 2 + M1 on 24 Oct 2026).
 *
 * - A parent requests an hourly lesson of 10–40 minutes for one child, with an approved, active
 *   teacher linked to that child in that subject. Offered start times are on the teacher's
 *   30-minute grid, with the whole lesson inside one of the teacher's usual times, 24 hours to
 *   4 weeks ahead, and not overlapping a confirmed lesson of the teacher or the child (§2.2).
 * - The teacher accepts or declines before the reply deadline (48 hours, or 2 hours before the
 *   start if sooner). Accepting closes any open request that overlaps as "time no longer free".
 *   The parent may withdraw a request; either side may cancel up to 30 minutes before the start;
 *   the teacher records the outcome after the lesson (D3A-2 to D3A-7, D3A-15 to D3A-17).
 * - The database enforces every rule again (0029); its time is the only clock for deadlines and
 *   the cancellation cut-off.
 * - Expiry needs no scheduler: overdue requests are shown as expired at once, and the CR-16 shared
 *   sweep (signed-in page loads, at most once a minute) records them and tells both sides.
 * - When a teacher is deactivated, or a link or subject ends, AA Pro closes open requests and
 *   cancels upcoming lessons, telling the parents (D3A-13, D3A-24). When a PARENT ends the link
 *   (removes the teacher, or unticks a child or subject), lessons starting within the next 30
 *   minutes stay scheduled and only the others are cancelled (OC-53 Option A, owner 25 Oct 2026;
 *   migration 0031). A kept lesson stays usable by its own teacher, parents and child.
 * - Who sees what: a parent sees the lessons of children they are an active parent of (D3A-25);
 *   a teacher sees their own lessons with students linked to them now in that subject; a child
 *   sees their own confirmed lessons, without prices (D3A-23). Anything else is "not found".
 * - Notifications are in-app only (OC-123 (4)); a teacher's never names the child.
 * Human Teacher module only: nothing here calls an AI provider. AA Pro takes no payment (OC-03):
 * the price is shown for information.
 */

export const LESSON_MINUTES_MIN = 10;
export const LESSON_MINUTES_MAX = 40;
export const LESSON_MINUTES_STEP = 5;
export const GRID_MINUTES = 30;
export const NOTICE_HOURS = 24;
export const WINDOW_DAYS = 28;
export const CANCEL_CUTOFF_MINUTES = 30;
export const OPEN_REQUESTS_MAX = 10;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const line = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
export const isSubject = (s: string): s is SubjectId => (SUBJECT_IDS as readonly string[]).includes(s);
const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;
const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';

export function validMinutes(m: number): boolean {
  return Number.isInteger(m) && m >= LESSON_MINUTES_MIN && m <= LESSON_MINUTES_MAX && m % LESSON_MINUTES_STEP === 0;
}

/**
 * F6 (D3A-15, owner approval 24 Oct 2026): the booking length offered by default for a teacher's
 * listed (usual) length of 10-40 whole minutes: the next lower 5-minute step (32 -> 30).
 */
export function defaultLessonMinutes(usual: number | null | undefined): number | null {
  if (!usual) return null;
  return Math.max(LESSON_MINUTES_MIN, Math.floor(usual / LESSON_MINUTES_STEP) * LESSON_MINUTES_STEP);
}

/** Lesson price: rate x minutes / 60, rounded once, half up (CR-15; same formula as 0029). */
export function lessonPrice(rateMinor: number, minutes: number): number {
  return Math.floor((rateMinor * minutes * 2 + 60) / 120);
}

/** Minutes after local midnight and the ISO weekday (1 = Monday) of an instant in a zone. */
function localClock(at: Date, timeZone: string): { minute: number; weekday: number } {
  const local = new Date(at.getTime() + zoneOffsetMinutes(at, timeZone) * MIN);
  return { minute: local.getUTCHours() * 60 + local.getUTCMinutes(), weekday: ((local.getUTCDay() + 6) % 7) + 1 };
}

// ======================================================================= who may book whom

export interface BookableTeacher {
  id: string;
  name: string;
  /** Subjects ticked on this child's link that the teacher is approved for. */
  subjects: SubjectId[];
  /** The listed hourly offer, or null when the teacher has none (they can't be booked yet). */
  hourly: { currency: string; rateMinor: number; minutes: number } | null;
  timeZone: string;
}

export interface BookableChild {
  id: string;
  name: string;
  grade: number | null;
  teachers: BookableTeacher[];
}

/**
 * The parent's children and, for each, the teachers they may request a lesson with now: an
 * active parent of an active child; an active link; an approved, active teacher (§2.2 (1)).
 */
export async function bookingOptions(sql: Db, parentId: string): Promise<BookableChild[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await sql<
    Array<{
      child_id: string;
      child_name: string;
      grade: number | null;
      teacher_id: string | null;
      teacher_name: string | null;
      subjects: string[] | null;
      zone: string | null;
      hourly: boolean | null;
      currency: string | null;
      rate: string | null;
      minutes: number | null;
    }>
  >`
    SELECT c.id AS child_id, c.display_name AS child_name, sp.grade,
           t.id AS teacher_id, t.display_name AS teacher_name, l.subjects, t.time_zone AS zone,
           tl.hourly_offered AS hourly, tl.hourly_currency AS currency, tl.hourly_rate_minor AS rate,
           tl.hourly_minutes AS minutes
    FROM guardian_links g
    JOIN accounts p ON p.id = g.parent_id AND p.role = 'parent' AND p.status = 'active'
    JOIN accounts c ON c.id = g.student_id AND c.role = 'student' AND c.status = 'active'
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    LEFT JOIN teacher_student_links l ON l.student_id = c.id AND l.status = 'active'
      AND EXISTS (SELECT 1 FROM accounts ta JOIN teacher_profiles tp ON tp.account_id = ta.id
                  WHERE ta.id = l.teacher_id AND ta.role = 'teacher' AND ta.status = 'active'
                    AND tp.approval_status = 'approved')
    LEFT JOIN accounts t ON t.id = l.teacher_id
    LEFT JOIN teacher_listings tl ON tl.teacher_id = t.id
    WHERE g.parent_id = ${parentId} AND g.status = 'active'
    ORDER BY c.display_name, c.id, t.display_name, t.id`;
  const out: BookableChild[] = [];
  for (const r of rows) {
    let child = out.find((c) => c.id === r.child_id);
    if (!child) {
      child = { id: r.child_id, name: r.child_name, grade: r.grade === null ? null : Number(r.grade), teachers: [] };
      out.push(child);
    }
    if (!r.teacher_id) continue;
    child.teachers.push({
      id: r.teacher_id,
      name: r.teacher_name ?? '',
      subjects: (r.subjects ?? []).filter(isSubject),
      hourly:
        r.hourly && r.currency && r.rate && r.minutes
          ? { currency: r.currency, rateMinor: Number(r.rate), minutes: Number(r.minutes) }
          : null,
      timeZone: r.zone ?? 'UTC',
    });
  }
  return out;
}

async function bookable(sql: Db, parentId: string, childId: string, teacherId: string, subject: string) {
  if (!UUID.test(childId) || !UUID.test(teacherId) || !isSubject(subject)) return null;
  const child = (await bookingOptions(sql, parentId)).find((c) => c.id === childId);
  const teacher = child?.teachers.find((t) => t.id === teacherId && t.subjects.includes(subject));
  return child && teacher ? { child, teacher } : null;
}

// ======================================================================= free start times

export interface FreeTime {
  startsAt: Date;
  currency: string;
  rateMinor: number;
  priceMinor: number;
  basis: 'agreed' | 'listed';
}

export interface FreeDay {
  /** The day in the parent's time zone, YYYY-MM-DD. */
  date: string;
  times: FreeTime[];
  /** Start times on this day hidden because this child already has an open request for them. */
  alreadyRequested: number;
}

export type FreeTimesResult =
  { ok: true; days: FreeDay[]; teacherZone: string } | { ok: false; reason: 'not_linked' | 'invalid' | 'no_rate' };

/**
 * Start times a parent may request (§2.2 (3)): on the teacher's 30-minute grid in the teacher's
 * time zone, the whole lesson inside one usual-time range, 24 hours to 4 weeks ahead, not
 * overlapping a confirmed lesson of the teacher or the child, and not already requested for this
 * child with this teacher. Each date is converted on its own, so daylight-saving changes are
 * right. The price of each time comes from the database's own rule (0029 lessons_price_for).
 */
export async function freeTimes(
  sql: Db,
  parentId: string,
  q: { childId: string; teacherId: string; subject: string; minutes: number; parentZone: string },
  now: Date = new Date(),
): Promise<FreeTimesResult> {
  if (!validMinutes(q.minutes)) return { ok: false, reason: 'invalid' };
  const b = await bookable(sql, parentId, q.childId, q.teacherId, q.subject);
  if (!b) return { ok: false, reason: 'not_linked' };
  if (!b.teacher.hourly) return { ok: false, reason: 'no_rate' };
  const zone = b.teacher.timeZone;
  const usual = await sql<Array<{ weekday: number; start_minute: number; end_minute: number }>>`
    SELECT weekday, start_minute, end_minute FROM teacher_usual_times WHERE teacher_id = ${q.teacherId}`;
  const earliest = now.getTime() + NOTICE_HOURS * HOUR;
  const latest = now.getTime() + WINDOW_DAYS * DAY;
  const starts: Date[] = [];
  for (let d = 0; d <= WINDOW_DAYS + 1; d += 1) {
    const date = localDate(new Date(now.getTime() + d * DAY), zone);
    const weekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    for (const u of usual.filter((x) => Number(x.weekday) === weekday)) {
      for (let m = Number(u.start_minute); m + q.minutes <= Number(u.end_minute); m += GRID_MINUTES) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const at = wallTimeToUtc(date, `${hh}:${mm}`, zone);
        if (!at) continue;
        // A wall time inside a daylight-saving gap does not exist: skip it (the database would refuse it).
        if (localClock(at, zone).minute !== m || localDate(at, zone) !== date) continue;
        if (at.getTime() < earliest || at.getTime() > latest) continue;
        if (!starts.some((s) => s.getTime() === at.getTime())) starts.push(at);
      }
    }
  }
  starts.sort((a, b2) => a.getTime() - b2.getTime());
  if (starts.length === 0) return { ok: true, days: [], teacherZone: zone };
  const busy = await sql<Array<{ s: Date; e: Date }>>`
    SELECT starts_at AS s, ends_at AS e FROM lessons
    WHERE status = 'confirmed' AND (teacher_id = ${q.teacherId} OR student_id = ${q.childId})
      AND ends_at > ${starts[0]!} AND starts_at < ${new Date(starts.at(-1)!.getTime() + q.minutes * MIN)}`;
  const requested = await sql<Array<{ s: Date }>>`
    SELECT starts_at AS s FROM lessons
    WHERE teacher_id = ${q.teacherId} AND student_id = ${q.childId} AND status = 'requested' AND reply_deadline > now()`;
  const alreadyRequested: Date[] = [];
  const free = starts.filter((s) => {
    const e = s.getTime() + q.minutes * MIN;
    if (busy.some((x) => x.s.getTime() < e && s.getTime() < x.e.getTime())) return false;
    if (requested.some((r) => r.s.getTime() === s.getTime())) {
      alreadyRequested.push(s);
      return false;
    }
    return true;
  });
  if (free.length === 0) return { ok: true, days: [], teacherZone: zone };
  let prices: Array<{ s: Date; basis: 'agreed' | 'listed'; rate: string; cur: string }>;
  try {
    prices = await sql`
      SELECT x.s, p.basis, p.rate, p.cur
      FROM unnest(${free.map((d) => d.toISOString())}::timestamptz[]) AS x(s),
           LATERAL lessons_price_for(${q.teacherId}::uuid, ${q.childId}::uuid, ${q.subject}, x.s, ${q.minutes}::int) p
      ORDER BY x.s`;
  } catch {
    return { ok: false, reason: 'no_rate' };
  }
  const days: FreeDay[] = [];
  for (const p of prices) {
    const date = localDate(p.s, q.parentZone);
    let day = days.find((x) => x.date === date);
    if (!day) {
      day = { date, times: [], alreadyRequested: 0 };
      days.push(day);
    }
    const rate = Number(p.rate);
    day.times.push({
      startsAt: p.s,
      currency: p.cur,
      rateMinor: rate,
      priceMinor: lessonPrice(rate, q.minutes),
      basis: p.basis,
    });
  }
  // F8: say how many times are hidden on a shown day because this child already asked for them.
  for (const s of alreadyRequested) {
    const day = days.find((x) => x.date === localDate(s, q.parentZone));
    if (day) day.alreadyRequested += 1;
  }
  return { ok: true, days, teacherZone: zone };
}

// ======================================================================= requesting

export interface RequestInput {
  childId: unknown;
  teacherId: unknown;
  subject: unknown;
  minutes: unknown;
  /** ISO instant chosen from freeTimes. */
  startsAt: unknown;
  /** The price the parent was shown (all three must match the database's, or the request is refused). */
  priceMinor: unknown;
  currency: unknown;
  basis: unknown;
  /**
   * TL-1 (D-TLS-6, D-TLS-7), optional: up to five chapter ids from chaptersForRequest, or one
   * free-text topic (1–120 characters); never both. Nothing chosen = exactly today's request.
   */
  chapterIds?: unknown;
  topic?: unknown;
}

/** TL-1: at most this many chapters on one lesson (D-TLS-6; also enforced by migration 0032). */
export const MAX_LESSON_CHAPTERS = 5;
/** TL-1: the longest topic (also enforced by migration 0032). */
export const MAX_TOPIC_LENGTH = 120;

export type RequestReason =
  | 'not_allowed'
  | 'not_linked'
  | 'invalid'
  | 'notice'
  | 'window'
  | 'usual_times'
  | 'busy'
  | 'duplicate'
  | 'limit'
  | 'price_changed'
  | 'no_rate'
  | 'chapters';

export type RequestResult = { ok: true; id: string } | { ok: false; reason: RequestReason };

/** Maps a database refusal from 0029 to a plain reason (the database checks every rule again). */
function reasonFromDb(error: unknown): RequestReason | null {
  const e = error as { code?: string; message?: string; constraint_name?: string; table_name?: string };
  // TL-1 (0032): a chapter or topic the database refused (not shared, changed meanwhile, too many).
  if (e.table_name === 'lesson_chapters' || /chapter|topic/.test(e.message ?? '')) return 'chapters';
  if (e.code === '23505') return 'duplicate';
  if (e.code === '42501') return 'not_allowed';
  if (e.code !== '23514' && e.code !== 'P0001') return null;
  const m = e.message ?? '';
  if (m.includes('24 hours ahead')) return 'notice';
  if (m.includes('4 weeks ahead')) return 'window';
  if (m.includes('usual times') || m.includes('30-minute grid')) return 'usual_times';
  if (m.includes('price has changed')) return 'price_changed';
  if (m.includes('no hourly rate')) return 'no_rate';
  if (m.includes('at most 10')) return 'limit';
  if (m.includes('approved, active and linked')) return 'not_linked';
  if (m.includes('active child account')) return 'not_allowed';
  return 'invalid';
}

/**
 * TL-1: the parent's optional chapters (ids, unique, at most five) or one topic, never both.
 * Returns null when the choice is not allowed; the database checks each chapter again (0032).
 */
function lessonChoices(chapterIds: unknown, topic: unknown): { chapterIds: string[]; topic: string | null } | null {
  const raw =
    chapterIds === undefined || chapterIds === null ? [] : Array.isArray(chapterIds) ? chapterIds : [chapterIds];
  // Anything that is not a chapter id string refuses the request (never silently dropped).
  if (raw.some((v) => typeof v !== 'string')) return null;
  const ids = (raw as string[]).map((v) => v.trim()).filter((v) => v !== '');
  if (ids.some((v) => !UUID.test(v)) || new Set(ids).size !== ids.length || ids.length > MAX_LESSON_CHAPTERS)
    return null;
  const t = typeof topic === 'string' ? topic.replace(/\s+/g, ' ').trim() : '';
  if (t.length > MAX_TOPIC_LENGTH) return null;
  if (t && ids.length) return null;
  return { chapterIds: ids, topic: t || null };
}

// ======================================================================= teacher-planned chapters (TL-3)

/** WF-10 (TLS 5.1-4): what the teacher intends for a planned chapter (0034 lesson_chapters.intent). */
export const CHAPTER_INTENTS = ['new', 'continue', 'revise'] as const;
export type ChapterIntent = (typeof CHAPTER_INTENTS)[number];

export interface PlannedChapter {
  chapterId: string;
  /** Optional (owner decision: nullable, 29 Oct 2026). */
  intent: ChapterIntent | null;
}

/**
 * TL-3 (D-E2E-2, D-E2E-3 (b), WF-10): the teacher's planned chapters, as sent by a form: a list of
 * `{ chapterId, intent }`. Unique chapters, at most five, intent one of the three values or empty.
 * Returns null when anything is malformed (never silently dropped); the database checks each
 * chapter again (0034: only books the teacher can already view, never a topic).
 */
export function plannedChoices(raw: unknown): PlannedChapter[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const out: PlannedChapter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { chapterId, intent } = item as { chapterId?: unknown; intent?: unknown };
    if (typeof chapterId !== 'string' || !UUID.test(chapterId.trim())) return null;
    const i = typeof intent === 'string' ? intent.trim() : intent;
    if (!(i === undefined || i === null || i === '' || (CHAPTER_INTENTS as readonly unknown[]).includes(i)))
      return null;
    out.push({ chapterId: chapterId.trim(), intent: i ? (i as ChapterIntent) : null });
  }
  if (out.length > MAX_LESSON_CHAPTERS || new Set(out.map((c) => c.chapterId)).size !== out.length) return null;
  return out;
}

/** Inserts planned chapters after the lesson's existing ones (0034 writes the labels and checks them). */
export async function insertPlanned(tx: Db, lessonId: string, planned: PlannedChapter[], after: number) {
  for (const [i, c] of planned.entries()) {
    await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id, source, label, intent)
             VALUES (${lessonId}, ${after + i + 1}, ${c.chapterId}, 'planned', '-', ${c.intent})`;
  }
}

/** A refusal raised inside a transaction so that the whole change is rolled back. */
export class Refused extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** The parent requests a lesson (§2.2). Refusals never reveal anything about other families. */
export async function requestLesson(
  sql: Sql,
  parentId: string,
  input: RequestInput,
  now: Date = new Date(),
): Promise<RequestResult> {
  if (!UUID.test(parentId)) return { ok: false, reason: 'not_allowed' };
  const childId = line(input.childId);
  const teacherId = line(input.teacherId);
  const subject = line(input.subject);
  const minutes = Number(line(input.minutes));
  const startsAt = new Date(line(input.startsAt));
  const priceMinor = Number(line(input.priceMinor));
  const currency = line(input.currency);
  const basis = line(input.basis);
  if (!validMinutes(minutes) || Number.isNaN(startsAt.getTime())) return { ok: false, reason: 'invalid' };
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || !['INR', 'SGD', 'USD'].includes(currency)) {
    return { ok: false, reason: 'price_changed' };
  }
  if (basis !== 'agreed' && basis !== 'listed') return { ok: false, reason: 'price_changed' };
  const chosen = lessonChoices(input.chapterIds, input.topic);
  if (!chosen) return { ok: false, reason: 'chapters' };
  const b = await bookable(sql, parentId, childId, teacherId, subject);
  if (!b) return { ok: false, reason: 'not_linked' };
  const endsAt = new Date(startsAt.getTime() + minutes * MIN);
  try {
    return await sql.begin(async (tx): Promise<RequestResult> => {
      // Not offered, and refused: a time that overlaps a confirmed lesson of the teacher or child.
      const [clash] = await tx`
        SELECT 1 FROM lessons WHERE status = 'confirmed' AND (teacher_id = ${teacherId} OR student_id = ${childId})
          AND starts_at < ${endsAt} AND ends_at > ${startsAt} LIMIT 1`;
      if (clash) return { ok: false, reason: 'busy' };
      const [row] = await tx<Array<{ id: string }>>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes,
                             currency, price_minor, price_basis)
        VALUES (${teacherId}, ${childId}, ${parentId}, ${subject}, ${startsAt}, ${minutes},
                ${currency}, ${priceMinor}, ${basis})
        RETURNING id`;
      // TL-1: the chosen chapters or topic, in the same database step (0032 refuses them later).
      for (const [i, chapterId] of chosen.chapterIds.entries()) {
        await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id)
                 VALUES (${row!.id}, ${i + 1}, ${chapterId})`;
      }
      if (chosen.topic) {
        await tx`INSERT INTO lesson_chapters (lesson_id, position, topic) VALUES (${row!.id}, 1, ${chosen.topic})`;
      }
      await writeAudit(
        tx,
        {
          type: 'LESSON_REQUESTED',
          outcome: 'success',
          actorId: parentId,
          subjectId: teacherId,
          details: { lesson: row!.id, minutes, basis },
        },
        now,
      );
      await tellAbout(tx, row!.id, 'requested', { actorId: parentId }, now);
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    const reason = reasonFromDb(error);
    if (reason) return { ok: false, reason };
    throw error;
  }
}

// ======================================================================= answering and closing

export type AnswerResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'closed' | 'expired' | 'time_taken' | 'not_linked' | 'invalid' | 'chapters' };

export interface LockedLesson {
  id: string;
  teacher_id: string;
  student_id: string;
  subject: string;
  origin: 'parent_request' | 'teacher_proposal';
  starts_at: Date;
  ends_at: Date;
  status: string;
  close_reason: string | null;
  overdue: boolean;
  cancellable: boolean;
  ended: boolean;
  outcome: string | null;
}

/**
 * Lock order (TL-3 review): every path that ends a teacher-child link (removeTeacher,
 * updateTeacherLinks, the admin and teacher paths) locks the link row FIRST and then the lessons it
 * closes. Accepting a lesson re-checks that link in the database (0029 lessons_teacher_link_ok,
 * FOR SHARE), which used to happen AFTER the lesson row was locked: the opposite order, so an
 * acceptance and a link removal could deadlock. Taking the link row (FOR SHARE) before the lesson
 * row gives both the same order. Called first in every acceptance transaction.
 */
export async function lockLinkFirst(tx: Db, lessonId: string): Promise<void> {
  if (!UUID.test(lessonId)) return;
  await tx`
    SELECT k.id FROM teacher_student_links k
    JOIN lessons l ON l.teacher_id = k.teacher_id AND l.student_id = k.student_id
    WHERE l.id = ${lessonId}
    ORDER BY k.id
    FOR SHARE OF k`;
}

export async function lockLesson(tx: Db, id: string): Promise<LockedLesson | null> {
  if (!UUID.test(id)) return null;
  const [l] = await tx<LockedLesson[]>`
    SELECT id, teacher_id, student_id, subject, origin, starts_at, ends_at, status, close_reason, outcome,
           reply_deadline <= now() AS overdue,
           starts_at - make_interval(mins => ${CANCEL_CUTOFF_MINUTES}) >= now() AS cancellable,
           ends_at <= now() AS ended
    FROM lessons WHERE id = ${id} FOR UPDATE`;
  return l ?? null;
}

/**
 * A teacher may act on a lesson while approved and active, and either linked to the child in its
 * subject or teaching a lesson kept after the parent removed them (OC-53, 0031).
 */
export async function teacherOwns(tx: Db, teacherId: string, l: LockedLesson | null): Promise<boolean> {
  if (!l || l.teacher_id !== teacherId) return false;
  const [ok] = await tx`
    SELECT 1 FROM accounts a
    JOIN teacher_profiles tp ON tp.account_id = a.id AND tp.approval_status = 'approved'
    WHERE a.id = ${teacherId} AND a.status = 'active' AND (
      EXISTS (SELECT 1 FROM teacher_student_links tl
              WHERE tl.teacher_id = ${teacherId} AND tl.student_id = ${l.student_id} AND tl.status = 'active'
                AND ${l.subject} = ANY (tl.subjects))
      OR EXISTS (SELECT 1 FROM lessons_kept kp WHERE kp.lesson_id = ${l.id}))`;
  return !!ok;
}

/** A parent may act on a lesson while an active parent of the child (D3A-25). */
export async function parentOwns(tx: Db, parentId: string, l: LockedLesson | null): Promise<boolean> {
  if (!l || !UUID.test(parentId)) return false;
  const [ok] = await tx`
    SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id AND p.status = 'active'
    WHERE g.parent_id = ${parentId} AND g.student_id = ${l.student_id} AND g.status = 'active'`;
  return !!ok;
}

/**
 * Closes open requests and open teacher proposals that overlap a lesson just confirmed: "time no
 * longer free" (§2.1; TL3-4). Proposals are taken with FOR UPDATE SKIP LOCKED (TL-3 review pack
 * §9f): this transaction already holds the teacher and child time locks (0034, lessons_lock_times),
 * and waiting here for a proposal row that another transaction holds could deadlock with that
 * slot's clean-up. A skipped proposal is being changed by its holder, and can never be accepted
 * over this lesson anyway (0029's no-overlap rules), so nothing is lost by skipping it.
 * TQ-4 (30 Oct 2026): requests are skipped the same way; lessonMaintenance closes any left open.
 */
export async function closeOverlapping(
  tx: Db,
  l: Pick<LockedLesson, 'id' | 'teacher_id' | 'student_id' | 'starts_at' | 'ends_at'>,
  actorId: string,
  now: Date,
): Promise<void> {
  const closed = await tx<Array<{ id: string }>>`
    UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free'
    WHERE id IN (SELECT id FROM lessons
                 WHERE status = 'requested' AND id <> ${l.id}
                   AND (teacher_id = ${l.teacher_id} OR student_id = ${l.student_id})
                   AND starts_at < ${l.ends_at} AND ends_at > ${l.starts_at}
                 ORDER BY id
                 FOR UPDATE SKIP LOCKED)
    RETURNING id`;
  const proposals = await tx<Array<{ id: string }>>`
    UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free'
    WHERE id IN (SELECT id FROM lessons
                 WHERE status = 'proposed' AND id <> ${l.id}
                   AND (teacher_id = ${l.teacher_id} OR student_id = ${l.student_id})
                   AND starts_at < ${l.ends_at} AND ends_at > ${l.starts_at}
                 ORDER BY id
                 FOR UPDATE SKIP LOCKED)
    RETURNING id`;
  for (const c of [...closed, ...proposals]) await tellAbout(tx, c.id, 'time_taken', { actorId }, now);
}

/**
 * TQ-4: the teacher-then-child transaction locks that confirmations share (released at commit or
 * rollback). Identical keys and order to migration 0034's lessons_lock_times.
 */
export async function lockLessonTimes(tx: Db, teacherId: string, studentId: string): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`aa_pro.lesson_times.teacher:${teacherId}`}, 0))`;
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`aa_pro.lesson_times.child:${studentId}`}, 0))`;
}

/**
 * TQ-4 safety net: an open request that overlaps a confirmed lesson of the same teacher or child
 * closes as "time no longer free", as if closed at that confirmation. Normally the confirmation
 * closes it itself; this catches one it skipped because another transaction held it at that moment
 * and then left it open. Rows held right now are skipped again (next run).
 */
export async function closeLeftoverOverlaps(tx: Db, now: Date): Promise<number> {
  const closed = await tx<Array<{ id: string }>>`
    UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free'
    WHERE id IN (SELECT r.id FROM lessons r
                 WHERE r.status = 'requested'
                   AND EXISTS (SELECT 1 FROM lessons c
                               WHERE c.status = 'confirmed' AND c.id <> r.id
                                 AND (c.teacher_id = r.teacher_id OR c.student_id = r.student_id)
                                 AND c.starts_at < r.ends_at AND c.ends_at > r.starts_at)
                 ORDER BY r.id
                 LIMIT 200
                 FOR UPDATE OF r SKIP LOCKED)
    RETURNING id`;
  for (const c of closed) await tellAbout(tx, c.id, 'time_taken', {}, now);
  return closed.length;
}

/**
 * Retries a whole change when two transactions deadlock (40P01; the database aborts one). Used by
 * every action that confirms a lesson or creates a proposal (TL-3 review pack §9f).
 */
export async function retrying<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if ((error as { code?: string }).code !== '40P01' || attempt >= 3) throw error;
    }
  }
}

/**
 * The teacher accepts or declines a request (§2.1). Accepting re-checks, inside the same locked
 * step, the deadline, the link and the usual times (D3A-4); two accepts for overlapping times can
 * never both succeed (0029): the one that loses closes as "time no longer free".
 *
 * TL-3 (D-E2E-3 (b), owner decision 29 Oct 2026): when accepting, the teacher may add planned
 * chapters (with an optional intent), in the same transaction, and the parents are told. Never on
 * a request whose parent gave a free-text topic (D-TLS-6 "chapters or a topic"; W-3): that is
 * refused before anything changes. If the database refuses a chapter, the acceptance is rolled
 * back too, so it is all or nothing.
 */
export async function answerLesson(
  sql: Sql,
  teacherId: string,
  lessonId: string,
  answer: 'accept' | 'decline',
  note: unknown = '',
  now: Date = new Date(),
  opts: { planned?: unknown } = {},
): Promise<AnswerResult> {
  if (!UUID.test(teacherId) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  const text = line(note).slice(0, 200);
  const planned = answer === 'accept' ? plannedChoices(opts.planned) : [];
  if (!planned) return { ok: false, reason: 'chapters' };
  return retrying(() =>
    sql.begin(async (tx): Promise<AnswerResult> => {
      await lockLinkFirst(tx, lessonId);
      const l = await lockLesson(tx, lessonId);
      if (!l || !(await teacherOwns(tx, teacherId, l))) return { ok: false, reason: 'not_found' };
      if (l.status !== 'requested') {
        return { ok: false, reason: l.close_reason === 'time_no_longer_free' ? 'time_taken' : 'closed' };
      }
      if (l.overdue) return { ok: false, reason: 'expired' };
      // W-3 / D-TLS-6: a request with a parent's topic takes no planned chapters; checked first.
      const [had] = await tx<Array<{ n: number; topic: boolean }>>`
        SELECT count(*)::int AS n, bool_or(topic IS NOT NULL) AS topic FROM lesson_chapters WHERE lesson_id = ${l.id}`;
      if (planned.length && (had?.topic || (had?.n ?? 0) + planned.length > MAX_LESSON_CHAPTERS)) {
        return { ok: false, reason: 'chapters' };
      }
      if (answer === 'decline') {
        await tx`UPDATE lessons SET status = 'declined', closed_by = 'teacher', closed_by_account = ${teacherId},
                 close_note = ${text || null} WHERE id = ${l.id}`;
        await writeAudit(
          tx,
          { type: 'LESSON_DECLINED', outcome: 'success', actorId: teacherId, details: { lesson: l.id } },
          now,
        );
        await tellAbout(tx, l.id, 'declined', { actorId: teacherId }, now);
        return { ok: true };
      }
      // TQ-4: confirmations that could overlap (same teacher or same child) take turns. Without
      // this, two of them writing at once can deadlock inside 0029's no-overlap rule instead of
      // one getting "time no longer free". The same keys and order as 0034's lessons_lock_times,
      // which takes them again in its trigger (these locks are re-entrant).
      await lockLessonTimes(tx, l.teacher_id, l.student_id);
      try {
        await tx.savepoint((sp) => sp`UPDATE lessons SET status = 'confirmed' WHERE id = ${l.id}`);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        const taken = e.code === '23P01' || (e.code === '23514' && (e.message ?? '').includes('usual times'));
        if (!taken) {
          if (e.code === '23514' && (e.message ?? '').includes('linked')) return { ok: false, reason: 'not_linked' };
          if (e.code === '23514' && (e.message ?? '').includes('lessons_confirm_in_time')) {
            return { ok: false, reason: 'expired' };
          }
          throw error;
        }
        await tx`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free'
                 WHERE id = ${l.id}`;
        await tellAbout(tx, l.id, 'time_taken', { actorId: teacherId }, now);
        return { ok: false, reason: 'time_taken' };
      }
      await closeOverlapping(tx, l, teacherId, now);
      if (planned.length) {
        // All or nothing: a chapter the database refuses rolls the acceptance back as well.
        try {
          await tx.savepoint((sp) => insertPlanned(sp, l.id, planned, had?.n ?? 0));
        } catch (error) {
          const e = error as { code?: string };
          if (e.code === '23514' || e.code === '42501' || e.code === '23505' || e.code === '23503')
            throw new Refused('chapters');
          throw error;
        }
      }
      await writeAudit(
        tx,
        {
          type: 'LESSON_ACCEPTED',
          outcome: 'success',
          actorId: teacherId,
          details: { lesson: l.id, plannedChapters: planned.length },
        },
        now,
      );
      await tellAbout(tx, l.id, 'accepted', { actorId: teacherId }, now);
      // D-E2E-3 (b): the parents are told the teacher planned chapters (in-app; no free text).
      if (planned.length) await tellAbout(tx, l.id, 'chapters_planned', { actorId: teacherId }, now);
      // CR-17 PR 3 (D3A-1): the parents are asked to allow the teacher's meeting links, if needed.
      await askForMeetingPermission(tx, l.id, now);
      return { ok: true };
    }),
  ).catch((error) => {
    if (error instanceof Refused) return { ok: false, reason: 'chapters' } as const;
    // The deadline is checked by the database clock (lessons_confirm_in_time) at commit time too.
    if ((error as { constraint_name?: string }).constraint_name === 'lessons_confirm_in_time') {
      return { ok: false, reason: 'expired' } as const;
    }
    throw error;
  });
}

export type CloseResult = { ok: true } | { ok: false; reason: 'not_found' | 'closed' | 'too_late' | 'expired' };

/** The parent withdraws an open request (either linked parent, D3A-25). */
export async function withdrawLesson(
  sql: Sql,
  parentId: string,
  lessonId: string,
  now: Date = new Date(),
): Promise<CloseResult> {
  if (!UUID.test(parentId) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<CloseResult> => {
    const l = await lockLesson(tx, lessonId);
    if (!l || !(await parentOwns(tx, parentId, l))) return { ok: false, reason: 'not_found' };
    if (l.status !== 'requested') return { ok: false, reason: 'closed' };
    if (l.overdue) return { ok: false, reason: 'expired' };
    await tx`UPDATE lessons SET status = 'withdrawn', closed_by = 'parent', closed_by_account = ${parentId}
             WHERE id = ${l.id}`;
    await writeAudit(
      tx,
      { type: 'LESSON_WITHDRAWN', outcome: 'success', actorId: parentId, details: { lesson: l.id } },
      now,
    );
    await tellAbout(tx, l.id, 'withdrawn', { actorId: parentId }, now);
    return { ok: true };
  });
}

/**
 * The parent or the teacher cancels a confirmed lesson while at least 30 minutes remain (OC-46:
 * 30:00 allowed, 29:59 refused). The database clock decides; rescheduling is cancel and request
 * again (D3A-6).
 */
export async function cancelLesson(
  sql: Sql,
  actor: { id: string; role: 'parent' | 'teacher' },
  lessonId: string,
  now: Date = new Date(),
): Promise<CloseResult> {
  if (!UUID.test(actor.id) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  try {
    return await sql.begin(async (tx): Promise<CloseResult> => {
      const l = await lockLesson(tx, lessonId);
      const mine = actor.role === 'teacher' ? await teacherOwns(tx, actor.id, l) : await parentOwns(tx, actor.id, l);
      if (!l || !mine) return { ok: false, reason: 'not_found' };
      if (l.status !== 'confirmed') return { ok: false, reason: 'closed' };
      if (!l.cancellable) return { ok: false, reason: 'too_late' };
      await tx`UPDATE lessons SET status = 'cancelled', closed_by = ${actor.role}, closed_by_account = ${actor.id}
               WHERE id = ${l.id}`;
      await dropLessonReminders(tx, l.id);
      await writeAudit(
        tx,
        { type: 'LESSON_CANCELLED', outcome: 'success', actorId: actor.id, details: { lesson: l.id, by: actor.role } },
        now,
      );
      await tellAbout(tx, l.id, 'cancelled', { actorId: actor.id }, now);
      return { ok: true };
    });
  } catch (error) {
    // The cut-off passed between the check and the change: the database refuses (0029).
    if ((error as { constraint_name?: string }).constraint_name === 'lessons_status_fields') {
      return { ok: false, reason: 'too_late' };
    }
    throw error;
  }
}

export type OutcomeResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_yet' | 'done' | 'invalid' };

/** After the lesson, the teacher records Taught or Did not take place (D3A-7), once. */
export async function recordOutcome(
  sql: Sql,
  teacherId: string,
  lessonId: string,
  outcome: unknown,
  now: Date = new Date(),
): Promise<OutcomeResult> {
  const o = line(outcome);
  if (o !== 'taught' && o !== 'not_taken_place') return { ok: false, reason: 'invalid' };
  if (!UUID.test(teacherId) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<OutcomeResult> => {
    const l = await lockLesson(tx, lessonId);
    if (!l || !(await teacherOwns(tx, teacherId, l)) || l.status !== 'confirmed')
      return { ok: false, reason: 'not_found' };
    if (!l.ended) return { ok: false, reason: 'not_yet' };
    if (l.outcome) return { ok: false, reason: 'done' };
    await tx`UPDATE lessons SET outcome = ${o} WHERE id = ${l.id}`;
    await writeAudit(
      tx,
      {
        type: 'LESSON_OUTCOME_RECORDED',
        outcome: 'success',
        actorId: teacherId,
        details: { lesson: l.id, outcome: o },
      },
      now,
    );
    return { ok: true };
  });
}

// ======================================================================= AA Pro closes

/** OC-53 / OD-A: one child affected by a parent's change; `subjects` omitted means every subject. */
export interface KeepScope {
  childId: string;
  subjects?: string[];
}

/**
 * D3A-13, D3A-24: open requests and upcoming lessons whose teacher was deactivated, or whose
 * link or subject ended, are closed by AA Pro, and the parents are told. Called in the same
 * transaction as the change that ended the link (parent, admin or teacher-profile paths), and by
 * the shared sweep as a backstop for any other path. A suspended teacher's lessons are left as
 * they are: they can't accept new ones, and suspension may be lifted.
 *
 * OC-53 Option A (owner, 25 Oct 2026, 00:05 IST; scope OD-A, 13:18 IST): when the change was a
 * PARENT's (`keepSoonFor`), the confirmed lessons IN THE SCOPE OF THAT CHANGE starting within the
 * next 30 minutes (database clock, `lessons_kept_window_ok`: start <= now + 30 min and not yet
 * ended) are KEPT, recorded in `lessons_kept`, and both sides are told; every other upcoming lesson
 * whose link ended is cancelled as before. The scope is one entry per affected child: the teacher
 * removed or the child's link removed (`subjects` omitted: all that child's lessons with the
 * teacher), or some subjects unticked (`subjects`: only lessons in those subjects). Lessons of other
 * children, other subjects and other families are never kept by this change (and, still being
 * linked, are not touched at all). A kept lesson is never cancelled by a later sweep; only its
 * teacher's deactivation cancels it.
 */
export async function closeLessonsWithoutLink(
  tx: Db,
  scope: { teacherId?: string; studentId?: string },
  now: Date = new Date(),
  opts: { keepSoonFor?: { parentId: string; scope: KeepScope[] } } = {},
): Promise<number> {
  const teacherId = scope.teacherId && UUID.test(scope.teacherId) ? scope.teacherId : null;
  const studentId = scope.studentId && UUID.test(scope.studentId) ? scope.studentId : null;
  const keep = opts.keepSoonFor && UUID.test(opts.keepSoonFor.parentId) ? opts.keepSoonFor : null;
  // Child -> the subjects whose link this change ended (null: every subject, the link itself ended).
  const keepFor = new Map<string, Set<string> | null>();
  for (const k of keep?.scope ?? []) {
    if (!UUID.test(k.childId)) continue;
    const had = keepFor.get(k.childId);
    if (had === null || !k.subjects) keepFor.set(k.childId, null);
    else keepFor.set(k.childId, new Set([...(had ?? []), ...k.subjects]));
  }
  const inScope = (childId: string, subject: string) => {
    if (!keepFor.has(childId)) return false;
    const subjects = keepFor.get(childId);
    return subjects === null || subjects!.has(subject);
  };
  const due = await tx<
    Array<{
      id: string;
      student_id: string;
      subject: string;
      status: string;
      reason: 'teacher_deactivated' | 'link_ended';
      soon: boolean;
    }>
  >`
    SELECT l.id, l.student_id, l.subject, l.status,
           CASE WHEN t.status = 'deactivated' THEN 'teacher_deactivated' ELSE 'link_ended' END AS reason,
           lessons_kept_window_ok(l.starts_at, l.ends_at, now()) AS soon
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id
    WHERE (${teacherId}::uuid IS NULL OR l.teacher_id = ${teacherId})
      AND (${studentId}::uuid IS NULL OR l.student_id = ${studentId})
      -- TL-3 (D-TLS-13): open teacher proposals close the same way as open requests.
      AND ((l.status IN ('requested', 'proposed') AND l.reply_deadline > now())
           OR (l.status = 'confirmed' AND l.ends_at > now()))
      AND (t.status = 'deactivated' OR NOT EXISTS (
            SELECT 1 FROM teacher_student_links k
            WHERE k.teacher_id = l.teacher_id AND k.student_id = l.student_id AND k.status = 'active'
              AND l.subject = ANY (k.subjects)))
      -- OC-53: a kept lesson stays, unless its teacher is deactivated (D3A-13).
      AND (t.status = 'deactivated' OR NOT EXISTS (SELECT 1 FROM lessons_kept kp WHERE kp.lesson_id = l.id))
    ORDER BY l.id
    FOR UPDATE OF l`;
  let closed = 0;
  for (const l of due) {
    if (keep && l.status === 'confirmed' && l.reason === 'link_ended' && l.soon && inScope(l.student_id, l.subject)) {
      await tx`INSERT INTO lessons_kept (lesson_id, kept_by) VALUES (${l.id}, ${keep.parentId})`;
      await writeAudit(
        tx,
        {
          type: 'LESSON_KEPT_AFTER_LINK_END',
          outcome: 'success',
          actorId: keep.parentId,
          details: { lesson: l.id, rule: 'OC-53' },
        },
        now,
      );
      await tellAbout(tx, l.id, 'kept', {}, now);
      continue;
    }
    if (l.status === 'requested' || l.status === 'proposed') {
      await tx`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = ${l.reason} WHERE id = ${l.id}`;
    } else {
      await tx`UPDATE lessons SET status = 'cancelled', closed_by = 'aa_pro', close_reason = ${l.reason} WHERE id = ${l.id}`;
      // CR-17 PR 7: a reminder for a lesson that won't happen is no longer true.
      await dropLessonReminders(tx, l.id);
    }
    await writeAudit(
      tx,
      { type: 'LESSON_CLOSED_BY_AA_PRO', outcome: 'success', details: { lesson: l.id, reason: l.reason } },
      now,
    );
    await tellAbout(tx, l.id, l.status === 'confirmed' ? 'cancelled' : 'closed_by_aa_pro', {}, now);
    closed += 1;
  }
  return closed;
}

/**
 * The lesson part of the CR-16 shared sweep (no scheduler): records overdue requests as expired
 * and tells both sides once (also those expired when someone re-requested the slot), closes
 * lessons whose link ended, and asks the teacher for the outcome of lessons that have ended.
 * Idempotent; every run re-selects what is due.
 */
export async function lessonMaintenance(sql: Sql, now: Date = new Date()): Promise<number> {
  let done = 0;
  done += await sql.begin(async (tx) => {
    const expired = await tx<Array<{ id: string }>>`SELECT lessons_expire_overdue(200) AS id`;
    const missed = await tx<Array<{ id: string }>>`
      SELECT l.id FROM lessons l
      WHERE l.status = 'expired' AND l.closed_at > now() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.entity_type = 'lesson' AND n.entity_id = l.id
                        AND n.type IN ('lesson_expired', 'lesson_proposal_expired'))
      LIMIT 200`;
    const ids = new Set([...expired.map((r) => r.id), ...missed.map((r) => r.id)]);
    for (const id of ids) await tellAbout(tx, id, 'expired', {}, now);
    return ids.size;
  });
  done += await sql.begin((tx) => closeLessonsWithoutLink(tx, {}, now));
  done += await sql.begin((tx) => closeLeftoverOverlaps(tx, now));
  done += await sql.begin(async (tx) => {
    const ended = await tx<Array<{ id: string }>>`
      SELECT l.id FROM lessons l
      WHERE l.status = 'confirmed' AND l.outcome IS NULL AND l.ends_at <= now() AND l.ends_at > now() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.entity_type = 'lesson' AND n.entity_id = l.id
                        AND n.type = 'lesson_outcome_needed')
      LIMIT 200`;
    for (const l of ended) await tellAbout(tx, l.id, 'outcome_needed', {}, now);
    return ended.length;
  });
  // CR-17 PR 3 (D3A-8): meeting links 7 days after the lesson's end, at the next site activity.
  done += await purgeMeetingLinks(sql);
  return done;
}

// ======================================================================= notifications (in-app)

export type LessonEvent =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'time_taken'
  | 'withdrawn'
  | 'expired'
  | 'cancelled'
  | 'closed_by_aa_pro'
  | 'outcome_needed'
  | 'kept'
  // TL-3: teacher proposals and planned chapters.
  | 'proposed'
  | 'proposal_accepted'
  | 'proposal_declined'
  | 'proposal_withdrawn'
  | 'chapters_planned';

interface LessonFacts {
  id: string;
  teacher_id: string;
  student_id: string;
  subject: string;
  starts_at: Date;
  minutes: number;
  status: string;
  origin: 'parent_request' | 'teacher_proposal';
  closed_by: string | null;
  closed_by_account: string | null;
  close_reason: string | null;
  requested_by: string | null;
  teacher_name: string;
  teacher_zone: string;
  teacher_active: boolean;
  child_name: string;
  grade: number | null;
  curriculum: string | null;
}

/** D3A-10 notification types for lessons (in-app only, OC-123 (4)). */
export const LESSON_NOTIFICATION_TYPES = [
  'lesson_requested',
  'lesson_accepted',
  'lesson_declined',
  'lesson_time_no_longer_free',
  'lesson_withdrawn',
  'lesson_expired',
  'lesson_cancelled',
  'lesson_outcome_needed',
  // CR-17 PR 3 (D3A-1): to parents only; never the link itself.
  'lesson_link_added',
  'lesson_link_changed',
  'lesson_link_permission_needed',
  // CR-17 PR 7 (D3A-10 Option A): the best-effort, in-app 15-minute reminder.
  'lesson_reminder',
  // OC-53 Option A (0031): a lesson kept when a parent removed the teacher.
  'lesson_kept',
  // TL-3 (0034): teacher proposals (in-app only; never a free-text note) and planned chapters.
  'lesson_proposed',
  'lesson_proposal_accepted',
  'lesson_proposal_declined',
  'lesson_proposal_withdrawn',
  'lesson_proposal_expired',
  'lesson_proposal_closed',
  'lesson_chapters_planned',
] as const;

const TEACHER_HREF = '/teacher/schedule';
const PARENT_HREF = '/parent/calendar';
/** TL3-5: a parent's notices about a teacher's proposal open its booking-details page. */
const bookingHref = (id: string) => `/parent/bookings/${id.toLowerCase()}`;

/**
 * Who is told what (CR-16 rules): never the person who acted; parents only while active parents
 * of the child; the teacher only while approved and active. A teacher's text names the subject,
 * grade and time, never the child (CR-16 §3). No free-text notes are copied into notifications.
 */
export async function tellAbout(
  tx: Db,
  lessonId: string,
  event: LessonEvent,
  opts: { actorId?: string },
  now: Date,
): Promise<void> {
  const [f] = await tx<LessonFacts[]>`
    SELECT l.id, l.teacher_id, l.student_id, l.subject, l.starts_at, l.minutes, l.status, l.origin, l.closed_by,
           l.closed_by_account, l.close_reason, l.requested_by,
           t.display_name AS teacher_name, t.time_zone AS teacher_zone,
           (t.status = 'active' AND tp.approval_status = 'approved') AS teacher_active,
           c.display_name AS child_name, sp.grade, sp.curriculum
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id
    LEFT JOIN teacher_profiles tp ON tp.account_id = t.id
    JOIN accounts c ON c.id = l.student_id LEFT JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.id = ${lessonId}`;
  if (!f) return;
  const parents = await tx<Array<{ id: string; name: string; zone: string }>>`
    SELECT p.id, p.display_name AS name, p.time_zone AS zone FROM guardian_links g
    JOIN accounts p ON p.id = g.parent_id AND p.role = 'parent' AND p.status = 'active'
    WHERE g.student_id = ${f.student_id} AND g.status = 'active' ORDER BY p.id`;
  const subject = subjectName(f.subject);
  const forTeacher = `${subject}, ${f.grade ? `Grade ${Number(f.grade)}` : 'grade not set'}, ${formatLessonTime(f.starts_at, f.teacher_zone)}`;
  const actorFirst = async () => {
    if (!opts.actorId) return '';
    const [a] = await tx<Array<{ name: string }>>`SELECT display_name AS name FROM accounts WHERE id = ${opts.actorId}`;
    return firstName(a?.name);
  };
  const teacherNote = async (type: string, kind: 'action' | 'update', title: string, body = '') => {
    if (!f.teacher_active || opts.actorId === f.teacher_id) return;
    await notify(tx, {
      recipientId: f.teacher_id,
      kind,
      type,
      title,
      body,
      href: TEACHER_HREF,
      entityType: 'lesson',
      entityId: f.id,
      dedupeKey: `${type}:${f.id}:${f.teacher_id}`,
      now,
    });
  };
  const proposal = f.origin === 'teacher_proposal';
  const parentNotes = async (
    type: string,
    title: (zone: string) => string,
    body = '',
    kind: 'action' | 'update' = 'update',
  ) => {
    for (const p of parents) {
      if (p.id === opts.actorId) continue;
      await notify(tx, {
        recipientId: p.id,
        kind,
        type,
        title: title(p.zone),
        body,
        href: proposal ? bookingHref(f.id) : PARENT_HREF,
        entityType: 'lesson',
        entityId: f.id,
        dedupeKey: `${type}:${f.id}:${p.id}`,
        now,
      });
    }
  };
  const when = (zone: string) => formatLessonTime(f.starts_at, zone);
  switch (event) {
    case 'requested': {
      const who = await actorFirst();
      await teacherNote(
        'lesson_requested',
        'action',
        `New lesson request: ${forTeacher} (${Number(f.minutes)} min)`,
        `From ${who || 'a parent'}. Accept or decline it in My schedule before it expires.`,
      );
      await parentNotes(
        'lesson_requested',
        (z) => `${who || 'A parent'} requested ${f.child_name}'s ${subject} lesson with ${f.teacher_name}, ${when(z)}`,
        'Waiting for the teacher to answer.',
      );
      return;
    }
    case 'accepted':
      await parentNotes(
        'lesson_accepted',
        (z) => `${f.teacher_name} accepted ${f.child_name}'s ${subject} lesson, ${when(z)}`,
      );
      return;
    case 'declined':
      await parentNotes(
        'lesson_declined',
        (z) => `${f.teacher_name} declined ${f.child_name}'s ${subject} lesson request for ${when(z)}`,
      );
      return;
    case 'time_taken':
      if (proposal) {
        await parentNotes(
          'lesson_time_no_longer_free',
          (z) =>
            `The ${subject} lesson ${f.teacher_name} proposed for ${f.child_name}, ${when(z)}, is closed: the time is no longer free`,
        );
        await teacherNote(
          'lesson_time_no_longer_free',
          'update',
          `Lesson proposal closed, the time is no longer free: ${forTeacher}`,
        );
        return;
      }
      await parentNotes(
        'lesson_time_no_longer_free',
        (z) => `${f.child_name}'s ${subject} lesson request for ${when(z)} is closed: the time is no longer free`,
        'Choose another time if you would like a lesson.',
      );
      // The teacher of a request closed because of another teacher's lesson for the same child.
      await teacherNote(
        'lesson_time_no_longer_free',
        'update',
        `Lesson request closed, the time is no longer free: ${forTeacher}`,
      );
      return;
    case 'withdrawn': {
      const who = await actorFirst();
      await teacherNote('lesson_withdrawn', 'update', `Lesson request withdrawn: ${forTeacher}`);
      await parentNotes(
        'lesson_withdrawn',
        (z) => `${who || 'A parent'} withdrew ${f.child_name}'s ${subject} lesson request for ${when(z)}`,
      );
      return;
    }
    case 'expired':
      if (proposal) {
        await teacherNote(
          'lesson_proposal_expired',
          'update',
          `Your lesson proposal expired without an answer: ${forTeacher}`,
        );
        await parentNotes(
          'lesson_proposal_expired',
          (z) =>
            `No answer in time: the ${subject} lesson ${f.teacher_name} proposed for ${f.child_name}, ${when(z)}, has expired`,
        );
        return;
      }
      await teacherNote('lesson_expired', 'update', `A lesson request expired without an answer: ${forTeacher}`);
      await parentNotes(
        'lesson_expired',
        (z) => `No answer in time: ${f.child_name}'s ${subject} lesson request for ${when(z)} has expired`,
      );
      return;
    case 'cancelled': {
      if (f.closed_by === 'aa_pro') {
        const why =
          f.close_reason === 'teacher_deactivated' ? 'the teacher is no longer available' : 'the teacher link ended';
        await parentNotes(
          'lesson_cancelled',
          (z) => `${f.child_name}'s ${subject} lesson on ${when(z)} is cancelled: ${why}`,
        );
        await teacherNote('lesson_cancelled', 'update', `Lesson cancelled by AA Pro: ${forTeacher}`);
        return;
      }
      const who = await actorFirst();
      if (f.closed_by === 'parent') {
        await teacherNote('lesson_cancelled', 'update', `Lesson cancelled by the parent: ${forTeacher}`);
        await parentNotes(
          'lesson_cancelled',
          (z) => `${who || 'A parent'} cancelled ${f.child_name}'s ${subject} lesson on ${when(z)}`,
        );
      } else {
        await parentNotes(
          'lesson_cancelled',
          (z) => `${f.teacher_name} cancelled ${f.child_name}'s ${subject} lesson on ${when(z)}`,
        );
      }
      return;
    }
    case 'closed_by_aa_pro': {
      const why =
        f.close_reason === 'teacher_deactivated' ? 'the teacher is no longer available' : 'the teacher link ended';
      if (proposal) {
        await parentNotes(
          'lesson_proposal_closed',
          (z) => `The ${subject} lesson ${f.teacher_name} proposed for ${f.child_name}, ${when(z)}, is closed: ${why}`,
        );
        await teacherNote('lesson_proposal_closed', 'update', `Lesson proposal closed by AA Pro: ${forTeacher}`);
        return;
      }
      await parentNotes(
        'lesson_declined',
        (z) => `${f.child_name}'s ${subject} lesson request for ${when(z)} is closed: ${why}`,
      );
      await teacherNote('lesson_declined', 'update', `Lesson request closed by AA Pro: ${forTeacher}`);
      return;
    }
    case 'kept':
      // OC-53 Option A: the parent removed the teacher, but this lesson starts within 30 minutes.
      await parentNotes(
        'lesson_kept',
        (z) => `${f.child_name}'s ${subject} lesson with ${f.teacher_name} on ${when(z)} stays booked`,
        'It starts within 30 minutes of the change, so it was kept. Other upcoming lessons with this teacher were cancelled.',
      );
      await teacherNote(
        'lesson_kept',
        'update',
        `Lesson stays booked: ${forTeacher}`,
        'The parent ended the link, but this lesson starts within 30 minutes, so it stays booked for you to teach.',
      );
      return;
    case 'outcome_needed':
      await teacherNote(
        'lesson_outcome_needed',
        'action',
        `Record how the lesson went: ${forTeacher}`,
        'Taught, or did not take place.',
      );
      return;
    // ------------------------------------------------------------------ TL-3
    case 'proposed':
      // OC-45: every active parent of the child may accept or decline (D-TLS-2).
      await parentNotes(
        'lesson_proposed',
        (z) =>
          `${f.teacher_name} proposed a ${subject} lesson for ${f.child_name}, ${when(z)} (${Number(f.minutes)} min)`,
        'Accept or decline it before it expires. Nothing is booked until you accept.',
        'action',
      );
      return;
    case 'proposal_accepted': {
      const who = await actorFirst();
      await teacherNote('lesson_proposal_accepted', 'update', `Lesson proposal accepted: ${forTeacher}`);
      await parentNotes(
        'lesson_proposal_accepted',
        (z) =>
          `${who || 'A parent'} accepted the ${subject} lesson ${f.teacher_name} proposed for ${f.child_name}, ${when(z)}`,
      );
      return;
    }
    case 'proposal_declined': {
      // TL3-5: the parent's optional reason is never copied into a notice.
      const who = await actorFirst();
      await teacherNote('lesson_proposal_declined', 'update', `Lesson proposal declined: ${forTeacher}`);
      await parentNotes(
        'lesson_proposal_declined',
        (z) =>
          `${who || 'A parent'} declined the ${subject} lesson ${f.teacher_name} proposed for ${f.child_name}, ${when(z)}`,
      );
      return;
    }
    case 'proposal_withdrawn':
      await parentNotes(
        'lesson_proposal_withdrawn',
        (z) => `${f.teacher_name} withdrew the ${subject} lesson proposed for ${f.child_name}, ${when(z)}`,
      );
      return;
    case 'chapters_planned':
      // D-E2E-3 (b): the teacher planned chapters when accepting a parent's request.
      await parentNotes(
        'lesson_chapters_planned',
        (z) => `${f.teacher_name} planned chapters for ${f.child_name}'s ${subject} lesson, ${when(z)}`,
        'See them on the lesson in Family calendar.',
      );
      return;
  }
}

// ======================================================================= lists

export type LessonStatus = 'requested' | 'proposed' | 'confirmed' | 'declined' | 'withdrawn' | 'expired' | 'cancelled';

export interface LessonItem {
  id: string;
  teacherId: string;
  teacherName: string;
  childId: string;
  childName: string;
  grade: number | null;
  subject: SubjectId;
  startsAt: Date;
  endsAt: Date;
  minutes: number;
  /** TL-3: who started it, a parent's request or a teacher's proposal (0034, immutable). */
  origin: 'parent_request' | 'teacher_proposal';
  /** An open request or proposal past its deadline shows as expired at once, before the sweep records it. */
  status: LessonStatus;
  replyDeadline: Date;
  closedBy: 'parent' | 'teacher' | 'aa_pro' | null;
  closeReason: 'time_no_longer_free' | 'teacher_deactivated' | 'link_ended' | null;
  closeNote: string | null;
  /** The viewer is the person who closed it (cancelled, withdrew or declined). */
  closedByYou: boolean;
  /** For a parent: the first name of the parent who closed it (B3), or null. */
  closedByName: string | null;
  outcome: 'taught' | 'not_taken_place' | null;
  /** Shown to parents and teachers only, never to children (D3A-23). */
  price: { currency: string; priceMinor: number; rateMinor: number; basis: 'agreed' | 'listed' } | null;
  /**
   * Actions the viewer may take now (the server checks again). canAnswer: the teacher on a parent's
   * open request, or a parent on a teacher's open proposal (OC-45). canWithdraw: the parent on their
   * open request, or the teacher on their open proposal.
   */
  canWithdraw: boolean;
  canCancel: boolean;
  canAnswer: boolean;
  needsOutcome: boolean;
  /** The lesson's end has passed (database clock). */
  ended: boolean;
  /**
   * CR-17 PR 3: the teacher's own meeting link, as state only. The link itself is never in a
   * lesson item; Join Class reads it on the server at click time.
   */
  /** OC-53: kept when a parent ended the teacher's link, because it started within 30 minutes. */
  kept: boolean;
  /**
   * TL-1: the chapters or topic the parent asked for, in their order. A child gets them only on
   * confirmed lessons (D-TLS-10; lessonsForStudent lists nothing else).
   */
  chapters: LessonChapter[];
  meeting: {
    /**
     * A parent allows this teacher's meeting links for this child now (D3A-1), or allowed them at
     * the moment a kept lesson's teacher was removed (OC-53; that lesson only).
     */
    allowed: boolean;
    /** The teacher has added a link for this lesson. */
    added: boolean;
    /** When the link was last added or changed (database clock). */
    setAt: Date | null;
    /** Join Class is open now: from 10 minutes before the start to the end (OC-44). */
    joinOpen: boolean;
  };
}

/** One chapter or topic on a lesson (TL-1). */
export interface LessonChapter {
  /** Set by the database from the parent's own titles, or the topic; kept as history (D-TLS-15). */
  label: string;
  topic: boolean;
  /** TL-3: asked for by the parent, or planned by the teacher (shown apart, TL3-AC-10). */
  source: 'requested' | 'planned';
  /** TL-3 (WF-10): the teacher's intent for a planned chapter, if stated. */
  intent: ChapterIntent | null;
  /**
   * D-TLS-19: the lesson's teacher can view this chapter now under the existing book sharing
   * (OC-41). False for a topic, or when the book or chapter is no longer shared ("No longer shared").
   */
  shared: boolean;
  /** Teacher only, and only while shared: the view-only reader at that chapter. */
  href: string | null;
}

interface ListRow {
  id: string;
  teacher_id: string;
  teacher_name: string;
  student_id: string;
  child_name: string;
  grade: number | null;
  subject: string;
  starts_at: Date;
  ends_at: Date;
  minutes: number;
  status: string;
  origin: 'parent_request' | 'teacher_proposal';
  reply_deadline: Date;
  closed_by: string | null;
  close_reason: string | null;
  close_note: string | null;
  outcome: string | null;
  currency: string;
  price_minor: string;
  rate_minor: string;
  price_basis: string;
  closed_by_account: string | null;
  closer_name: string | null;
  overdue: boolean;
  cancellable: boolean;
  ended: boolean;
  link_allowed: boolean;
  kept: boolean;
  link_set_at: Date | null;
  join_open: boolean;
  chapters: Array<{
    label: string;
    topic: boolean;
    source: 'requested' | 'planned';
    intent: ChapterIntent | null;
    shared: boolean;
    book_id: string | null;
    chapter_id: string | null;
  }>;
}

const LIST_COLUMNS = (sql: Db) => sql`
  l.id, l.teacher_id, t.display_name AS teacher_name, l.student_id, c.display_name AS child_name, sp.grade,
  l.subject, l.starts_at, l.ends_at, l.minutes, l.status, l.origin, l.reply_deadline, l.closed_by, l.close_reason,
  l.close_note,
  l.outcome, l.currency, l.price_minor, l.rate_minor, l.price_basis, l.closed_by_account, cb.display_name AS closer_name,
  l.reply_deadline <= now() AS overdue,
  l.starts_at - make_interval(mins => ${CANCEL_CUTOFF_MINUTES}) >= now() AS cancellable,
  l.ends_at <= now() AS ended,
  (EXISTS (SELECT 1 FROM meeting_link_permissions mp WHERE mp.teacher_id = l.teacher_id
           AND mp.student_id = l.student_id AND mp.withdrawn_at IS NULL)
   OR EXISTS (SELECT 1 FROM lessons_kept kp WHERE kp.lesson_id = l.id AND kp.links_carried)) AS link_allowed,
  EXISTS (SELECT 1 FROM lessons_kept kp WHERE kp.lesson_id = l.id) AS kept,
  ml.set_at AS link_set_at,
  (now() >= l.starts_at - interval '10 minutes' AND now() < l.ends_at) AS join_open,
  -- TL-1: the chapters or topic, with "shared" = the lesson's teacher can view the chapter now,
  -- under exactly the rule of listBooksForTeacher (OC-41): published live book assigned to the
  -- child, live complete chapter, active link in the book's subject, approved teacher.
  (SELECT coalesce(json_agg(json_build_object(
            'label', lc.label, 'topic', lc.topic IS NOT NULL, 'source', lc.source, 'intent', lc.intent,
            'book_id', ch.book_id, 'chapter_id', ch.id,
            'shared', ch.id IS NOT NULL AND ch.archived_at IS NULL AND ch.complete
                      AND bk.status = 'published' AND bk.archived_at IS NULL
                      AND EXISTS (SELECT 1 FROM book_children bc WHERE bc.book_id = bk.id AND bc.student_id = l.student_id)
                      AND EXISTS (SELECT 1 FROM teacher_student_links tl
                                  JOIN teacher_profiles tlp ON tlp.account_id = tl.teacher_id AND tlp.approval_status = 'approved'
                                  WHERE tl.teacher_id = l.teacher_id AND tl.student_id = l.student_id
                                    AND tl.status = 'active' AND bk.subject = ANY (tl.subjects)))
          ORDER BY lc.position), '[]'::json)
   FROM lesson_chapters lc
   LEFT JOIN book_chapters ch ON ch.id = lc.book_chapter_id
   LEFT JOIN books bk ON bk.id = ch.book_id
   WHERE lc.lesson_id = l.id) AS chapters`;

function toItem(r: ListRow, viewer: 'parent' | 'teacher' | 'student', viewerId: string): LessonItem {
  const open = r.status === 'requested' || r.status === 'proposed';
  const status: LessonStatus = open && r.overdue ? 'expired' : (r.status as LessonStatus);
  return {
    id: r.id,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name,
    childId: r.student_id,
    childName: r.child_name,
    grade: r.grade === null ? null : Number(r.grade),
    subject: r.subject as SubjectId,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    minutes: Number(r.minutes),
    origin: r.origin,
    status,
    replyDeadline: r.reply_deadline,
    closedBy: r.closed_by as LessonItem['closedBy'],
    closeReason: r.close_reason as LessonItem['closeReason'],
    closeNote: viewer === 'student' ? null : r.close_note,
    closedByYou: r.closed_by_account === viewerId,
    // B3: a parent sees which parent cancelled (first name only); nobody else gets it.
    closedByName: viewer === 'parent' && r.closed_by === 'parent' ? firstName(r.closer_name) || null : null,
    outcome: r.outcome as LessonItem['outcome'],
    price:
      viewer === 'student'
        ? null
        : {
            currency: r.currency,
            priceMinor: Number(r.price_minor),
            rateMinor: Number(r.rate_minor),
            basis: r.price_basis as 'agreed' | 'listed',
          },
    canWithdraw: (viewer === 'parent' && status === 'requested') || (viewer === 'teacher' && status === 'proposed'),
    canCancel: viewer !== 'student' && status === 'confirmed' && r.cancellable,
    canAnswer: (viewer === 'teacher' && status === 'requested') || (viewer === 'parent' && status === 'proposed'),
    needsOutcome: viewer === 'teacher' && status === 'confirmed' && r.ended && !r.outcome,
    ended: r.ended,
    kept: r.kept,
    chapters: r.chapters.map((c) => ({
      label: c.label,
      topic: c.topic,
      source: c.source,
      intent: c.intent,
      shared: c.shared,
      href:
        viewer === 'teacher' && c.shared && c.book_id && c.chapter_id
          ? `/books/${c.book_id}?chapter=${c.chapter_id}`
          : null,
    })),
    meeting: {
      allowed: r.link_allowed,
      added: r.link_set_at !== null,
      setAt: r.link_set_at,
      joinOpen: status === 'confirmed' && r.join_open,
    },
  };
}

/** Lessons of the parent's children (active parent only), from 30 days ago on, soonest first. */
export async function lessonsForParent(sql: Db, parentId: string, now: Date = new Date()): Promise<LessonItem[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await sql<ListRow[]>`
    SELECT ${LIST_COLUMNS(sql)}
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
    LEFT JOIN accounts cb ON cb.id = l.closed_by_account
    LEFT JOIN lesson_meeting_links ml ON ml.lesson_id = l.id
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.student_id IN (SELECT g.student_id FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
                           WHERE g.parent_id = ${parentId} AND g.status = 'active' AND p.status = 'active')
      AND l.ends_at > ${new Date(now.getTime() - 30 * DAY)}
    ORDER BY l.starts_at, l.id`;
  return rows.map((r) => toItem(r, 'parent', parentId));
}

/**
 * TL3-5: one lesson for its booking-details page, for an active parent of the child (D3A-25), or
 * null ("not found") for anyone else, whatever id is sent. No time limit, so an old link still opens.
 */
export async function lessonForParent(sql: Db, parentId: string, lessonId: string): Promise<LessonItem | null> {
  if (!UUID.test(parentId) || !UUID.test(lessonId)) return null;
  const [r] = await sql<ListRow[]>`
    SELECT ${LIST_COLUMNS(sql)}
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
    LEFT JOIN accounts cb ON cb.id = l.closed_by_account
    LEFT JOIN lesson_meeting_links ml ON ml.lesson_id = l.id
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.id = ${lessonId}
      AND l.student_id IN (SELECT g.student_id FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
                           WHERE g.parent_id = ${parentId} AND g.status = 'active' AND p.status = 'active')`;
  return r ? toItem(r, 'parent', parentId) : null;
}

/**
 * The teacher's own lessons with students linked to them now in that subject (as homework, W-11),
 * and lessons kept after a parent removed them (OC-53).
 */
export async function lessonsForTeacher(sql: Db, teacherId: string, now: Date = new Date()): Promise<LessonItem[]> {
  if (!UUID.test(teacherId)) return [];
  const rows = await sql<ListRow[]>`
    SELECT ${LIST_COLUMNS(sql)}
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
    LEFT JOIN accounts cb ON cb.id = l.closed_by_account
    LEFT JOIN lesson_meeting_links ml ON ml.lesson_id = l.id
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    JOIN teacher_profiles tp ON tp.account_id = t.id AND tp.approval_status = 'approved'
    WHERE l.teacher_id = ${teacherId} AND t.status = 'active'
      AND (EXISTS (SELECT 1 FROM teacher_student_links k WHERE k.teacher_id = l.teacher_id
                   AND k.student_id = l.student_id AND k.status = 'active' AND l.subject = ANY (k.subjects))
           -- OC-53: a lesson kept after the parent removed this teacher stays on their schedule.
           OR EXISTS (SELECT 1 FROM lessons_kept kp WHERE kp.lesson_id = l.id))
      AND l.ends_at > ${new Date(now.getTime() - 30 * DAY)}
    ORDER BY l.starts_at, l.id`;
  return rows.map((r) => toItem(r, 'teacher', teacherId));
}

/** The child's own confirmed lessons that haven't ended, without prices or requests (D3A-23). */
export async function lessonsForStudent(sql: Db, studentId: string, now: Date = new Date()): Promise<LessonItem[]> {
  if (!UUID.test(studentId)) return [];
  const rows = await sql<ListRow[]>`
    SELECT ${LIST_COLUMNS(sql)}
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
    LEFT JOIN accounts cb ON cb.id = l.closed_by_account
    LEFT JOIN lesson_meeting_links ml ON ml.lesson_id = l.id
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.student_id = ${studentId} AND c.status = 'active' AND l.status = 'confirmed'
      AND l.ends_at > ${now}
    ORDER BY l.starts_at, l.id`;
  return rows.map((r) => toItem(r, 'student', studentId));
}

/** For tests and pages that need one lesson's current row (no access check: callers check). */
export async function lessonStatus(sql: Db, lessonId: string): Promise<string | null> {
  if (!UUID.test(lessonId)) return null;
  const [r] = await sql<Array<{ status: string }>>`SELECT status FROM lessons WHERE id = ${lessonId}`;
  return r?.status ?? null;
}
