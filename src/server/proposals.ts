import 'server-only';
import type { SubjectId } from '@/fixtures/subjects';
import { localDate } from '@/lib/lessonDisplay';
import { wallTimeToUtc } from './assignments';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';
import {
  type ChapterIntent,
  closeOverlapping,
  insertPlanned,
  isSubject,
  lessonPrice,
  line,
  lockLesson,
  lockLinkFirst,
  NOTICE_HOURS,
  parentOwns,
  type PlannedChapter,
  plannedChoices,
  Refused,
  retrying,
  tellAbout,
  teacherOwns,
  UUID,
  validMinutes,
  WINDOW_DAYS,
} from './lessons';
import { MAX_DESCRIPTION_LENGTH, MAX_NOTE_LENGTH, requestMaterial } from './materialRequests';
import { askForMeetingPermission } from './meetingLinks';

/**
 * TL-3: lessons a teacher proposes (migration 0034 v1.4, SQL text approved 29 Oct 2026, 19:52 IST;
 * application work authorised 29 Oct 2026, 20:33 IST). Owner decisions: D-TLS-1, 2, 3, 5, 12, 13;
 * D-E2E-2, D-E2E-3 (b), D-E2E-4; TL3-1 to TL3-5; W-1 (b), W-2, W-3 kept.
 *
 * - An approved, active teacher proposes ONE lesson (D-TLS-1) for a child linked to them now, in a
 *   ticked subject (D-TLS-2): 10-40 minutes in 5-minute steps, 24 hours to 4 weeks ahead, any
 *   5-minute start, not limited to their usual times, not over a confirmed lesson of the teacher or
 *   the child (D-TLS-3). The price is the database's snapshot, as for a request (D-TLS-12).
 * - Optional planned chapters from books the teacher can already view, each with an optional intent
 *   (new, continue, revise), at most five; never a free-text topic or message (TL3-2).
 * - Any active parent of the child accepts or declines (optional reason, up to 200 characters,
 *   never copied into a notice); only the proposing teacher withdraws; AA Pro expires it after 48
 *   hours (or 2 hours before the start) and closes it when the time is taken or the link ends.
 * - OC-45: nothing is booked, and no meeting link is possible, until a parent accepts. The child
 *   sees nothing until then (TL3-3). A proposal holds no time: the first accepted wins (TL3-4).
 * - One open proposal per teacher, child and start (W-2); at most 10 open per teacher and child
 *   (D-TLS-5). The database (0034) enforces every rule again whatever is sent; its clock decides.
 * - Concurrency (review pack §9f): every action that confirms a lesson or creates a proposal retries
 *   on 40P01; closing overlapping proposals uses FOR UPDATE SKIP LOCKED (lessons.closeOverlapping).
 * Notifications are in-app only (OC-123 (4)); a teacher's never names the child (CR-16).
 */

export const PROPOSAL_STEP_MINUTES = 5;
export const OPEN_PROPOSALS_MAX = 10;
const MIN = 60_000;

// ======================================================================= who the teacher may propose to

export interface ProposableChild {
  id: string;
  name: string;
  grade: number | null;
  /** Subjects ticked on this child's link with this teacher. */
  subjects: SubjectId[];
}

export interface ProposalOptions {
  /** False when the teacher is not approved and active (nothing may be proposed). */
  allowed: boolean;
  /** The teacher has a listed hourly rate (D-TLS-12: no price, no proposal). */
  hasRate: boolean;
  timeZone: string;
  children: ProposableChild[];
}

/**
 * The children this teacher may propose to now (D-TLS-2): an active child, an active link, ticked
 * subjects; the teacher approved and active. The same rule the database checks
 * (lessons_teacher_link_ok).
 */
