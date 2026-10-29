import 'server-only';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { formatLessonTime } from '@/lib/lessonDisplay';
import type { Db, Sql } from './db/client';
import { inTx, notify } from './notifications/notify';

/**
 * TL-2 material requests (owner approval of TL2-1 to TL2-8 with safeguards 1-6, 25 Oct 2026;
 * SQL v2 and scope authorised 26 Oct 2026, 08:15 IST). A lesson's teacher asks the child's parents
 * for a book or chapter for that lesson; a parent shares one the teacher can ALREADY view, or says
 * it is unavailable; the teacher may withdraw it; AA Pro closes it when the lesson closes or ends.
 *
 * Every function checks the signed-in account here first (role, lesson ownership, active guardian
 * link); migration 0033 then enforces the same rules again whatever is sent. Nothing here writes a
 * lesson, book, book assignment, teacher link or meeting link: a request never changes the lesson
 * and never grants access (safeguards 1 and 3). Notifications are in-app only (safeguard 5): no
 * email or WhatsApp is sent or queued. A teacher's notification never names the child (CR-16), and
 * no free text typed by anyone is copied into a notification.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_OPEN_MATERIAL_REQUESTS = 5;
export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_NOTE_LENGTH = 300;
export const MATERIAL_NOTIFICATION_TYPES = ['material_requested', 'material_shared', 'material_unavailable'] as const;

const TEACHER_HREF = '/teacher/schedule';
const PARENT_HREF = '/parent/calendar';

export type MaterialStatus = 'open' | 'shared' | 'unavailable' | 'no_longer_needed';

export interface MaterialRequestView {
  id: string;
  lessonId: string;
  /** "No longer needed" as soon as the lesson has closed or ended, before the sweep records it. */
  status: MaterialStatus;
  /** What is asked for: the lesson's chapter label (TL-1, set by the database) or the description. */
  what: string;
  note: string | null;
  createdAt: Date;
  /** Shared: the label written by the database from the parent's own titles. */
  sharedLabel: string | null;
  /** Teacher only, and only while the teacher can view it now: the view-only reader. */
  sharedHref: string | null;
  /** Teacher only: the shared book is no longer visible to them (unshared, archived, link ended). */
  sharedNoLongerVisible: boolean;
  answerNote: string | null;
  closedBy: 'parent' | 'teacher' | 'aa_pro' | null;
  /** Actions the viewer may take now (the server and the database check again). */
  canAnswer: boolean;
  canWithdraw: boolean;
}

interface Row {
  id: string;
  lesson_id: string;
  status: MaterialStatus;
  what: string;
  note: string | null;
  created_at: Date;
  shared_label: string | null;
  shared_book_id: string | null;
  shared_chapter_id: string | null;
  answer_note: string | null;
  closed_by: MaterialRequestView['closedBy'];
  lesson_live: boolean;
  teacher_can_view: boolean;
}

/**
 * A lesson is "live" for material requests: a parent's request or a teacher's proposal (TL3-1)
 * that is open and not overdue, or confirmed and not ended.
 */
const live = (sql: Db, now: Date) =>
  sql`((l.status IN ('requested', 'proposed') AND l.reply_deadline > ${now}) OR (l.status = 'confirmed' AND l.ends_at > ${now}))`;

/**
 * The lesson's own teacher, while active and approved, on a lesson they may still see on My
 * schedule: linked to the child for the subject, or kept for them under OC-53. The same rule as
 * lessonsForTeacher, so reads (F6) and withdrawals (F5) never reach further than the schedule.
 */
const teacherSees = (sql: Db, teacherId: string) =>
  sql`l.teacher_id = ${teacherId}
      AND EXISTS (SELECT 1 FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id AND tp.approval_status = 'approved'
                  WHERE a.id = ${teacherId} AND a.status = 'active')
      AND (EXISTS (SELECT 1 FROM teacher_student_links k WHERE k.teacher_id = l.teacher_id
                   AND k.student_id = l.student_id AND k.status = 'active' AND l.subject = ANY (k.subjects))
           OR EXISTS (SELECT 1 FROM lessons_kept kp WHERE kp.lesson_id = l.id))`;

