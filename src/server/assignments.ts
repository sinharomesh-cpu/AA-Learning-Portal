import 'server-only';
import type { SubjectId } from '@/fixtures/subjects';
import { autoMark, cleanResponse, correctAnswerText, isAnswered, type Response } from '@/lib/homeworkMarking';
import { zoneOffsetMinutes } from '@/lib/localTime';
import {
  isAutoMarked,
  type QuestionType,
  type StoredQuestion,
  studentView,
  type StudentQuestion,
} from '@/lib/worksheetQuestions';
import { writeAudit } from './auth/audit';
import type { Db, Sql, Tx } from './db/client';
import { notify } from './notifications/notify';

/**
 * Homework given to one student (CR-17 PR 5; CR-07 FR-022 to FR-027; boards W3, W4, HW4 to HW8;
 * owner decisions OC-127 to OC-129).
 *
 * - Assigning makes a frozen copy of a Ready library worksheet for ONE student linked to the
 *   teacher in that subject. The same worksheet can be given again: each copy is separate (W-9).
 * - A copy is hidden from the student and parent until its date (W-7). They get an in-app
 *   notification the next time they open AA Pro on or after it; nothing is sent at that moment.
 * - The date of hidden work can change; once visible, only withdraw or revision (W-10).
 * - Teachers see their own homework only, and only for students linked to them now in that
 *   subject; when the link ends, access stops at once and nothing is deleted (W-11, FR-027).
 * - Students never get the answer key before release (CR-07 §3). Admins and the Super Admin get
 *   nothing (OC-90 Q-8). Every refusal looks like "not found".
 * - Submitting is final unless the teacher asks for a revision (H-N1, recommended). Automatic
 *   marks follow D3A-18 as recommended (src/lib/homeworkMarking.ts). No AI anywhere.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const OPEN = ['assigned', 'in_progress', 'revision_required'] as const;
const RETENTION_MONTHS = 12;
const line = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const para = (s: unknown) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').trim() : '');

export type TargetStatus =
  'assigned' | 'in_progress' | 'submitted' | 'under_review' | 'revision_required' | 'reviewed' | 'withdrawn';

/** UTC instant of a wall-clock time on a date in a time zone. */
export function wallTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  if (!DATE.test(date) || !TIME.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const check = new Date(guess);
  if (Number.isNaN(guess) || check.getUTCDate() !== d || check.getUTCMonth() !== m - 1) return null;
  const at = new Date(guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000);
  const result = new Date(guess - zoneOffsetMinutes(at, timeZone) * 60_000);
  // A wall time inside a daylight-saving gap (e.g. midnight where clocks jump from 00:00 to
  // 01:00) does not exist: use the first moment after the gap, never a time on the day before.
  const local = result.getTime() + zoneOffsetMinutes(result, timeZone) * 60_000;
  return local < guess ? new Date(result.getTime() + (guess - local)) : result;
}

const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
};

async function teacherZone(sql: Db, teacherId: string): Promise<string | null> {
  if (!UUID.test(teacherId)) return null;
  const [row] = await sql<Array<{ ok: boolean; time_zone: string }>>`
    SELECT (a.role = 'teacher' AND a.status = 'active' AND t.approval_status = 'approved') AS ok, a.time_zone
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id WHERE a.id = ${teacherId}`;
  return row?.ok ? row.time_zone : null;
}

/** Students linked to this teacher now in this subject, with what W-2 compares. */
async function eligibleStudents(sql: Db, teacherId: string, subject: string, only?: string, lock = false) {
  return sql<Array<{ id: string; name: string; grade: number | null; board: string | null }>>`
    SELECT c.id, c.display_name AS name, p.grade, p.curriculum AS board
    FROM teacher_student_links l
    JOIN accounts c ON c.id = l.student_id AND c.status = 'active'
    LEFT JOIN student_profiles p ON p.account_id = c.id
    WHERE l.teacher_id = ${teacherId} AND l.status = 'active' AND ${subject} = ANY (l.subjects)
      AND EXISTS (SELECT 1 FROM guardian_links g JOIN accounts pa ON pa.id = g.parent_id AND pa.status = 'active'
                  WHERE g.student_id = c.id AND g.status = 'active')
      AND (${only ?? null}::uuid IS NULL OR c.id = ${only ?? null})
    ORDER BY c.display_name
    ${lock ? sql`FOR SHARE OF l` : sql``}`;
}

type ReadyWorksheet = {
  id: string;
  kind: 'exercise' | 'handwritten';
  title: string;
  grade: number;
  board: string;
  subject: SubjectId;
  chapter: string | null;
  topic: string | null;
  difficulty: string | null;
  instructions: string;
  status: string;
  archived_at: Date | null;
};

async function ownWorksheet(sql: Db, teacherId: string, id: string): Promise<ReadyWorksheet | null> {
  if (!UUID.test(id)) return null;
  const [w] = await sql<ReadyWorksheet[]>`
    SELECT id, kind, title, grade, board, subject, chapter, topic, difficulty, instructions, status, archived_at
    FROM worksheets WHERE id = ${id} AND teacher_id = ${teacherId}`;
  return w ?? null;
}

type QRow = {
  id: string;
  type: QuestionType;
  prompt: string;
  data: Record<string, unknown>;
  answer_key: Record<string, unknown> | null;
  points: number;
  partial_credit: boolean;
  source_page: number | null;
};
const toStored = (q: QRow): StoredQuestion => ({
  type: q.type,
  prompt: q.prompt,
  data: q.data,
  answerKey: q.answer_key,
  points: q.points,
  partialCredit: q.partial_credit,
  sourcePage: q.source_page,
});

// ======================================================================= teacher: assigning (W3)

export interface AssignOptions {
  worksheet: {
    id: string;
    title: string;
    kind: 'exercise' | 'handwritten';
    subject: SubjectId;
    grade: number;
    board: string;
    questions: number;
    marks: number;
    /** Every question is marked automatically, so "as soon as marked" can be offered. */
    autoOnly: boolean;
  };
  students: Array<{ id: string; name: string; grade: number | null; board: string | null; copies: number }>;
  timeZone: string;
}