export async function proposalOptions(sql: Db, teacherId: string): Promise<ProposalOptions> {
  const none: ProposalOptions = { allowed: false, hasRate: false, timeZone: 'UTC', children: [] };
  if (!UUID.test(teacherId)) return none;
  const [t] = await sql<Array<{ ok: boolean; zone: string; rate: boolean }>>`
    SELECT (a.status = 'active' AND tp.approval_status = 'approved') AS ok, a.time_zone AS zone,
           coalesce(tl.hourly_offered AND tl.hourly_rate_minor IS NOT NULL, false) AS rate
    FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id
    LEFT JOIN teacher_listings tl ON tl.teacher_id = a.id
    WHERE a.id = ${teacherId} AND a.role = 'teacher'`;
  if (!t?.ok) return { ...none, timeZone: t?.zone ?? 'UTC' };
  const rows = await sql<Array<{ id: string; name: string; grade: number | null; subjects: string[] }>>`
    SELECT c.id, c.display_name AS name, sp.grade, l.subjects
    FROM teacher_student_links l
    JOIN accounts c ON c.id = l.student_id AND c.role = 'student' AND c.status = 'active'
    LEFT JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.teacher_id = ${teacherId} AND l.status = 'active'
    ORDER BY c.display_name, c.id`;
  return {
    allowed: true,
    hasRate: t.rate,
    timeZone: t.zone,
    children: rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        grade: r.grade === null ? null : Number(r.grade),
        subjects: (r.subjects ?? []).filter(isSubject),
      }))
      .filter((c) => c.subjects.length > 0),
  };
}

async function linked(sql: Db, teacherId: string, childId: string, subject: string): Promise<boolean> {
  if (!UUID.test(teacherId) || !UUID.test(childId) || !isSubject(subject)) return false;
  const o = await proposalOptions(sql, teacherId);
  return o.allowed && o.children.some((c) => c.id === childId && c.subjects.includes(subject));
}

export interface PlannableChapter {
  id: string;
  label: string;
}

/**
 * Chapters the teacher may plan for this child and subject: complete, live chapters of books the
 * teacher can ALREADY view (0033's material_requests_teacher_can_view, the rule 0034 checks).
 * Planning never grants access to anything new.
 */
export async function plannableChapters(
  sql: Db,
  teacherId: string,
  childId: string,
  subject: string,
): Promise<PlannableChapter[]> {
  if (!(await linked(sql, teacherId, childId, subject))) return [];
  return sql<PlannableChapter[]>`
    SELECT ch.id, format('%s · %s. %s', b.title, ch.number, ch.title) AS label
    FROM books b JOIN book_chapters ch ON ch.book_id = b.id AND ch.archived_at IS NULL AND ch.complete
    WHERE b.subject = ${subject}
      AND material_requests_teacher_can_view(${teacherId}::uuid, ${childId}::uuid, ${subject}, b.id)
    ORDER BY b.title, b.id, ch.number`;
}

export interface HistoryItem {
  id: string;
  startsAt: Date;
  minutes: number;
  /** Taught, did not take place, or not recorded yet (D3A-7). */
  outcome: 'taught' | 'not_taken_place' | null;
  chapters: Array<{ label: string; source: 'requested' | 'planned' }>;
}

/**
 * D-E2E-4: past lessons of this teacher with this child in this subject (confirmed, ended), newest
 * first, with their chapters and whether they took place. Only while the teacher is linked now.
 */