function toView(r: Row, viewer: 'parent' | 'teacher'): MaterialRequestView {
  const status: MaterialStatus = r.status === 'open' && !r.lesson_live ? 'no_longer_needed' : r.status;
  const visible = viewer === 'teacher' && r.status === 'shared' && r.shared_book_id !== null && r.teacher_can_view;
  return {
    id: r.id,
    lessonId: r.lesson_id,
    status,
    what: r.what,
    note: r.note,
    createdAt: r.created_at,
    sharedLabel: r.shared_label,
    sharedHref: visible
      ? `/books/${r.shared_book_id}${r.shared_chapter_id ? `?chapter=${r.shared_chapter_id}` : ''}`
      : null,
    sharedNoLongerVisible: viewer === 'teacher' && r.status === 'shared' && !visible,
    answerNote: r.answer_note,
    closedBy: r.closed_by,
    canAnswer: viewer === 'parent' && status === 'open',
    canWithdraw: viewer === 'teacher' && status === 'open',
  };
}

/**
 * The requests on these lessons that this viewer may see (TL2-6): the lesson's own teacher while
 * active and approved and the lesson is on their schedule (teacherSees); an active parent of the child. Anyone else gets nothing, whatever ids are
 * sent. Grouped by lesson, oldest first.
 */
export async function materialRequestsFor(
  sql: Db,
  viewer: { id: string; role: 'parent' | 'teacher' | 'student' },
  lessonIds: string[],
  now: Date = new Date(),
): Promise<Map<string, MaterialRequestView[]>> {
  const out = new Map<string, MaterialRequestView[]>();
  const ids = lessonIds.filter((x) => UUID.test(x));
  if (!UUID.test(viewer.id) || ids.length === 0 || viewer.role === 'student') return out;
  const who =
    viewer.role === 'teacher'
      ? teacherSees(sql, viewer.id)
      : sql`EXISTS (SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
                    WHERE g.parent_id = ${viewer.id} AND g.student_id = l.student_id AND g.status = 'active'
                      AND p.role = 'parent' AND p.status = 'active')`;
  const rows = await sql<Row[]>`
    SELECT m.id, m.lesson_id, m.status, coalesce(lc.label, m.description) AS what, m.note, m.created_at,
           m.shared_label, m.shared_book_id, m.shared_chapter_id, m.answer_note, m.closed_by,
           ${live(sql, now)} AS lesson_live,
           (m.shared_book_id IS NOT NULL
            AND material_requests_teacher_can_view(l.teacher_id, l.student_id, l.subject, m.shared_book_id)
            AND (m.shared_chapter_id IS NULL OR EXISTS (
                   SELECT 1 FROM book_chapters ch WHERE ch.id = m.shared_chapter_id AND ch.book_id = m.shared_book_id
                     AND ch.archived_at IS NULL AND ch.complete))) AS teacher_can_view
    FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
    LEFT JOIN lesson_chapters lc ON lc.lesson_id = m.lesson_id AND lc.position = m.lesson_position
    WHERE m.lesson_id IN ${sql(ids)} AND ${who}
    ORDER BY m.created_at, m.id`;
  for (const r of rows) {
    const list = out.get(r.lesson_id) ?? [];
    list.push(toView(r, viewer.role));
    out.set(r.lesson_id, list);
  }
  return out;
}

/**
 * Parent home (owner direction 23:06 IST; safeguard 6): open requests waiting for an answer on
 * this parent's own children's live lessons. Counted from the records, never from notifications.
 */