export async function assignOptions(sql: Sql, teacherId: string, worksheetId: string): Promise<AssignOptions | null> {
  const zone = await teacherZone(sql, teacherId);
  if (!zone) return null;
  const w = await ownWorksheet(sql, teacherId, worksheetId);
  if (!w || w.archived_at || w.status !== 'ready') return null;
  const [stats] = await sql<Array<{ n: number; marks: number; manual: number }>>`
    SELECT count(*)::int AS n, coalesce(sum(points), 0)::int AS marks,
           count(*) FILTER (WHERE type = 'short_answer')::int AS manual
    FROM worksheet_questions WHERE worksheet_id = ${w.id}`;
  const students = await eligibleStudents(sql, teacherId, w.subject);
  const copies = await sql<Array<{ student_id: string; n: number }>>`
    SELECT t.student_id, count(*)::int AS n FROM assignments a JOIN assignment_targets t ON t.assignment_id = a.id
    WHERE a.worksheet_id = ${w.id} AND a.teacher_id = ${teacherId} GROUP BY t.student_id`;
  const count = new Map(copies.map((c) => [c.student_id, c.n]));
  return {
    worksheet: {
      id: w.id,
      title: w.title,
      kind: w.kind,
      subject: w.subject,
      grade: w.grade,
      board: w.board,
      questions: stats!.n,
      marks: stats!.marks,
      autoOnly: w.kind === 'exercise' && stats!.manual === 0,
    },
    students: students.map((s) => ({ ...s, copies: count.get(s.id) ?? 0 })),
    timeZone: zone,
  };
}

export interface AssignInput {
  worksheetId: unknown;
  studentId: unknown;
  /** 'YYYY-MM-DD' in the teacher's time zone, or empty for "today" (now). */
  visibleOn?: unknown;
  /** Optional due date and time ('HH:MM', default 18:00), in the teacher's time zone. */
  dueOn?: unknown;
  dueTime?: unknown;
  releaseMode?: unknown;
  showAnswers?: unknown;
  /** The teacher ticked "I've checked it suits this student" after a grade or board warning (W-2). */
  confirmMismatch?: unknown;
}

export type AssignResult =
  | { ok: true; assignmentId: string; targetId: string; visibleFrom: Date; scheduled: boolean }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_ready' | 'not_linked' | 'invalid' | 'handwritten_later' }
  | { ok: false; reason: 'dates'; problem: 'past' | 'due_before' | 'bad' }
  | { ok: false; reason: 'mismatch'; grade: boolean; board: boolean };

function readDates(
  input: Pick<AssignInput, 'visibleOn' | 'dueOn' | 'dueTime'>,
  zone: string,
  now: Date,
): { visibleFrom: Date; dueAt: Date | null } | { problem: 'past' | 'due_before' | 'bad' } {
  const visibleOn = line(input.visibleOn);
  let visibleFrom = now;
  if (visibleOn) {
    const v = wallTimeToUtc(visibleOn, '00:00', zone);
    if (!v) return { problem: 'bad' };
    // A date before today (in the teacher's zone) is refused; today means now.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(now);
    if (visibleOn < today) return { problem: 'past' };
    visibleFrom = visibleOn === today ? now : v;
  }
  const dueOn = line(input.dueOn);
  let dueAt: Date | null = null;
  if (dueOn) {
    dueAt = wallTimeToUtc(dueOn, line(input.dueTime) || '18:00', zone);
    if (!dueAt) return { problem: 'bad' };
    if (dueAt < visibleFrom) return { problem: 'due_before' };
  }
  return { visibleFrom, dueAt };
}

/**
 * "Assign" (W3): one frozen copy for one student. Checks, on the server: the teacher is approved
 * and active; the worksheet is theirs and Ready; the student is linked in that subject now (also
 * enforced by the database); a grade or board mismatch needs the teacher's confirmation (W-2);
 * dates are not in the past and the due date is not before the assignment date.
 */
export async function assignWorksheet(
  sql: Sql,
  teacherId: string,
  input: AssignInput,
  now: Date = new Date(),
): Promise<AssignResult> {
  const zone = await teacherZone(sql, teacherId);
  if (!zone) return { ok: false, reason: 'not_allowed' };
  const worksheetId = line(input.worksheetId);
  const studentId = line(input.studentId);
  const w = await ownWorksheet(sql, teacherId, worksheetId);
  if (!w || w.archived_at) return { ok: false, reason: 'not_found' };
  if (w.status !== 'ready') return { ok: false, reason: 'not_ready' };
  // Handwritten work needs parents' page uploads (CR-17 PR 6, migration M4): until then it can
  // be written and kept in the library, not assigned.
  if (w.kind === 'handwritten') return { ok: false, reason: 'handwritten_later' };
  if (!UUID.test(studentId)) return { ok: false, reason: 'not_linked' };
  const releaseMode = line(input.releaseMode) || 'manual';
  if (releaseMode !== 'manual' && releaseMode !== 'on_marking') return { ok: false, reason: 'invalid' };
  const dates = readDates(input, zone, now);
  if ('problem' in dates) return { ok: false, reason: 'dates', problem: dates.problem };

  return sql.begin(async (tx): Promise<AssignResult> => {
    // Checked inside the save, holding the link: a parent ending it now waits for this save, and
    // then the link trigger withdraws the new work (review M1).
    const [student] = await eligibleStudents(tx, teacherId, w.subject, studentId, true);
    if (!student) return { ok: false, reason: 'not_linked' };
    const gradeDiffers = student.grade !== w.grade;
    const boardDiffers = (student.board ?? '') !== w.board;
    if ((gradeDiffers || boardDiffers) && input.confirmMismatch !== true) {
      return { ok: false, reason: 'mismatch', grade: gradeDiffers, board: boardDiffers };
    }
    const qs = await tx<QRow[]>`
      SELECT id, type, prompt, data, answer_key, points, partial_credit, source_page
      FROM worksheet_questions WHERE worksheet_id = ${w.id} ORDER BY position`;
    if (releaseMode === 'on_marking' && (w.kind !== 'exercise' || qs.some((q) => !isAutoMarked(q.type)))) {
      return { ok: false, reason: 'invalid' };
    }
    const [a] = await tx<Array<{ id: string }>>`
      INSERT INTO assignments (teacher_id, worksheet_id, kind, title, grade, board, subject, chapter, topic, difficulty,
                               instructions, visible_from, due_at, release_mode, show_answers, status, published_at,
                               created_at, updated_at)
      VALUES (${teacherId}, ${w.id}, ${w.kind}, ${w.title}, ${w.grade}, ${w.board}, ${w.subject}, ${w.chapter},
              ${w.topic}, ${w.difficulty}, ${w.instructions}, ${dates.visibleFrom}, ${dates.dueAt}, ${releaseMode},
              ${input.showAnswers !== false}, 'published', ${now}, ${now}, ${now})
      RETURNING id`;
    for (const [i, q] of qs.entries()) {
      await tx`
        INSERT INTO questions (assignment_id, position, type, prompt, data, answer_key, points, partial_credit, source_page)
        VALUES (${a!.id}, ${i + 1}, ${q.type}, ${q.prompt}, ${tx.json(q.data as never)},
                ${q.answer_key ? tx.json(q.answer_key as never) : null}, ${q.points}, ${q.partial_credit}, ${q.source_page})`;
    }
    const purgeAfter = addMonths(dates.dueAt ?? dates.visibleFrom, RETENTION_MONTHS);
    const [t] = await tx<Array<{ id: string }>>`
      INSERT INTO assignment_targets (assignment_id, student_id, purge_after, updated_at)
      VALUES (${a!.id}, ${studentId}, ${purgeAfter}, ${now}) RETURNING id`;
    await tx`INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, at)
             VALUES (${t!.id}, NULL, 'assigned', ${teacherId}, ${now})`;
    await writeAudit(
      tx,
      {
        type: 'HOMEWORK_ASSIGNED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: studentId,
        details: { assignmentId: a!.id, worksheetId: w.id, scheduled: dates.visibleFrom > now },
      },
      now,
    );
    // Visible straight away: the notification is created now; otherwise on the first visit on or
    // after the date (W-7).
    if (dates.visibleFrom <= now) await assignedNotifications(tx, t!.id, now);
    return {
      ok: true,
      assignmentId: a!.id,
      targetId: t!.id,
      visibleFrom: dates.visibleFrom,
      scheduled: dates.visibleFrom > now,
    };
  });
}