export async function proposalHistory(
  sql: Db,
  teacherId: string,
  childId: string,
  subject: string,
  now: Date = new Date(),
  limit = 10,
): Promise<HistoryItem[]> {
  if (!(await linked(sql, teacherId, childId, subject))) return [];
  const rows = await sql<
    Array<{
      id: string;
      starts_at: Date;
      minutes: number;
      outcome: HistoryItem['outcome'];
      chapters: HistoryItem['chapters'];
    }>
  >`
    SELECT l.id, l.starts_at, l.minutes, l.outcome,
           (SELECT coalesce(json_agg(json_build_object('label', lc.label, 'source', lc.source) ORDER BY lc.position), '[]'::json)
            FROM lesson_chapters lc WHERE lc.lesson_id = l.id) AS chapters
    FROM lessons l
    WHERE l.teacher_id = ${teacherId} AND l.student_id = ${childId} AND l.subject = ${subject}
      AND l.status = 'confirmed' AND l.ends_at <= ${now}
    ORDER BY l.starts_at DESC, l.id
    LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    startsAt: r.starts_at,
    minutes: Number(r.minutes),
    outcome: r.outcome,
    chapters: r.chapters,
  }));
}

// ======================================================================= proposing

export interface ProposeInput {
  childId: unknown;
  subject: unknown;
  /** The day and time in the teacher's own time zone (YYYY-MM-DD and HH:MM). */
  date: unknown;
  time: unknown;
  minutes: unknown;
  /** Optional planned chapters: [{ chapterId, intent }] (at most five). */
  planned?: unknown;
  /**
   * Readiness pack §3.2 step 4 (TL3-1): an optional material request, created in the same
   * transaction as the proposal: what is needed (up to 200 characters) and a note (up to 300).
   */
  material?: { description?: unknown; note?: unknown };
  /**
   * The price shown on the review step (owner acceptance, 29 Oct): sent with the proposal, and the
   * database refuses the proposal if its own price snapshot differs (0034, as for a request).
   */
  shown?: { basis?: unknown; priceMinor?: unknown };
}

export type ProposeReason =
  | 'not_allowed'
  | 'not_linked'
  | 'invalid'
  | 'step'
  | 'notice'
  | 'window'
  | 'busy'
  | 'duplicate'
  | 'limit'
  | 'no_rate'
  | 'chapters'
  | 'material'
  | 'price_changed';

export type ProposeResult = { ok: true; id: string } | { ok: false; reason: ProposeReason };

/** Maps a database refusal (0034) to a plain reason. */
function proposeReasonFromDb(error: unknown): ProposeReason | null {
  const e = error as { code?: string; message?: string; table_name?: string };
  const m = e.message ?? '';
  if (e.table_name === 'lesson_chapters' || /chapter|topic/.test(m)) return 'chapters';
  if (e.code === '23505') return 'duplicate';
  if (e.code === '42501') return m.includes('linked') ? 'not_linked' : 'not_allowed';
  if (e.code !== '23514' && e.code !== 'P0001') return null;
  if (m.includes('24 hours ahead')) return 'notice';
  if (m.includes('4 weeks ahead')) return 'window';
  if (m.includes('5-minute step') || m.includes('starts_at_check')) return 'step';
  if (m.includes('overlaps a confirmed lesson')) return 'busy';
  if (m.includes('at most 10')) return 'limit';
  if (m.includes('no hourly rate')) return 'no_rate';
  if (m.includes('price has changed')) return 'price_changed';
  if (m.includes('active child account')) return 'not_allowed';
  return 'invalid';
}

/** The start instant of a teacher's local day and time, or null if it doesn't exist (DST gap). */
export function proposalStart(date: string, time: string, zone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  if (hh > 23 || mm > 59 || mm % PROPOSAL_STEP_MINUTES !== 0) return null;
  const at = wallTimeToUtc(date, time, zone);
  if (!at || Number.isNaN(at.getTime())) return null;
  // A wall time inside a daylight-saving gap does not exist: refuse it rather than move it.
  const back = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  if (back !== time || localDate(at, zone) !== date) return null;
  return at;
}

interface Checked {
  childId: string;
  childName: string;
  subject: SubjectId;
  minutes: number;
  startsAt: Date;
  planned: PlannedChapter[];
  description: string;
  materialNote: string;
  timeZone: string;
}

/**
 * The checks shared by the review step and by sending: the teacher, the link, the time, the
 * length, the chapters' shape and the material request's lengths. The database checks again.
 */
async function checkProposal(
  sql: Db,
  teacherId: string,
  input: ProposeInput,
  now: Date,
): Promise<{ ok: true; c: Checked } | { ok: false; reason: ProposeReason }> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  const childId = line(input.childId);
  const subject = line(input.subject);
  const minutes = typeof input.minutes === 'number' ? input.minutes : Number(line(input.minutes));
  const planned = plannedChoices(input.planned);
  if (!planned) return { ok: false, reason: 'chapters' };
  const description = typeof input.material?.description === 'string' ? input.material.description.trim() : '';
  const materialNote = typeof input.material?.note === 'string' ? input.material.note.trim() : '';
  if ([...description].length > MAX_DESCRIPTION_LENGTH || [...materialNote].length > MAX_NOTE_LENGTH)
    return { ok: false, reason: 'material' };
  if (materialNote && !description) return { ok: false, reason: 'material' };
  if (!UUID.test(childId) || !isSubject(subject) || !validMinutes(minutes)) return { ok: false, reason: 'invalid' };
  const options = await proposalOptions(sql, teacherId);
  if (!options.allowed) return { ok: false, reason: 'not_allowed' };
  const child = options.children.find((c) => c.id === childId && c.subjects.includes(subject));
  if (!child) return { ok: false, reason: 'not_linked' };
  if (!options.hasRate) return { ok: false, reason: 'no_rate' };
  const startsAt = proposalStart(line(input.date), line(input.time), options.timeZone);
  if (!startsAt) return { ok: false, reason: 'step' };
  // Friendly early answers; the database decides with its own clock.
  if (startsAt.getTime() < now.getTime() + NOTICE_HOURS * 60 * MIN) return { ok: false, reason: 'notice' };
  if (startsAt.getTime() > now.getTime() + WINDOW_DAYS * 24 * 60 * MIN) return { ok: false, reason: 'window' };
  return {
    ok: true,
    c: {
      childId,
      childName: child.name,
      subject: subject as SubjectId,
      minutes,
      startsAt,
      planned,
      description,
      materialNote,
      timeZone: options.timeZone,
    },
  };
}

export interface ProposalReview {
  /** The teacher's time zone, in which the review shows the times. */
  timeZone: string;
  childName: string;
  subject: SubjectId;
  startsAt: Date;
  endsAt: Date;
  minutes: number;
  /** The database's own price for this child, subject, time and length (lessons_price_for). */
  price: { basis: 'agreed' | 'listed'; currency: string; rateMinor: number; priceMinor: number };
  planned: Array<{ label: string; intent: ChapterIntent | null }>;
  material: { description: string; note: string } | null;
}

export type ReviewResult = { ok: true; review: ProposalReview } | { ok: false; reason: ProposeReason };

/**
 * "Review proposal" (owner acceptance, 29 Oct 2026): everything the teacher is about to send,
 * worked out by the server before anything is written. It writes nothing. The time must be free
 * of confirmed lessons now, the chapters must still be plannable, and the price is the database's.
 */
export async function reviewProposal(
  sql: Sql,
  teacherId: string,
  input: ProposeInput,
  now: Date = new Date(),
): Promise<ReviewResult> {
  const checked = await checkProposal(sql, teacherId, input, now);
  if (!checked.ok) return checked;
  const c = checked.c;
  const endsAt = new Date(c.startsAt.getTime() + c.minutes * MIN);
  const options = new Map(
    (await plannableChapters(sql, teacherId, c.childId, c.subject)).map((p) => [p.id, p.label] as const),
  );
  if (c.planned.some((p) => !options.has(p.chapterId))) return { ok: false, reason: 'chapters' };
  const [busy] = await sql<Array<{ busy: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM lessons
      WHERE status = 'confirmed' AND (teacher_id = ${teacherId} OR student_id = ${c.childId})
        AND tstzrange(starts_at, starts_at + make_interval(mins => minutes)) && tstzrange(${c.startsAt}, ${endsAt})
    ) AS busy`;
  if (busy?.busy) return { ok: false, reason: 'busy' };
  let price: ProposalReview['price'];
  try {
    const [p] = await sql<Array<{ basis: 'agreed' | 'listed'; rate: string; cur: string }>>`
      SELECT basis, rate, cur FROM lessons_price_for(${teacherId}::uuid, ${c.childId}::uuid, ${c.subject},
                                                     ${c.startsAt}::timestamptz, ${c.minutes}::int)`;
    price = {
      basis: p!.basis,
      currency: p!.cur,
      rateMinor: Number(p!.rate),
      priceMinor: lessonPrice(Number(p!.rate), c.minutes),
    };
  } catch (error) {
    const reason = proposeReasonFromDb(error);
    if (reason) return { ok: false, reason };
    throw error;
  }
  return {
    ok: true,
    review: {
      timeZone: c.timeZone,
      childName: c.childName,
      subject: c.subject,
      startsAt: c.startsAt,
      endsAt,
      minutes: c.minutes,
      price,
      planned: c.planned.map((p) => ({ label: options.get(p.chapterId)!, intent: p.intent })),
      material: c.description ? { description: c.description, note: c.materialNote } : null,
    },
  };
}