export async function openMaterialRequestCount(sql: Db, parentId: string, now: Date = new Date()): Promise<number> {
  if (!UUID.test(parentId)) return 0;
  const [c] = await sql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
    WHERE m.status = 'open' AND ${live(sql, now)}
      AND EXISTS (SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
                  WHERE g.parent_id = ${parentId} AND g.student_id = l.student_id AND g.status = 'active'
                    AND p.role = 'parent' AND p.status = 'active')`;
  return c?.n ?? 0;
}

export interface ShareOption {
  bookId: string;
  title: string;
  chapters: Array<{ id: string; label: string }>;
}

/**
 * What a parent may share for one open request: only books the lesson's teacher can already view
 * (the same database function the share is checked with), each whole or one complete, live chapter.
 */
export async function shareOptions(sql: Db, parentId: string, requestId: string): Promise<ShareOption[]> {
  if (!UUID.test(parentId) || !UUID.test(requestId)) return [];
  const rows = await sql<Array<{ book_id: string; title: string; chapter_id: string | null; label: string | null }>>`
    SELECT b.id AS book_id, b.title, ch.id AS chapter_id,
           CASE WHEN ch.id IS NULL THEN NULL ELSE format('%s · %s. %s', b.title, ch.number, ch.title) END AS label
    FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
    JOIN books b ON b.subject = l.subject
    LEFT JOIN book_chapters ch ON ch.book_id = b.id AND ch.archived_at IS NULL AND ch.complete
    WHERE m.id = ${requestId} AND m.status = 'open'
      AND material_requests_parent_ok(${parentId}, l.student_id)
      AND material_requests_teacher_can_view(l.teacher_id, l.student_id, l.subject, b.id)
    ORDER BY b.title, b.id, ch.number`;
  const books = new Map<string, ShareOption>();
  for (const r of rows) {
    const b = books.get(r.book_id) ?? { bookId: r.book_id, title: r.title, chapters: [] };
    if (r.chapter_id && r.label) b.chapters.push({ id: r.chapter_id, label: r.label });
    books.set(r.book_id, b);
  }
  return [...books.values()];
}

// ======================================================================= actions

export type MaterialReason = 'not_found' | 'closed' | 'limit' | 'invalid' | 'not_shareable' | 'duplicate';
export type MaterialResult = { ok: true; id: string } | { ok: false; reason: MaterialReason };

const clean = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return null;
  return [...t].length <= max ? t : undefined;
};

const dbReason = (e: unknown, fallback: MaterialReason): MaterialReason => {
  const err = e as { code?: string; message?: string };
  if (err.code === '42501') return fallback;
  if (err.code === '23503') return 'invalid';
  if (err.code === '23514') return /at most five/.test(err.message ?? '') ? 'limit' : 'closed';
  throw e;
};

interface Facts {
  lesson_id: string;
  teacher_id: string;
  student_id: string;
  subject: string;
  starts_at: Date;
  grade: number | null;
  child_name: string;
  teacher_name: string;
  teacher_zone: string;
  teacher_active: boolean;
}

async function facts(tx: Db, lessonId: string): Promise<Facts | undefined> {
  const [f] = await tx<Facts[]>`
    SELECT l.id AS lesson_id, l.teacher_id, l.student_id, l.subject, l.starts_at, sp.grade,
           c.display_name AS child_name, t.display_name AS teacher_name, t.time_zone AS teacher_zone,
           (t.status = 'active' AND tp.approval_status = 'approved') AS teacher_active
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id LEFT JOIN teacher_profiles tp ON tp.account_id = t.id
    JOIN accounts c ON c.id = l.student_id LEFT JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.id = ${lessonId}`;
  return f;
}

const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;

/** In-app only. A teacher's text names subject, grade and time, never the child (CR-16 §3). */
async function tellTeacher(
  tx: Db,
  f: Facts,
  requestId: string,
  type: 'material_shared' | 'material_unavailable',
  now: Date,
) {
  if (!f.teacher_active) return;
  const lesson = `${subjectName(f.subject)}, ${f.grade ? `Grade ${Number(f.grade)}` : 'grade not set'}, ${formatLessonTime(f.starts_at, f.teacher_zone)}`;
  await notify(tx, {
    recipientId: f.teacher_id,
    kind: 'update',
    type,
    title:
      type === 'material_shared'
        ? `Material shared for your lesson: ${lesson}`
        : `Material not available for your lesson: ${lesson}`,
    body:
      type === 'material_shared'
        ? 'Open it from the lesson in My schedule (view only).'
        : 'The parent says it isn’t available. See the lesson in My schedule.',
    href: TEACHER_HREF,
    entityType: 'material_request',
    entityId: requestId,
    dedupeKey: `${type}:${requestId}:${f.teacher_id}`,
    now,
  });
}

/**
 * TL2-2, TL2-3: the lesson's own teacher asks for one of the lesson's requested chapters
 * (`position`) or describes what is needed, with an optional note. Parents get an action notice.
 */
export async function requestMaterial(
  sql: Sql,
  teacherId: string,
  input: { lessonId: unknown; position?: unknown; description?: unknown; note?: unknown },
  now: Date = new Date(),
): Promise<MaterialResult> {
  const lessonId = typeof input.lessonId === 'string' ? input.lessonId : '';
  if (!UUID.test(teacherId) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  const rawPos = typeof input.position === 'string' ? input.position.trim() : input.position;
  const position = rawPos === undefined || rawPos === null || rawPos === '' ? null : Number(rawPos);
  const description = clean(input.description, MAX_DESCRIPTION_LENGTH);
  const note = clean(input.note, MAX_NOTE_LENGTH);
  if (description === undefined || note === undefined) return { ok: false, reason: 'invalid' };
  if (position !== null && !(Number.isInteger(position) && position >= 1 && position <= 5))
    return { ok: false, reason: 'invalid' };
  if ((position === null) === (description === null)) return { ok: false, reason: 'invalid' };
  try {
    return await inTx(sql, async (tx) => {
      const f = await facts(tx, lessonId);
      if (!f || f.teacher_id !== teacherId) return { ok: false as const, reason: 'not_found' as const };
      // The same lock 0033 takes for new requests, taken first, so the check below and the insert
      // are serialised: a double click or two tabs sending the same request create it only once.
      const [isLive] = await tx<Array<{ ok: boolean }>>`
        SELECT ${live(tx, now)} AS ok FROM lessons l WHERE l.id = ${lessonId} FOR NO KEY UPDATE`;
      // The app's own rule (as on the screens): a request past its reply deadline is no longer live.
      if (!isLive?.ok) return { ok: false as const, reason: 'closed' as const };
      const [same] = await tx`
        SELECT 1 FROM material_requests
        WHERE lesson_id = ${lessonId} AND status = 'open'
          AND (lesson_position = ${position} OR lower(description) = lower(${description}))`;
      if (same) return { ok: false as const, reason: 'duplicate' as const };
      const [r] = await tx<Array<{ id: string }>>`
        INSERT INTO material_requests (lesson_id, raised_by, lesson_position, description, note)
        VALUES (${lessonId}, ${teacherId}, ${position}, ${description}, ${note}) RETURNING id`;
      const parents = await tx<Array<{ id: string; zone: string }>>`
        SELECT p.id, p.time_zone AS zone FROM guardian_links g
        JOIN accounts p ON p.id = g.parent_id AND p.role = 'parent' AND p.status = 'active'
        WHERE g.student_id = ${f.student_id} AND g.status = 'active' ORDER BY p.id`;
      for (const p of parents) {
        await notify(tx, {
          recipientId: p.id,
          kind: 'action',
          type: 'material_requested',
          title: `${f.teacher_name} asked for material for ${f.child_name}'s ${subjectName(f.subject)} lesson, ${formatLessonTime(f.starts_at, p.zone)}`,
          body: 'Share a book or chapter, or say it isn’t available, in Family calendar.',
          href: PARENT_HREF,
          entityType: 'material_request',
          entityId: r!.id,
          dedupeKey: `material_requested:${r!.id}:${p.id}`,
          now,
        });
      }
      return { ok: true as const, id: r!.id };
    });
  } catch (e) {
    return { ok: false, reason: dbReason(e, 'not_found') };
  }
}