/** The teacher's own copy, for a student linked to them now in its subject (W-11). */
async function ownTarget(sql: Db, teacherId: string, assignmentId: string) {
  if (!UUID.test(teacherId) || !UUID.test(assignmentId)) return null;
  const [r] = await sql<
    Array<{
      assignment_id: string;
      target_id: string;
      student_id: string;
      status: TargetStatus;
      visible_from: Date;
      subject: string;
    }>
  >`
    SELECT a.id AS assignment_id, t.id AS target_id, t.student_id, t.status, a.visible_from, a.subject
    FROM assignments a JOIN assignment_targets t ON t.assignment_id = a.id
    WHERE a.id = ${assignmentId} AND a.teacher_id = ${teacherId} AND a.status = 'published'
      AND EXISTS (SELECT 1 FROM teacher_student_links l WHERE l.teacher_id = a.teacher_id AND l.student_id = t.student_id
                  AND l.status = 'active' AND a.subject = ANY (l.subjects))
    FOR UPDATE OF a, t`;
  return r ?? null;
}

export type Simple =
  { ok: true } | { ok: false; reason: 'not_found' | 'not_allowed' | 'visible' | 'invalid' | 'closed' };

/** W-10: the date of work that is still hidden can change; once visible it can't. */
export async function changeAssignmentDates(
  sql: Sql,
  teacherId: string,
  assignmentId: string,
  input: Pick<AssignInput, 'visibleOn' | 'dueOn' | 'dueTime'>,
  now: Date = new Date(),
): Promise<Simple | { ok: false; reason: 'dates'; problem: 'past' | 'due_before' | 'bad' }> {
  const zone = await teacherZone(sql, teacherId);
  if (!zone) return { ok: false, reason: 'not_allowed' };
  const dates = readDates(input, zone, now);
  return sql.begin(async (tx) => {
    // Read and locked inside the save (review L1): the work can't become visible, be withdrawn or
    // lose its link between the check and the change.
    const t = await ownTarget(tx, teacherId, assignmentId);
    if (!t || t.status === 'withdrawn') return { ok: false, reason: 'not_found' } as const;
    if (t.visible_from <= now) return { ok: false, reason: 'visible' } as const;
    if ('problem' in dates) return { ok: false, reason: 'dates', problem: dates.problem } as const;
    await tx`UPDATE assignments SET visible_from = ${dates.visibleFrom}, due_at = ${dates.dueAt},
             updated_at = ${now} WHERE id = ${assignmentId}`;
    await tx`UPDATE assignment_targets SET purge_after = ${addMonths(dates.dueAt ?? dates.visibleFrom, RETENTION_MONTHS)}
             WHERE id = ${t.target_id}`;
    await writeAudit(
      tx,
      { type: 'HOMEWORK_DATE_CHANGED', outcome: 'success', actorId: teacherId, details: { assignmentId } },
      now,
    );
    if (dates.visibleFrom <= now) await assignedNotifications(tx, t.target_id, now);
    return { ok: true } as const;
  });
}

/** Withdraw (CR-07 §5): unfinished or not yet reviewed work stops being due; it stays as history. */
export async function withdrawAssignment(
  sql: Sql,
  teacherId: string,
  assignmentId: string,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await teacherZone(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx): Promise<Simple> => {
    const t = await ownTarget(tx, teacherId, assignmentId);
    if (!t) return { ok: false, reason: 'not_found' };
    if (t.status === 'reviewed' || t.status === 'withdrawn') return { ok: false, reason: 'closed' };
    await tx`UPDATE assignment_targets SET status = 'withdrawn', withdrawn_at = ${now} WHERE id = ${t.target_id}`;
    await tx`INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, at)
             VALUES (${t.target_id}, ${t.status}, 'withdrawn', ${teacherId}, ${now})`;
    await writeAudit(
      tx,
      { type: 'HOMEWORK_WITHDRAWN', outcome: 'success', actorId: teacherId, details: { assignmentId } },
      now,
    );
    return { ok: true };
  });
}

// ======================================================================= notifications (W-7)

const studentHref = '/student/homework';
const parentHref = '/parent/homework';

async function studentAndParents(
  tx: Db,
  studentId: string,
): Promise<Array<{ id: string; role: 'student' | 'parent' }>> {
  const rows = await tx<Array<{ id: string; role: 'student' | 'parent' }>>`
    SELECT a.id, a.role FROM accounts a WHERE a.id = ${studentId} AND a.status = 'active'
    UNION ALL
    SELECT p.id, p.role FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
    WHERE g.student_id = ${studentId} AND g.status = 'active' AND p.role = 'parent' AND p.status = 'active'`;
  return [...rows];
}