/**
 * The teacher proposes a lesson (OC-45). The proposal, its planned chapters and the parents' notice
 * are written in one transaction; the database checks every rule again. Retried on 40P01.
 */
export async function proposeLesson(
  sql: Sql,
  teacherId: string,
  input: ProposeInput,
  now: Date = new Date(),
): Promise<ProposeResult> {
  const checked = await checkProposal(sql, teacherId, input, now);
  if (!checked.ok) return checked;
  const { childId, subject, minutes, startsAt, planned, description, materialNote } = checked.c;
  // The price shown on the review step, if any: the database refuses the proposal if it differs.
  const shownBasis = input.shown?.basis === 'agreed' || input.shown?.basis === 'listed' ? input.shown.basis : null;
  const shownRaw =
    typeof input.shown?.priceMinor === 'string' ? input.shown.priceMinor.trim() : input.shown?.priceMinor;
  const shownPrice =
    shownRaw === undefined || shownRaw === null || shownRaw === ''
      ? null
      : /^\d{1,12}$/.test(String(shownRaw))
        ? String(shownRaw)
        : undefined;
  if (shownPrice === undefined || (shownBasis === null) !== (shownPrice === null))
    return { ok: false, reason: 'price_changed' };
  try {
    return await retrying(() =>
      sql.begin(async (tx): Promise<ProposeResult> => {
        const [row] = await tx<Array<{ id: string }>>`
          INSERT INTO lessons (teacher_id, student_id, proposed_by, subject, starts_at, minutes, status,
                               price_basis, price_minor)
          VALUES (${teacherId}, ${childId}, ${teacherId}, ${subject}, ${startsAt}, ${minutes}, 'proposed',
                  ${shownBasis}, ${shownPrice})
          RETURNING id`;
        await insertPlanned(tx, row!.id, planned, 0);
        await writeAudit(
          tx,
          {
            type: 'LESSON_PROPOSED',
            outcome: 'success',
            actorId: teacherId,
            subjectId: childId,
            details: { lesson: row!.id, minutes, plannedChapters: planned.length },
          },
          now,
        );
        await tellAbout(tx, row!.id, 'proposed', { actorId: teacherId }, now);
        if (description) {
          // The same function and rules as on My schedule (TL-2); all or nothing with the proposal.
          const m = await requestMaterial(tx, teacherId, { lessonId: row!.id, description, note: materialNote }, now);
          if (!m.ok) throw new Refused('material');
        }
        return { ok: true, id: row!.id };
      }),
    );
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: 'material' };
    const reason = proposeReasonFromDb(error);
    if (reason) return { ok: false, reason };
    throw error;
  }
}