/** The request's lesson, if this parent is an active parent of its child (else undefined). */
async function parentRequest(tx: Db, parentId: string, requestId: string) {
  const [m] = await tx<Array<{ lesson_id: string }>>`
    SELECT m.lesson_id FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
    WHERE m.id = ${requestId} AND material_requests_parent_ok(${parentId}, l.student_id)`;
  return m;
}

/** TL2-4: a parent shares a whole book, or one chapter of it, that the teacher can already view. */
export async function shareMaterial(
  sql: Sql,
  parentId: string,
  input: { requestId: unknown; bookId: unknown; chapterId?: unknown },
  now: Date = new Date(),
): Promise<MaterialResult> {
  const requestId = typeof input.requestId === 'string' ? input.requestId : '';
  const bookId = typeof input.bookId === 'string' ? input.bookId : '';
  const chapterId = typeof input.chapterId === 'string' && input.chapterId ? input.chapterId : null;
  if (!UUID.test(parentId) || !UUID.test(requestId)) return { ok: false, reason: 'not_found' };
  if (!UUID.test(bookId) || (chapterId !== null && !UUID.test(chapterId)))
    return { ok: false, reason: 'not_shareable' };
  try {
    return await inTx(sql, async (tx) => {
      const m = await parentRequest(tx, parentId, requestId);
      if (!m) return { ok: false as const, reason: 'not_found' as const };
      const done = await tx`
        UPDATE material_requests SET status = 'shared', closed_by = 'parent', closed_by_account = ${parentId},
               shared_book_id = ${bookId}, shared_chapter_id = ${chapterId}
        WHERE id = ${requestId} AND status = 'open'
          AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = material_requests.lesson_id AND ${live(tx, now)})
        RETURNING id`;
      if (done.length === 0) return { ok: false as const, reason: 'closed' as const };
      const f = await facts(tx, m.lesson_id);
      if (f) await tellTeacher(tx, f, requestId, 'material_shared', now);
      return { ok: true as const, id: requestId };
    });
  } catch (e) {
    return { ok: false, reason: dbReason(e, 'not_shareable') };
  }
}

