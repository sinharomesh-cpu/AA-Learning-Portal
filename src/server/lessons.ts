import 'server-only';
import { SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { zoneOffsetMinutes } from '@/lib/localTime';
import { wallTimeToUtc } from './assignments';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';
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
 *   cancels upcoming lessons, telling the parents (D3A-13, D3A-24).
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const line = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const isSubject = (s: string): s is SubjectId => (SUBJECT_IDS as readonly string[]).includes(s);
const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;
const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';

export function validMinutes(m: number): boolean {
  return Number.isInteger(m) && m >= LESSON_MINUTES_MIN && m <= LESSON_MINUTES_MAX && m % LESSON_MINUTES_STEP === 0;
}

/** Lesson price: rate x minutes / 60, rounded once, half up (CR-15; same formula as 0029). */
export function lessonPrice(rateMinor: number, minutes: number): number {
  return Math.floor((rateMinor * minutes * 2 + 60) / 120);
}

/** "Tue 4 Nov, 4:00 pm" in a time zone. */
export function formatLessonTime(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

/** The local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

/** Minutes after local midnight and the ISO weekday (1 = Monday) of an instant in a zone. */
function localClock(at: Date, timeZone: string): { minute: number; weekday: number } {
  const local = new Date(at.getTime() + zoneOffsetMinutes(at, timeZone) * MIN);
  return { minute: local.getUTCHours() * 60 + local.getUTCMinutes(), weekday: ((local.getUTCDay() + 6) % 7) + 1 };
}

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
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
}

export type FreeTimesResult =
  | { ok: true; days: FreeDay[]; teacherZone: string }
  | { ok: false; reason: 'not_linked' | 'invalid' | 'no_rate' };

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
  const free = starts.filter((s) => {
    const e = s.getTime() + q.minutes * MIN;
    if (busy.some((x) => x.s.getTime() < e && s.getTime() < x.e.getTime())) return false;
    return !requested.some((r) => r.s.getTime() === s.getTime());
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
      day = { date, times: [] };
      days.push(day);
    }
    const rate = Number(p.rate);
    day.times.push({ startsAt: p.s, currency: p.cur, rateMinor: rate, priceMinor: lessonPrice(rate, q.minutes), basis: p.basis });
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
}

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
  | 'no_rate';

export type RequestResult = { ok: true; id: string } | { ok: false; reason: RequestReason };

/** Maps a database refusal from 0029 to a plain reason (the database checks every rule again). */
function reasonFromDb(error: unknown): RequestReason | null {
  const e = error as { code?: string; message?: string };
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
  | { ok: false; reason: 'not_found' | 'closed' | 'expired' | 'time_taken' | 'not_linked' | 'invalid' };

interface LockedLesson {
  id: string;
  teacher_id: string;
  student_id: string;
  subject: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  close_reason: string | null;
  overdue: boolean;
  cancellable: boolean;
  ended: boolean;
  outcome: string | null;
}

async function lockLesson(tx: Db, id: string): Promise<LockedLesson | null> {
  if (!UUID.test(id)) return null;
  const [l] = await tx<LockedLesson[]>`
    SELECT id, teacher_id, student_id, subject, starts_at, ends_at, status, close_reason, outcome,
           reply_deadline <= now() AS overdue,
           starts_at - make_interval(mins => ${CANCEL_CUTOFF_MINUTES}) >= now() AS cancellable,
           ends_at <= now() AS ended
    FROM lessons WHERE id = ${id} FOR UPDATE`;
  return l ?? null;
}

/** A teacher may act on a lesson while approved, active and linked to the child in its subject. */
async function teacherOwns(tx: Db, teacherId: string, l: LockedLesson | null): Promise<boolean> {
  if (!l || l.teacher_id !== teacherId) return false;
  const [ok] = await tx`
    SELECT 1 FROM teacher_student_links tl
    JOIN accounts a ON a.id = tl.teacher_id AND a.status = 'active'
    JOIN teacher_profiles tp ON tp.account_id = a.id AND tp.approval_status = 'approved'
    WHERE tl.teacher_id = ${teacherId} AND tl.student_id = ${l.student_id} AND tl.status = 'active'
      AND ${l.subject} = ANY (tl.subjects)`;
  return !!ok;
}

/** A parent may act on a lesson while an active parent of the child (D3A-25). */
async function parentOwns(tx: Db, parentId: string, l: LockedLesson | null): Promise<boolean> {
  if (!l || !UUID.test(parentId)) return false;
  const [ok] = await tx`
    SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id AND p.status = 'active'
    WHERE g.parent_id = ${parentId} AND g.student_id = ${l.student_id} AND g.status = 'active'`;
  return !!ok;
}

/** Closes open requests that overlap a lesson just confirmed: "time no longer free" (§2.1). */
async function closeOverlappingRequests(tx: Db, l: LockedLesson, now: Date): Promise<void> {
  const closed = await tx<Array<{ id: string }>>`
    UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free'
    WHERE status = 'requested' AND id <> ${l.id} AND (teacher_id = ${l.teacher_id} OR student_id = ${l.student_id})
      AND starts_at < ${l.ends_at} AND ends_at > ${l.starts_at}
    RETURNING id`;
  for (const c of closed) await tellAbout(tx, c.id, 'time_taken', { actorId: l.teacher_id }, now);
}

/** Retries a whole change when two accepts deadlock on each other's rows (the database picks one). */
async function retrying<T>(fn: () => Promise<T>): Promise<T> {
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
 */
export async function answerLesson(
  sql: Sql,
  teacherId: string,
  lessonId: string,
  answer: 'accept' | 'decline',
  note: unknown = '',
  now: Date = new Date(),
): Promise<AnswerResult> {
  if (!UUID.test(teacherId) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  const text = line(note).slice(0, 200);
  return retrying(() =>
    sql.begin(async (tx): Promise<AnswerResult> => {
      const l = await lockLesson(tx, lessonId);
      if (!l || !(await teacherOwns(tx, teacherId, l))) return { ok: false, reason: 'not_found' };
      if (l.status !== 'requested') {
        return { ok: false, reason: l.close_reason === 'time_no_longer_free' ? 'time_taken' : 'closed' };
      }
      if (l.overdue) return { ok: false, reason: 'expired' };
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
      await closeOverlappingRequests(tx, l, now);
      await writeAudit(
        tx,
        { type: 'LESSON_ACCEPTED', outcome: 'success', actorId: teacherId, details: { lesson: l.id } },
        now,
      );
      await tellAbout(tx, l.id, 'accepted', { actorId: teacherId }, now);
      return { ok: true };
    }),
  ).catch((error) => {
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
    if (!l || !(await teacherOwns(tx, teacherId, l)) || l.status !== 'confirmed') return { ok: false, reason: 'not_found' };
    if (!l.ended) return { ok: false, reason: 'not_yet' };
    if (l.outcome) return { ok: false, reason: 'done' };
    await tx`UPDATE lessons SET outcome = ${o} WHERE id = ${l.id}`;
    await writeAudit(
      tx,
      { type: 'LESSON_OUTCOME_RECORDED', outcome: 'success', actorId: teacherId, details: { lesson: l.id, outcome: o } },
      now,
    );
    return { ok: true };
  });
}

// ======================================================================= AA Pro closes

/**
 * D3A-13, D3A-24: open requests and upcoming lessons whose teacher was deactivated, or whose
 * link or subject ended, are closed by AA Pro, and the parents are told. Called in the same
 * transaction as the change that ended the link (parent, admin or teacher-profile paths), and by
 * the shared sweep as a backstop for any other path. A suspended teacher's lessons are left as
 * they are: they can't accept new ones, and suspension may be lifted.
 */
export async function closeLessonsWithoutLink(
  tx: Db,
  scope: { teacherId?: string; studentId?: string },
  now: Date = new Date(),
): Promise<number> {
  const teacherId = scope.teacherId && UUID.test(scope.teacherId) ? scope.teacherId : null;
  const studentId = scope.studentId && UUID.test(scope.studentId) ? scope.studentId : null;
  const due = await tx<Array<{ id: string; status: string; reason: 'teacher_deactivated' | 'link_ended' }>>`
    SELECT l.id, l.status,
           CASE WHEN t.status = 'deactivated' THEN 'teacher_deactivated' ELSE 'link_ended' END AS reason
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id
    WHERE (${teacherId}::uuid IS NULL OR l.teacher_id = ${teacherId})
      AND (${studentId}::uuid IS NULL OR l.student_id = ${studentId})
      AND ((l.status = 'requested' AND l.reply_deadline > now()) OR (l.status = 'confirmed' AND l.ends_at > now()))
      AND (t.status = 'deactivated' OR NOT EXISTS (
            SELECT 1 FROM teacher_student_links k
            WHERE k.teacher_id = l.teacher_id AND k.student_id = l.student_id AND k.status = 'active'
              AND l.subject = ANY (k.subjects)))
    ORDER BY l.id
    FOR UPDATE OF l`;
  for (const l of due) {
    if (l.status === 'requested') {
      await tx`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = ${l.reason} WHERE id = ${l.id}`;
    } else {
      await tx`UPDATE lessons SET status = 'cancelled', closed_by = 'aa_pro', close_reason = ${l.reason} WHERE id = ${l.id}`;
    }
    await writeAudit(
      tx,
      { type: 'LESSON_CLOSED_BY_AA_PRO', outcome: 'success', details: { lesson: l.id, reason: l.reason } },
      now,
    );
    await tellAbout(tx, l.id, l.status === 'requested' ? 'closed_by_aa_pro' : 'cancelled', {}, now);
  }
  return due.length;
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
                        AND n.type = 'lesson_expired')
      LIMIT 200`;
    const ids = new Set([...expired.map((r) => r.id), ...missed.map((r) => r.id)]);
    for (const id of ids) await tellAbout(tx, id, 'expired', {}, now);
    return ids.size;
  });
  done += await sql.begin((tx) => closeLessonsWithoutLink(tx, {}, now));
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
  return done;
}

// ======================================================================= notifications (in-app)

type LessonEvent =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'time_taken'
  | 'withdrawn'
  | 'expired'
  | 'cancelled'
  | 'closed_by_aa_pro'
  | 'outcome_needed';

interface LessonFacts {
  id: string;
  teacher_id: string;
  student_id: string;
  subject: string;
  starts_at: Date;
  minutes: number;
  status: string;
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
] as const;

const TEACHER_HREF = '/teacher/schedule';
const PARENT_HREF = '/parent/calendar';

/**
 * Who is told what (CR-16 rules): never the person who acted; parents only while active parents
 * of the child; the teacher only while approved and active. A teacher's text names the subject,
 * grade and time, never the child (CR-16 §3). No free-text notes are copied into notifications.
 */
async function tellAbout(
  tx: Db,
  lessonId: string,
  event: LessonEvent,
  opts: { actorId?: string },
  now: Date,
): Promise<void> {
  const [f] = await tx<LessonFacts[]>`
    SELECT l.id, l.teacher_id, l.student_id, l.subject, l.starts_at, l.minutes, l.status, l.closed_by,
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
  const parentNotes = async (type: string, title: (zone: string) => string, body = '') => {
    for (const p of parents) {
      if (p.id === opts.actorId) continue;
      await notify(tx, {
        recipientId: p.id,
        kind: 'update',
        type,
        title: title(p.zone),
        body,
        href: PARENT_HREF,
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
      await parentNotes('lesson_accepted', (z) => `${f.teacher_name} accepted ${f.child_name}'s ${subject} lesson, ${when(z)}`);
      return;
    case 'declined':
      await parentNotes('lesson_declined', (z) => `${f.teacher_name} declined ${f.child_name}'s ${subject} lesson request for ${when(z)}`);
      return;
    case 'time_taken':
      await parentNotes(
        'lesson_time_no_longer_free',
        (z) => `${f.child_name}'s ${subject} lesson request for ${when(z)} is closed: the time is no longer free`,
        'Choose another time if you would like a lesson.',
      );
      // The teacher of a request closed because of another teacher's lesson for the same child.
      await teacherNote('lesson_time_no_longer_free', 'update', `Lesson request closed, the time is no longer free: ${forTeacher}`);
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
        await parentNotes('lesson_cancelled', (z) => `${f.child_name}'s ${subject} lesson on ${when(z)} is cancelled: ${why}`);
        await teacherNote('lesson_cancelled', 'update', `Lesson cancelled by AA Pro: ${forTeacher}`);
        return;
      }
      const who = await actorFirst();
      if (f.closed_by === 'parent') {
        await teacherNote('lesson_cancelled', 'update', `Lesson cancelled by the parent: ${forTeacher}`);
        await parentNotes('lesson_cancelled', (z) => `${who || 'A parent'} cancelled ${f.child_name}'s ${subject} lesson on ${when(z)}`);
      } else {
        await parentNotes('lesson_cancelled', (z) => `${f.teacher_name} cancelled ${f.child_name}'s ${subject} lesson on ${when(z)}`);
      }
      return;
    }
    case 'closed_by_aa_pro': {
      const why = f.close_reason === 'teacher_deactivated' ? 'the teacher is no longer available' : 'the teacher link ended';
      await parentNotes('lesson_declined', (z) => `${f.child_name}'s ${subject} lesson request for ${when(z)} is closed: ${why}`);
      await teacherNote('lesson_declined', 'update', `Lesson request closed by AA Pro: ${forTeacher}`);
      return;
    }
    case 'outcome_needed':
      await teacherNote('lesson_outcome_needed', 'action', `Record how the lesson went: ${forTeacher}`, 'Taught, or did not take place.');
      return;
  }
}

// ======================================================================= lists

export type LessonStatus = 'requested' | 'confirmed' | 'declined' | 'withdrawn' | 'expired' | 'cancelled';

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
  /** An open request past its deadline shows as expired at once, before the sweep records it. */
  status: LessonStatus;
  replyDeadline: Date;
  closedBy: 'parent' | 'teacher' | 'aa_pro' | null;
  closeReason: 'time_no_longer_free' | 'teacher_deactivated' | 'link_ended' | null;
  closeNote: string | null;
  outcome: 'taught' | 'not_taken_place' | null;
  /** Shown to parents and teachers only, never to children (D3A-23). */
  price: { currency: string; priceMinor: number; rateMinor: number; basis: 'agreed' | 'listed' } | null;
  /** Actions the viewer may take now (the server checks again). */
  canWithdraw: boolean;
  canCancel: boolean;
  canAnswer: boolean;
  needsOutcome: boolean;
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
  reply_deadline: Date;
  closed_by: string | null;
  close_reason: string | null;
  close_note: string | null;
  outcome: string | null;
  currency: string;
  price_minor: string;
  rate_minor: string;
  price_basis: string;
  overdue: boolean;
  cancellable: boolean;
  ended: boolean;
}

const LIST_COLUMNS = (sql: Db) => sql`
  l.id, l.teacher_id, t.display_name AS teacher_name, l.student_id, c.display_name AS child_name, sp.grade,
  l.subject, l.starts_at, l.ends_at, l.minutes, l.status, l.reply_deadline, l.closed_by, l.close_reason, l.close_note,
  l.outcome, l.currency, l.price_minor, l.rate_minor, l.price_basis,
  l.reply_deadline <= now() AS overdue,
  l.starts_at - make_interval(mins => ${CANCEL_CUTOFF_MINUTES}) >= now() AS cancellable,
  l.ends_at <= now() AS ended`;

function toItem(r: ListRow, viewer: 'parent' | 'teacher' | 'student'): LessonItem {
  const status: LessonStatus = r.status === 'requested' && r.overdue ? 'expired' : (r.status as LessonStatus);
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
    status,
    replyDeadline: r.reply_deadline,
    closedBy: r.closed_by as LessonItem['closedBy'],
    closeReason: r.close_reason as LessonItem['closeReason'],
    closeNote: viewer === 'student' ? null : r.close_note,
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
    canWithdraw: viewer === 'parent' && status === 'requested',
    canCancel: viewer !== 'student' && status === 'confirmed' && r.cancellable,
    canAnswer: viewer === 'teacher' && status === 'requested',
    needsOutcome: viewer === 'teacher' && status === 'confirmed' && r.ended && !r.outcome,
  };
}

/** Lessons of the parent's children (active parent only), from 30 days ago on, soonest first. */
export async function lessonsForParent(sql: Db, parentId: string, now: Date = new Date()): Promise<LessonItem[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await sql<ListRow[]>`
    SELECT ${LIST_COLUMNS(sql)}
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.student_id IN (SELECT g.student_id FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
                           WHERE g.parent_id = ${parentId} AND g.status = 'active' AND p.status = 'active')
      AND l.ends_at > ${new Date(now.getTime() - 30 * DAY)}
    ORDER BY l.starts_at, l.id`;
  return rows.map((r) => toItem(r, 'parent'));
}

/** The teacher's own lessons with students linked to them now in that subject (as homework, W-11). */
export async function lessonsForTeacher(sql: Db, teacherId: string, now: Date = new Date()): Promise<LessonItem[]> {
  if (!UUID.test(teacherId)) return [];
  const rows = await sql<ListRow[]>`
    SELECT ${LIST_COLUMNS(sql)}
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    JOIN teacher_profiles tp ON tp.account_id = t.id AND tp.approval_status = 'approved'
    WHERE l.teacher_id = ${teacherId} AND t.status = 'active'
      AND EXISTS (SELECT 1 FROM teacher_student_links k WHERE k.teacher_id = l.teacher_id
                  AND k.student_id = l.student_id AND k.status = 'active' AND l.subject = ANY (k.subjects))
      AND l.ends_at > ${new Date(now.getTime() - 30 * DAY)}
    ORDER BY l.starts_at, l.id`;
  return rows.map((r) => toItem(r, 'teacher'));
}

/** The child's own confirmed lessons that haven't ended, without prices or requests (D3A-23). */
export async function lessonsForStudent(sql: Db, studentId: string, now: Date = new Date()): Promise<LessonItem[]> {
  if (!UUID.test(studentId)) return [];
  const rows = await sql<ListRow[]>`
    SELECT ${LIST_COLUMNS(sql)}
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.student_id = ${studentId} AND c.status = 'active' AND l.status = 'confirmed'
      AND l.ends_at > ${now}
    ORDER BY l.starts_at, l.id`;
  return rows.map((r) => toItem(r, 'student'));
}

/** For tests and pages that need one lesson's current row (no access check: callers check). */
export async function lessonStatus(sql: Db, lessonId: string): Promise<string | null> {
  if (!UUID.test(lessonId)) return null;
  const [r] = await sql<Array<{ status: string }>>`SELECT status FROM lessons WHERE id = ${lessonId}`;
  return r?.status ?? null;
}