export interface BusyTime {
  startsAt: Date;
  endsAt: Date;
  /** 'you': the teacher's own confirmed lesson; 'child': the child's lesson with another teacher (no name). */
  whose: 'you' | 'child';
}

/**
 * Readiness pack §3.2 step 2: the teacher's and the child's confirmed lessons in the proposal
 * window, shown as busy. A lesson of the child with another teacher shows only its time, never
 * that teacher's name. Only while the teacher is linked to the child in that subject.
 */
export async function proposalBusyTimes(
  sql: Db,
  teacherId: string,
  childId: string,
  subject: string,
  now: Date = new Date(),
): Promise<BusyTime[]> {
  if (!(await linked(sql, teacherId, childId, subject))) return [];
  const rows = await sql<Array<{ s: Date; e: Date; mine: boolean }>>`
    SELECT starts_at AS s, ends_at AS e, teacher_id = ${teacherId} AS mine FROM lessons
    WHERE status = 'confirmed' AND (teacher_id = ${teacherId} OR student_id = ${childId})
      AND ends_at > ${new Date(now.getTime() + NOTICE_HOURS * 60 * MIN)}
      AND starts_at < ${new Date(now.getTime() + (WINDOW_DAYS + 1) * 24 * 60 * MIN)}
    ORDER BY starts_at, ends_at`;
  return rows.map((r) => ({ startsAt: r.s, endsAt: r.e, whose: r.mine ? 'you' : 'child' }));
}

// ======================================================================= answering and withdrawing

export type ProposalAnswerResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'closed' | 'expired' | 'time_taken' | 'not_linked' | 'invalid' };

/**
 * A parent of the child accepts or declines a teacher's proposal (OC-45, D-TLS-2, TL3-5). Two
 * parents, or a parent and the teacher, at the same moment: the row lock gives exactly one outcome.
 * Accepting re-checks the deadline and the teacher's link (0034); if the time was taken meanwhile
 * (0029's no-overlap rules) the proposal closes as "time no longer free". Accepting closes the other
 * open requests and proposals at an overlapping time (TL3-4). Retried on 40P01.
 */