/** "New homework" for the student and each active parent, once each (event-based key). */
async function assignedNotifications(tx: Db, targetId: string, now: Date): Promise<number> {
  const [r] = await tx<Array<{ student_id: string; title: string; teacher: string; child: string }>>`
    SELECT t.student_id, a.title, ta.display_name AS teacher, c.display_name AS child
    FROM assignment_targets t JOIN assignments a ON a.id = t.assignment_id
    JOIN accounts ta ON ta.id = a.teacher_id JOIN accounts c ON c.id = t.student_id
    WHERE t.id = ${targetId} AND t.status <> 'withdrawn' AND a.status = 'published'`;
  if (!r) return 0;
  let made = 0;
  for (const who of await studentAndParents(tx, r.student_id)) {
    const created = await notify(tx, {
      recipientId: who.id,
      kind: 'update',
      type: 'homework_assigned',
      title:
        who.role === 'student'
          ? `New homework from ${r.teacher}: ${r.title}`
          : `New homework for ${r.child}: ${r.title}`,
      body: who.role === 'student' ? 'Open My homework to start.' : `From ${r.teacher}.`,
      href: who.role === 'student' ? studentHref : parentHref,
      entityType: 'assignment',
      entityId: targetId,
      dedupeKey: `homework_assigned:${targetId}:${who.id}`,
      now,
    });
    if (created) made += 1;
  }
  return made;
}

/**
 * W-7: on a visit by a student or parent (page render or bell refresh), creates the "New
 * homework" notification for work that has become visible since. Only the viewer's own children
 * or self; at most once per person per piece of work. Never notifies at the moment the date
 * arrives: AA Pro has no scheduler for that.
 */
export async function noteVisibleHomework(
  sql: Sql,
  viewer: { id: string; role: string } | null,
  now: Date = new Date(),
): Promise<number> {
  if (!viewer || (viewer.role !== 'student' && viewer.role !== 'parent') || !UUID.test(viewer.id)) return 0;
  const due = await sql<Array<{ id: string }>>`
    SELECT t.id FROM assignment_targets t JOIN assignments a ON a.id = t.assignment_id
    WHERE a.visible_from <= ${now} AND a.status = 'published' AND t.status IN ('assigned', 'in_progress')
      AND (t.student_id = ${viewer.id} OR t.student_id IN (
            SELECT student_id FROM guardian_links WHERE parent_id = ${viewer.id} AND status = 'active'))
      AND NOT EXISTS (SELECT 1 FROM notifications n
                      WHERE n.dedupe_key = 'homework_assigned:' || t.id || ':' || ${viewer.id})
    LIMIT 50`;
  let made = 0;
  for (const t of due) made += await sql.begin((tx) => assignedNotifications(tx, t.id, now));
  return made;
}

// ======================================================================= student (HW5, HW6, HW7)

export interface HomeworkItem {
  targetId: string;
  title: string;
  subject: SubjectId;
  chapter: string | null;
  kind: 'exercise' | 'handwritten';
  teacherName: string;
  status: TargetStatus;
  overdue: boolean;
  late: boolean;
  dueAt: Date | null;
  visibleFrom: Date;
  attempt: number;
  released: boolean;
  /** After release only. */
  score: number | null;
  maxScore: number | null;
  /** Parent list only. */
  childName?: string;
  childId?: string;
}

type ItemRow = {
  target_id: string;
  title: string;
  subject: SubjectId;
  chapter: string | null;
  kind: 'exercise' | 'handwritten';
  teacher_name: string;
  status: TargetStatus;
  due_at: Date | null;
  visible_from: Date;
  revision_count: number;
  released_at: Date | null;
  submitted_late: boolean | null;
  score: string | null;
  max_score: string | null;
  child_name: string;
  child_id: string;
};

const toItem = (r: ItemRow, now: Date, withChild: boolean): HomeworkItem => ({
  targetId: r.target_id,
  title: r.title,
  subject: r.subject,
  chapter: r.chapter,
  kind: r.kind,
  teacherName: r.teacher_name,
  status: r.status,
  overdue: r.due_at !== null && r.due_at < now && (OPEN as readonly string[]).includes(r.status),
  late: r.submitted_late === true,
  dueAt: r.due_at,
  visibleFrom: r.visible_from,
  attempt: r.revision_count + 1,
  released: r.released_at !== null,
  score: r.released_at && r.score !== null ? Number(r.score) : null,
  maxScore: r.released_at && r.max_score !== null ? Number(r.max_score) : null,
  ...(withChild ? { childName: r.child_name, childId: r.child_id } : {}),
});

const ITEM_SELECT = (sql: Db) => sql`
  SELECT t.id AS target_id, a.title, a.subject, a.chapter, a.kind, ta.display_name AS teacher_name, t.status,
         a.due_at, a.visible_from, t.revision_count, t.released_at, t.submitted_late, t.score, t.max_score,
         c.display_name AS child_name, c.id AS child_id, a.instructions, t.feedback, a.show_answers,
         a.id AS assignment_id
  FROM assignment_targets t JOIN assignments a ON a.id = t.assignment_id
  JOIN accounts ta ON ta.id = a.teacher_id JOIN accounts c ON c.id = t.student_id`;

/** "My homework" (HW5): only this student's work whose date has arrived. */
export async function listHomeworkForStudent(
  sql: Sql,
  studentId: string,
  now: Date = new Date(),
): Promise<HomeworkItem[]> {
  if (!UUID.test(studentId)) return [];
  const rows = await sql<ItemRow[]>`
    ${ITEM_SELECT(sql)}
    WHERE t.student_id = ${studentId} AND a.visible_from <= ${now} AND a.status = 'published'
      AND EXISTS (SELECT 1 FROM accounts s WHERE s.id = ${studentId} AND s.role = 'student' AND s.status = 'active')
    ORDER BY (t.status IN ('assigned', 'in_progress', 'revision_required')) DESC, a.due_at NULLS LAST, a.visible_from DESC`;
  return rows.map((r) => toItem(r, now, false));
}

/** Homework (HW8): every own child's visible work. Marks only after release. */
export async function listHomeworkForParent(
  sql: Sql,
  parentId: string,
  now: Date = new Date(),
): Promise<HomeworkItem[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await sql<ItemRow[]>`
    ${ITEM_SELECT(sql)}
    WHERE a.visible_from <= ${now} AND a.status = 'published' AND t.student_id IN (
      SELECT g.student_id FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
      WHERE g.parent_id = ${parentId} AND g.status = 'active' AND p.role = 'parent' AND p.status = 'active')
    ORDER BY c.display_name, (t.status IN ('assigned', 'in_progress', 'revision_required')) DESC,
             a.due_at NULLS LAST, a.visible_from DESC`;
  return rows.map((r) => toItem(r, now, true));
}