/** TL2-1: a parent says the material isn't available (optional note; never copied to notices). */
export async function markMaterialUnavailable(
  sql: Sql,
  parentId: string,
  input: { requestId: unknown; note?: unknown },
  now: Date = new Date(),
): Promise<MaterialResult> {
  const requestId = typeof input.requestId === 'string' ? input.requestId : '';
  if (!UUID.test(parentId) || !UUID.test(requestId)) return { ok: false, reason: 'not_found' };
  const note = clean(input.note, MAX_NOTE_LENGTH);
  if (note === undefined) return { ok: false, reason: 'invalid' };
  try {
    return await inTx(sql, async (tx) => {
      const m = await parentRequest(tx, parentId, requestId);
      if (!m) return { ok: false as const, reason: 'not_found' as const };
      const done = await tx`
        UPDATE material_requests SET status = 'unavailable', closed_by = 'parent', closed_by_account = ${parentId},
               answer_note = ${note}
        WHERE id = ${requestId} AND status = 'open'
          AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = material_requests.lesson_id AND ${live(tx, now)})
        RETURNING id`;
      if (done.length === 0) return { ok: false as const, reason: 'closed' as const };
      const f = await facts(tx, m.lesson_id);
      if (f) await tellTeacher(tx, f, requestId, 'material_unavailable', now);
      return { ok: true as const, id: requestId };
    });
  } catch (e) {
    return { ok: false, reason: dbReason(e, 'not_found') };
  }
}

/** TL2-6: the lesson's teacher withdraws an open request (the parents' notice then reads "No longer needed"). */
export async function withdrawMaterialRequest(
  sql: Sql,
  teacherId: string,
  requestId: unknown,
): Promise<MaterialResult> {
  const id = typeof requestId === 'string' ? requestId : '';
  if (!UUID.test(teacherId) || !UUID.test(id)) return { ok: false, reason: 'not_found' };
  try {
    return await inTx(sql, async (tx) => {
      const [m] = await tx<Array<{ status: string }>>`
        SELECT m.status FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
        WHERE m.id = ${id} AND ${teacherSees(tx, teacherId)}`;
      if (!m) return { ok: false as const, reason: 'not_found' as const };
      const done = await tx`
        UPDATE material_requests SET status = 'no_longer_needed', closed_by = 'teacher', closed_by_account = ${teacherId}
        WHERE id = ${id} AND status = 'open' RETURNING id`;
      if (done.length === 0) return { ok: false as const, reason: 'closed' as const };
      return { ok: true as const, id };
    });
  } catch (e) {
    return { ok: false, reason: dbReason(e, 'not_found') };
  }
}

/**
 * TL2-7: the shared sweep closes open requests on lessons that have ended (including lessons kept
 * under OC-53). Lessons that close are handled at once by the database. No notification.
 */
export async function closeEndedMaterialRequests(sql: Sql): Promise<number> {
  const rows = await sql`SELECT material_requests_close_ended() AS id`;
  return rows.length;
}