export async function answerProposal(
  sql: Sql,
  parentId: string,
  lessonId: string,
  answer: 'accept' | 'decline',
  reason: unknown = '',
  now: Date = new Date(),
): Promise<ProposalAnswerResult> {
  if (!UUID.test(parentId) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  // TL3-5: optional, at most 200 characters; trimmed here and again by the database (0034).
  const note = typeof reason === 'string' ? reason.trim() : '';
  if ([...note].length > 200) return { ok: false, reason: 'invalid' };
  return retrying(() =>
    sql.begin(async (tx): Promise<ProposalAnswerResult> => {
      await lockLinkFirst(tx, lessonId); // the same lock order as link removal (see lessons.lockLinkFirst)
      const l = await lockLesson(tx, lessonId);
      if (!l || l.origin !== 'teacher_proposal' || !(await parentOwns(tx, parentId, l))) {
        return { ok: false, reason: 'not_found' };
      }
      if (l.status !== 'proposed') {
        return { ok: false, reason: l.close_reason === 'time_no_longer_free' ? 'time_taken' : 'closed' };
      }
      if (l.overdue) return { ok: false, reason: 'expired' };
      if (answer === 'decline') {
        await tx`UPDATE lessons SET status = 'declined', closed_by = 'parent', closed_by_account = ${parentId},
                 close_note = ${note || null} WHERE id = ${l.id}`;
        await writeAudit(
          tx,
          { type: 'LESSON_PROPOSAL_DECLINED', outcome: 'success', actorId: parentId, details: { lesson: l.id } },
          now,
        );
        await tellAbout(tx, l.id, 'proposal_declined', { actorId: parentId }, now);
        return { ok: true };
      }
      try {
        await tx.savepoint(
          (sp) => sp`UPDATE lessons SET status = 'confirmed', confirmed_by = ${parentId} WHERE id = ${l.id}`,
        );
      } catch (error) {
        const e = error as { code?: string; message?: string; constraint_name?: string };
        if (e.code === '23P01') {
          // TL3-4: another lesson was confirmed at an overlapping time first.
          await tx`UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'time_no_longer_free'
                   WHERE id = ${l.id}`;
          await writeAudit(
            tx,
            {
              type: 'LESSON_CLOSED_BY_AA_PRO',
              outcome: 'success',
              details: { lesson: l.id, reason: 'time_no_longer_free' },
            },
            now,
          );
          await tellAbout(tx, l.id, 'time_taken', { actorId: parentId }, now);
          return { ok: false, reason: 'time_taken' };
        }
        if (e.code === '23514' && (e.message ?? '').includes('linked')) return { ok: false, reason: 'not_linked' };
        if (e.constraint_name === 'lessons_confirm_in_time') return { ok: false, reason: 'expired' };
        throw error;
      }
      await closeOverlapping(tx, l, parentId, now);
      await writeAudit(
        tx,
        { type: 'LESSON_PROPOSAL_ACCEPTED', outcome: 'success', actorId: parentId, details: { lesson: l.id } },
        now,
      );
      await tellAbout(tx, l.id, 'proposal_accepted', { actorId: parentId }, now);
      // As for a request (D3A-1): the parents are asked to allow the teacher's meeting links if needed.
      await askForMeetingPermission(tx, l.id, now);
      return { ok: true };
    }),
  ).catch((error) => {
    // The deadline is also checked by the database clock at commit time (lessons_confirm_in_time).
    if ((error as { constraint_name?: string }).constraint_name === 'lessons_confirm_in_time') {
      return { ok: false, reason: 'expired' } as const;
    }
    throw error;
  });
}

export type WithdrawProposalResult = { ok: true } | { ok: false; reason: 'not_found' | 'closed' | 'expired' };

/** The proposing teacher withdraws an open proposal (D-TLS-2); the parents are told. */
export async function withdrawProposal(
  sql: Sql,
  teacherId: string,
  lessonId: string,
  now: Date = new Date(),
): Promise<WithdrawProposalResult> {
  if (!UUID.test(teacherId) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<WithdrawProposalResult> => {
    const l = await lockLesson(tx, lessonId);
    if (!l || l.origin !== 'teacher_proposal' || !(await teacherOwns(tx, teacherId, l))) {
      return { ok: false, reason: 'not_found' };
    }
    if (l.status !== 'proposed') return { ok: false, reason: 'closed' };
    if (l.overdue) return { ok: false, reason: 'expired' };
    await tx`UPDATE lessons SET status = 'withdrawn', closed_by = 'teacher', closed_by_account = ${teacherId}
             WHERE id = ${l.id}`;
    await writeAudit(
      tx,
      { type: 'LESSON_PROPOSAL_WITHDRAWN', outcome: 'success', actorId: teacherId, details: { lesson: l.id } },
      now,
    );
    await tellAbout(tx, l.id, 'proposal_withdrawn', { actorId: teacherId }, now);
    return { ok: true };
  });
}

export type { PlannedChapter };