export interface PlayerQuestion extends StudentQuestion {
  index: number;
  answer: Response | null;
  /** After release only. */
  marks?: number | null;
  correct?: string | null;
  comment?: string | null;
}

export interface StudentHomework extends HomeworkItem {
  instructions: string;
  canAnswer: boolean;
  questions: PlayerQuestion[];
  feedback: string | null;
  revisionNote: string | null;
  showAnswers: boolean;
}

/** One piece of the student's own homework (HW6, HW7). Never contains the answer key before release. */
export async function getHomeworkForStudent(
  sql: Sql,
  studentId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<StudentHomework | null> {
  if (!UUID.test(studentId) || !UUID.test(targetId)) return null;
  const [r] = await sql<
    Array<ItemRow & { instructions: string; feedback: string | null; show_answers: boolean; assignment_id: string }>
  >`
    ${ITEM_SELECT(sql)}
    WHERE t.id = ${targetId} AND t.student_id = ${studentId} AND a.visible_from <= ${now} AND a.status = 'published'
      AND c.role = 'student' AND c.status = 'active'`;
  if (!r) return null;
  const item = toItem(r, now, false);
  const attempt = r.revision_count + 1;
  const qs = await sql<QRow[]>`
    SELECT id, type, prompt, data, answer_key, points, partial_credit, source_page
    FROM questions WHERE assignment_id = ${r.assignment_id} ORDER BY position`;
  const answers = await sql<
    Array<{
      question_id: string;
      response: Response;
      auto_points: string | null;
      teacher_points: string | null;
      teacher_comment: string | null;
    }>
  >`
    SELECT question_id, response, auto_points, teacher_points, teacher_comment
    FROM answers WHERE target_id = ${targetId} AND attempt = ${attempt}`;
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  const released = r.released_at !== null;
  const [note] = await sql<Array<{ note: string | null }>>`
    SELECT note FROM assignment_events WHERE target_id = ${targetId} AND to_status = 'revision_required'
    ORDER BY at DESC LIMIT 1`;
  return {
    ...item,
    instructions: r.instructions,
    canAnswer: r.kind === 'exercise' && (OPEN as readonly string[]).includes(r.status),
    feedback: released ? r.feedback : null,
    revisionNote: r.status === 'revision_required' ? (note?.note ?? null) : null,
    showAnswers: released && r.show_answers,
    questions: qs.map((q, i) => {
      const a = byQ.get(q.id);
      const view: PlayerQuestion = { ...studentView(toStored(q), q.id), index: i, answer: a?.response ?? null };
      if (released) {
        const pts = a?.teacher_points ?? a?.auto_points ?? null;
        view.marks = pts === null ? null : Number(pts);
        view.comment = a?.teacher_comment ?? null;
        view.correct = r.show_answers ? correctAnswerText(toStored(q)) : null;
      }
      return view;
    }),
  };
}

async function studentTarget(tx: Db, studentId: string, targetId: string, now: Date) {
  if (!UUID.test(studentId) || !UUID.test(targetId)) return null;
  const [t] = await tx<
    Array<{
      id: string;
      status: TargetStatus;
      revision_count: number;
      assignment_id: string;
      kind: string;
      due_at: Date | null;
      release_mode: string;
      teacher_id: string;
      title: string;
    }>
  >`
    SELECT t.id, t.status, t.revision_count, t.assignment_id, a.kind, a.due_at, a.release_mode, a.teacher_id, a.title
    FROM assignment_targets t JOIN assignments a ON a.id = t.assignment_id
    JOIN accounts s ON s.id = t.student_id AND s.role = 'student' AND s.status = 'active'
    WHERE t.id = ${targetId} AND t.student_id = ${studentId} AND a.visible_from <= ${now} AND a.status = 'published'
    FOR UPDATE OF t`;
  return t ?? null;
}

/** Saves as you go (HW6): only the student's own open exercise; the first save starts it. */
export async function saveAnswers(
  sql: Sql,
  studentId: string,
  targetId: string,
  answers: unknown,
  now: Date = new Date(),
): Promise<Simple> {
  if (!Array.isArray(answers) || answers.length > 100) return { ok: false, reason: 'invalid' };
  return sql.begin(async (tx): Promise<Simple> => {
    const t = await studentTarget(tx, studentId, targetId, now);
    if (!t) return { ok: false, reason: 'not_found' };
    if (t.kind !== 'exercise' || !(OPEN as readonly string[]).includes(t.status))
      return { ok: false, reason: 'closed' };
    const qs = await tx<QRow[]>`SELECT id, type, prompt, data, answer_key, points, partial_credit, source_page
                                FROM questions WHERE assignment_id = ${t.assignment_id} ORDER BY position`;
    const cleaned: Array<{ id: string; r: Response }> = [];
    for (const [i, raw] of answers.entries()) {
      if (raw === null || raw === undefined) continue;
      const q = qs[i];
      if (!q) return { ok: false, reason: 'invalid' };
      const r = cleanResponse(toStored(q), raw);
      if (!r) return { ok: false, reason: 'invalid' };
      cleaned.push({ id: q.id, r });
    }
    const attempt = t.revision_count + 1;
    for (const c of cleaned) {
      await tx`
        INSERT INTO answers (target_id, question_id, attempt, response, saved_at)
        VALUES (${t.id}, ${c.id}, ${attempt}, ${tx.json(c.r as never)}, ${now})
        ON CONFLICT (target_id, question_id, attempt) DO UPDATE SET response = EXCLUDED.response, saved_at = EXCLUDED.saved_at`;
    }
    if (t.status !== 'in_progress') {
      await tx`UPDATE assignment_targets SET status = 'in_progress', started_at = coalesce(started_at, ${now}) WHERE id = ${t.id}`;
      await tx`INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, at)
               VALUES (${t.id}, ${t.status}, 'in_progress', ${studentId}, ${now})`;
    }
    return { ok: true };
  });
}

export type SubmitResult =
  | { ok: true; status: 'submitted' | 'reviewed'; late: boolean }
  | { ok: false; reason: 'not_found' | 'closed' | 'incomplete'; missing?: number[] };

/**
 * Submit (HW6, H-N1): needs every question answered; final unless the teacher asks for a
 * revision. Automatic marks are worked out now. With no question for the teacher to mark, the
 * work is Reviewed straight away and, if the teacher chose "as soon as marked", released.
 */
export async function submitExercise(
  sql: Sql,
  studentId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<SubmitResult> {
  return sql.begin(async (tx): Promise<SubmitResult> => {
    const t = await studentTarget(tx, studentId, targetId, now);
    if (!t) return { ok: false, reason: 'not_found' };
    if (t.kind !== 'exercise' || !(OPEN as readonly string[]).includes(t.status))
      return { ok: false, reason: 'closed' };
    const attempt = t.revision_count + 1;
    const qs = await tx<QRow[]>`SELECT id, type, prompt, data, answer_key, points, partial_credit, source_page
                                FROM questions WHERE assignment_id = ${t.assignment_id} ORDER BY position`;
    const answers = await tx<Array<{ question_id: string; response: Response }>>`
      SELECT question_id, response FROM answers WHERE target_id = ${t.id} AND attempt = ${attempt}`;
    const byQ = new Map(answers.map((a) => [a.question_id, a.response]));
    const missing = qs.map((q, i) => (isAnswered(q.type, byQ.get(q.id)) ? -1 : i)).filter((i) => i >= 0);
    if (missing.length) return { ok: false, reason: 'incomplete', missing };

    let auto = 0;
    let manual = false;
    for (const q of qs) {
      const pts = autoMark(toStored(q), byQ.get(q.id) ?? null);
      if (pts === null) manual = true;
      else auto += pts;
      await tx`UPDATE answers SET auto_points = ${pts} WHERE target_id = ${t.id} AND question_id = ${q.id} AND attempt = ${attempt}`;
    }
    const max = qs.reduce((s, q) => s + q.points, 0);
    const late = t.due_at !== null && now > t.due_at;
    const reviewed = !manual;
    const release = reviewed && t.release_mode === 'on_marking';
    await tx`
      UPDATE assignment_targets SET status = 'submitted', submitted_at = ${now}, submitted_late = ${late},
        due_at_when_submitted = ${t.due_at}, max_score = ${max}, score = ${reviewed ? auto : null},
        purge_after = ${addMonths(now, RETENTION_MONTHS)}
      WHERE id = ${t.id}`;
    await tx`INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, at)
             VALUES (${t.id}, ${t.status}, 'submitted', ${studentId}, ${now})`;
    if (reviewed) {
      await tx`UPDATE assignment_targets SET status = 'reviewed', reviewed_at = ${now},
               released_at = ${release ? now : null} WHERE id = ${t.id}`;
      await tx`INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, at, note)
               VALUES (${t.id}, 'submitted', 'reviewed', NULL, ${now}, 'Marked automatically')`;
    }
    await writeAudit(
      tx,
      {
        type: 'HOMEWORK_SUBMITTED',
        outcome: 'success',
        actorId: studentId,
        details: { targetId: t.id, late, attempt },
      },
      now,
    );
    // The teacher's notification never names the child (CR-16 content rules).
    await notify(tx, {
      recipientId: t.teacher_id,
      kind: 'update',
      type: 'homework_submitted',
      title: `Homework handed in: ${t.title}`,
      body: reviewed ? 'Marked automatically. Open Homework to see it.' : 'Waiting for you to mark it.',
      href: '/teacher/homework/review',
      entityType: 'assignment',
      entityId: t.id,
      dedupeKey: `homework_submitted:${t.id}:${attempt}`,
      now,
    });
    if (release) await releasedNotifications(tx, t.id, now);
    return { ok: true, status: reviewed ? 'reviewed' : 'submitted', late };
  });
}

async function releasedNotifications(tx: Db, targetId: string, now: Date): Promise<void> {
  const [r] = await tx<Array<{ student_id: string; title: string; child: string; released_at: Date }>>`
    SELECT t.student_id, a.title, c.display_name AS child, t.released_at
    FROM assignment_targets t JOIN assignments a ON a.id = t.assignment_id JOIN accounts c ON c.id = t.student_id
    WHERE t.id = ${targetId}`;
  if (!r) return;
  for (const who of await studentAndParents(tx, r.student_id)) {
    await notify(tx, {
      recipientId: who.id,
      kind: 'update',
      type: 'homework_marked',
      title: who.role === 'student' ? `Your marks are ready: ${r.title}` : `${r.child}’s marks are ready: ${r.title}`,
      href: who.role === 'student' ? studentHref : parentHref,
      entityType: 'assignment',
      entityId: targetId,
      dedupeKey: `homework_marked:${targetId}:${r.released_at.toISOString()}:${who.id}`,
      now,
    });
  }
}

// ======================================================================= teacher: review (HW4) and results (W4)

export interface ReviewItem {
  targetId: string;
  assignmentId: string;
  title: string;
  subject: SubjectId;
  chapter: string | null;
  kind: 'exercise' | 'handwritten';
  studentId: string;
  studentName: string;
  status: TargetStatus;
  late: boolean;
  overdue: boolean;
  dueAt: Date | null;
  visibleFrom: Date;
  submittedAt: Date | null;
  attempt: number;
  score: number | null;
  maxScore: number | null;
  released: boolean;
  releaseMode: 'manual' | 'on_marking';
}

type ReviewRow = {
  target_id: string;
  assignment_id: string;
  title: string;
  subject: SubjectId;
  chapter: string | null;
  kind: 'exercise' | 'handwritten';
  student_id: string;
  student_name: string;
  status: TargetStatus;
  submitted_late: boolean | null;
  due_at: Date | null;
  visible_from: Date;
  submitted_at: Date | null;
  revision_count: number;
  score: string | null;
  max_score: string | null;
  released_at: Date | null;
  release_mode: 'manual' | 'on_marking';
};

const toReview = (r: ReviewRow, now: Date): ReviewItem => ({
  targetId: r.target_id,
  assignmentId: r.assignment_id,
  title: r.title,
  subject: r.subject,
  chapter: r.chapter,
  kind: r.kind,
  studentId: r.student_id,
  studentName: r.student_name,
  status: r.status,
  late: r.submitted_late === true,
  overdue: r.due_at !== null && r.due_at < now && (OPEN as readonly string[]).includes(r.status),
  dueAt: r.due_at,
  visibleFrom: r.visible_from,
  submittedAt: r.submitted_at,
  attempt: r.revision_count + 1,
  score: r.score === null ? null : Number(r.score),
  maxScore: r.max_score === null ? null : Number(r.max_score),
  released: r.released_at !== null,
  releaseMode: r.release_mode,
});

/** The teacher's own homework, limited to students linked to them now in that subject (W-11). */
const TEACHER_ROWS = (sql: Db, teacherId: string) => sql`
  SELECT t.id AS target_id, a.id AS assignment_id, a.title, a.subject, a.chapter, a.kind, t.student_id,
         c.display_name AS student_name, t.status, t.submitted_late, a.due_at, a.visible_from, t.submitted_at,
         t.revision_count, t.score, t.max_score, t.released_at, a.release_mode
  FROM assignments a JOIN assignment_targets t ON t.assignment_id = a.id JOIN accounts c ON c.id = t.student_id
  WHERE a.teacher_id = ${teacherId} AND a.status = 'published'
    AND EXISTS (SELECT 1 FROM teacher_student_links l WHERE l.teacher_id = a.teacher_id AND l.student_id = t.student_id
                AND l.status = 'active' AND a.subject = ANY (l.subjects))`;

/** "To review" (HW4): submitted and under review first, then overdue; and scheduled work. */
export async function listTeacherHomework(sql: Sql, teacherId: string, now: Date = new Date()): Promise<ReviewItem[]> {
  if (!(await teacherZone(sql, teacherId))) return [];
  const rows = await sql<ReviewRow[]>`
    ${TEACHER_ROWS(sql, teacherId)}
    ORDER BY (t.status IN ('submitted', 'under_review')) DESC, t.submitted_at NULLS LAST, a.due_at NULLS LAST,
             a.created_at DESC
    LIMIT 300`;
  return rows.map((r) => toReview(r, now));
}

/** Results tab (W4): one linked student's work from this teacher, by subject and chapter. */
export async function studentResults(
  sql: Sql,
  teacherId: string,
  studentId: string,
  now: Date = new Date(),
): Promise<ReviewItem[] | null> {
  if (!(await teacherZone(sql, teacherId)) || !UUID.test(studentId)) return null;
  const [linked] = await sql`SELECT 1 FROM teacher_student_links WHERE teacher_id = ${teacherId}
                             AND student_id = ${studentId} AND status = 'active'`;
  if (!linked) return null;
  const rows = await sql<ReviewRow[]>`
    ${TEACHER_ROWS(sql, teacherId)} AND t.student_id = ${studentId} AND t.status <> 'withdrawn'
    ORDER BY a.subject, a.chapter NULLS LAST, a.visible_from DESC`;
  return rows.map((r) => toReview(r, now));
}

export interface ReviewQuestion {
  index: number;
  type: QuestionType;
  prompt: string;
  points: number;
  correct: string | null;
  answerText: string;
  autoPoints: number | null;
  teacherPoints: number | null;
  comment: string | null;
}

export interface ReviewDetail extends ReviewItem {
  questions: ReviewQuestion[];
  feedback: string | null;
  showAnswers: boolean;
}

function answerText(q: StoredQuestion, r: Response | undefined): string {
  if (!r || !isAnswered(q.type, r)) return 'Not answered';
  const opts = Array.isArray(q.data.options) ? (q.data.options as string[]) : [];
  switch (q.type) {
    case 'single_choice':
      return opts[r.choice as number] ?? '';
    case 'multi_select':
      return (r.choices as number[]).map((i) => opts[i]).join(', ');
    case 'true_false':
      return r.value ? 'True' : 'False';
    case 'fill_blank':
      return (r.blanks as string[]).map((b) => b || '—').join('; ');
    case 'matching': {
      const left = Array.isArray(q.data.left) ? (q.data.left as string[]) : [];
      return left.map((l, i) => `${l} → ${(r.choices as Array<string | null>)[i] ?? '—'}`).join('; ');
    }
    case 'short_answer':
      return r.text as string;
  }
}

/** One copy for marking (HW4). Only the teacher's own, for a student linked to them now. */
export async function getForReview(
  sql: Sql,
  teacherId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<ReviewDetail | null> {
  if (!(await teacherZone(sql, teacherId)) || !UUID.test(targetId)) return null;
  const [r] = await sql<Array<ReviewRow & { feedback: string | null; show_answers: boolean }>>`
    SELECT x.*, t.feedback, a.show_answers FROM (${TEACHER_ROWS(sql, teacherId)}) x
    JOIN assignment_targets t ON t.id = x.target_id JOIN assignments a ON a.id = x.assignment_id
    WHERE x.target_id = ${targetId}`;
  if (!r) return null;
  const attempt = r.revision_count + 1;
  const qs = await sql<QRow[]>`SELECT id, type, prompt, data, answer_key, points, partial_credit, source_page
                               FROM questions WHERE assignment_id = ${r.assignment_id} ORDER BY position`;
  const answers = await sql<
    Array<{
      question_id: string;
      response: Response;
      auto_points: string | null;
      teacher_points: string | null;
      teacher_comment: string | null;
    }>
  >`
    SELECT question_id, response, auto_points, teacher_points, teacher_comment
    FROM answers WHERE target_id = ${targetId} AND attempt = ${attempt}`;
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  return {
    ...toReview(r, now),
    feedback: r.feedback,
    showAnswers: r.show_answers,
    questions: qs.map((q, i) => {
      const s = toStored(q);
      const a = byQ.get(q.id);
      return {
        index: i,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        correct: correctAnswerText(s),
        answerText: answerText(s, a?.response),
        autoPoints: a?.auto_points == null ? null : Number(a.auto_points),
        teacherPoints: a?.teacher_points == null ? null : Number(a.teacher_points),
        comment: a?.teacher_comment ?? null,
      };
    }),
  };
}

export interface ReviewInput {
  /** Marks per question (null keeps the automatic mark; required for short answers). */
  marks: unknown;
  comments?: unknown;
  feedback?: unknown;
  outcome: unknown;
  /** Revision note (outcome "revision"). */
  note?: unknown;
  release?: unknown;
}

export type ReviewResult =
  | { ok: true; status: 'reviewed' | 'revision_required'; released: boolean }
  | { ok: false; reason: 'not_found' | 'not_allowed' | 'closed' | 'invalid' | 'marks' };

/**
 * Save marks and feedback (HW4; FR-022.6 to FR-022.8): every mark can be overridden; short
 * answers need a mark. Outcome Reviewed (optionally released now) or Revision required with a
 * note (a new attempt; the earlier one is kept).
 */
export async function saveReview(
  sql: Sql,
  teacherId: string,
  targetId: string,
  input: ReviewInput,
  now: Date = new Date(),
): Promise<ReviewResult> {
  if (!(await teacherZone(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  const outcome = input.outcome === 'revision' ? 'revision' : input.outcome === 'reviewed' ? 'reviewed' : null;
  if (!outcome || !Array.isArray(input.marks)) return { ok: false, reason: 'invalid' };
  const feedback = para(input.feedback);
  const note = para(input.note);
  if (feedback.length > 4000 || note.length > 500 || (outcome === 'revision' && !note))
    return { ok: false, reason: 'invalid' };
  const comments = Array.isArray(input.comments) ? input.comments.map(para) : [];
  if (comments.some((c) => c.length > 1000)) return { ok: false, reason: 'invalid' };

  return sql.begin(async (tx): Promise<ReviewResult> => {
    const [r] = await tx<
      ReviewRow[]
    >`${TEACHER_ROWS(tx, teacherId)} AND t.id = ${UUID.test(targetId) ? targetId : null} FOR UPDATE OF t`;
    if (!r) return { ok: false, reason: 'not_found' };
    if (!['submitted', 'under_review', 'reviewed'].includes(r.status)) return { ok: false, reason: 'closed' };
    // Released marks are final (review M2): no new marks and no request for another attempt.
    if (r.status === 'reviewed' && r.released_at) return { ok: false, reason: 'closed' };
    // At most 20 further attempts (the database limit): the 21st request is refused (review L4).
    if (outcome === 'revision' && r.revision_count >= 20) return { ok: false, reason: 'closed' };
    const attempt = r.revision_count + 1;
    const qs = await tx<Array<{ id: string; type: QuestionType; points: number }>>`
      SELECT id, type, points FROM questions WHERE assignment_id = ${r.assignment_id} ORDER BY position`;
    const marks = input.marks as unknown[];
    if (marks.length !== qs.length) return { ok: false, reason: 'invalid' };
    const answers = await tx<Array<{ question_id: string; auto_points: string | null }>>`
      SELECT question_id, auto_points FROM answers WHERE target_id = ${r.target_id} AND attempt = ${attempt}`;
    const autoOf = new Map(answers.map((a) => [a.question_id, a.auto_points === null ? null : Number(a.auto_points)]));
    let total = 0;
    for (const [i, q] of qs.entries()) {
      const raw = marks[i];
      const given = raw === null || raw === undefined || raw === '' ? null : Number(raw);
      if (
        given !== null &&
        (!Number.isFinite(given) || given < 0 || given > q.points || Math.round(given * 100) !== given * 100)
      ) {
        return { ok: false, reason: 'marks' };
      }
      const auto = autoOf.get(q.id) ?? null;
      if (given === null && auto === null && outcome === 'reviewed') return { ok: false, reason: 'marks' };
      total += given ?? auto ?? 0;
      // Every question has an answer row: submitting needs every question answered.
      await tx`UPDATE answers SET teacher_points = ${given}, teacher_comment = ${comments[i] || null}
               WHERE target_id = ${r.target_id} AND question_id = ${q.id} AND attempt = ${attempt}`;
    }
    const from = r.status;
    if (from === 'submitted') {
      await tx`UPDATE assignment_targets SET status = 'under_review' WHERE id = ${r.target_id}`;
      await tx`INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, at)
               VALUES (${r.target_id}, 'submitted', 'under_review', ${teacherId}, ${now})`;
    }
    const release = outcome === 'reviewed' && input.release === true;
    if (outcome === 'reviewed') {
      if (from !== 'reviewed') {
        await tx`INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, at)
                 VALUES (${r.target_id}, 'under_review', 'reviewed', ${teacherId}, ${now})`;
      }
      await tx`UPDATE assignment_targets SET status = 'reviewed', reviewed_at = ${now}, score = ${Math.round(total * 100) / 100},
               feedback = ${feedback || null}, released_at = ${release ? now : null} WHERE id = ${r.target_id}`;
    } else {
      await tx`UPDATE assignment_targets SET status = 'revision_required', revision_count = revision_count + 1,
               feedback = ${feedback || null}, released_at = NULL WHERE id = ${r.target_id}`;
      await tx`INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, at, note)
               VALUES (${r.target_id}, ${from === 'submitted' ? 'under_review' : from}, 'revision_required', ${teacherId}, ${now}, ${note})`;
      for (const who of await studentAndParents(tx, r.student_id)) {
        await notify(tx, {
          recipientId: who.id,
          kind: 'update',
          type: 'homework_revision',
          title:
            who.role === 'student'
              ? `Please have another go: ${r.title}`
              : `${r.student_name} has changes to make: ${r.title}`,
          href: who.role === 'student' ? studentHref : parentHref,
          entityType: 'assignment',
          entityId: r.target_id,
          dedupeKey: `homework_revision:${r.target_id}:${attempt}:${who.id}`,
          now,
        });
      }
    }
    await writeAudit(
      tx,
      {
        type: outcome === 'reviewed' ? 'HOMEWORK_REVIEWED' : 'HOMEWORK_REVISION_REQUESTED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: r.student_id,
        details: { targetId: r.target_id, released: release },
      },
      now,
    );
    if (release) await releasedNotifications(tx, r.target_id, now);
    return { ok: true, status: outcome === 'reviewed' ? 'reviewed' : 'revision_required', released: release };
  });
}

/** "Release" (FR-022.8): marks and feedback become visible to the student and parent. */
export async function releaseResults(
  sql: Sql,
  teacherId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await teacherZone(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx): Promise<Simple> => {
    const [r] = await tx<
      ReviewRow[]
    >`${TEACHER_ROWS(tx, teacherId)} AND t.id = ${UUID.test(targetId) ? targetId : null} FOR UPDATE OF t`;
    if (!r) return { ok: false, reason: 'not_found' };
    if (r.status !== 'reviewed' || r.released_at) return { ok: false, reason: 'closed' };
    await tx`UPDATE assignment_targets SET released_at = ${now} WHERE id = ${r.target_id}`;
    await writeAudit(
      tx,
      { type: 'HOMEWORK_RELEASED', outcome: 'success', actorId: teacherId, details: { targetId: r.target_id } },
      now,
    );
    await releasedNotifications(tx, r.target_id, now);
    return { ok: true };
  });
}

export type { Tx };
