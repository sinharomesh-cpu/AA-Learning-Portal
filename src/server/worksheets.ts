import 'server-only';
import { SUBJECT_IDS, type SubjectId } from '@/fixtures/subjects';
import { CURRICULA_LIST } from '@/lib/curricula';
import {
  type QuestionDraft,
  type QuestionProblem,
  type StoredQuestion,
  type StudentQuestion,
  LIMITS,
  studentView,
  toDraft,
  toStored,
  totalPoints,
} from '@/lib/worksheetQuestions';
import { writeAudit } from './auth/audit';
import type { Db, Sql, Tx } from './db/client';
import { shareOptions } from './teacherResources';

/**
 * The Human Teacher's worksheet library (CR-17 PR 4; boards W1 and W2; owner decisions OC-127 to
 * OC-129). A worksheet belongs to one approved, active teacher and is never shown to a student or
 * parent: students only ever get a frozen copy made when the teacher assigns it (PR 5). Nobody
 * else sees a library, not other teachers and not Admins or the Super Admin (OC-90 Q-8).
 * Every question is written by the teacher; the question plan only makes empty questions. No AI.
 * The teacher always comes from the session; ids from the browser are checked here, and a refusal
 * looks the same as "not found".
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isSubject = (s: string): s is SubjectId => (SUBJECT_IDS as readonly string[]).includes(s);
const line = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const para = (s: unknown) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').trim() : '');
const optInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) ? n : NaN;
};

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type WorksheetKind = 'exercise' | 'handwritten';

async function activeTeacher(sql: Db, teacherId: string): Promise<SubjectId[] | null> {
  if (!UUID.test(teacherId)) return null;
  const [row] = await sql<Array<{ ok: boolean; subjects: string[] }>>`
    SELECT (a.role = 'teacher' AND a.status = 'active' AND t.approval_status = 'approved') AS ok, t.subjects
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id WHERE a.id = ${teacherId}`;
  if (row?.ok !== true) return null;
  return SUBJECT_IDS.filter((s) => row.subjects.includes(s));
}

export interface WorksheetDetails {
  kind: WorksheetKind;
  title: string;
  grade: number;
  board: string;
  subject: SubjectId;
  chapter: string | null;
  topic: string | null;
  difficulty: Difficulty | null;
  instructions: string;
  sourceResourceId: string | null;
  sourceFromPage: number | null;
  sourceToPage: number | null;
}

export type DetailsField =
  'kind' | 'title' | 'grade' | 'board' | 'subject' | 'chapter' | 'topic' | 'difficulty' | 'instructions' | 'source';

/** Checks the details form. Returns the cleaned details, or the fields that need fixing. */
export function checkDetails(
  raw: Record<string, unknown>,
): { ok: true; value: WorksheetDetails } | { ok: false; fields: DetailsField[] } {
  const fields: DetailsField[] = [];
  const kind = raw.kind === 'handwritten' ? 'handwritten' : raw.kind === 'exercise' ? 'exercise' : null;
  const title = line(raw.title);
  const grade = optInt(raw.grade);
  const board = line(raw.board);
  const subject = line(raw.subject);
  const chapter = line(raw.chapter);
  const topic = line(raw.topic);
  const difficulty = line(raw.difficulty);
  const instructions = para(raw.instructions);
  const sourceResourceId = line(raw.sourceResourceId);
  const from = optInt(raw.sourceFromPage);
  const to = optInt(raw.sourceToPage);
  if (!kind) fields.push('kind');
  if (title.length < 1 || title.length > 120) fields.push('title');
  if (typeof grade !== 'number' || !(grade >= 1 && grade <= 12)) fields.push('grade');
  if (!(CURRICULA_LIST as readonly string[]).includes(board)) fields.push('board');
  if (!isSubject(subject)) fields.push('subject');
  if (chapter.length > 120) fields.push('chapter');
  if (topic.length > 120) fields.push('topic');
  if (difficulty && !(DIFFICULTIES as readonly string[]).includes(difficulty)) fields.push('difficulty');
  if (instructions.length > 4000) fields.push('instructions');
  const pageOk = (p: number | null) => p === null || (Number.isInteger(p) && p >= 1 && p <= LIMITS.sourcePage);
  if (
    (sourceResourceId && !UUID.test(sourceResourceId)) ||
    !pageOk(from) ||
    !pageOk(to) ||
    (to !== null && (from === null || to < from)) ||
    (from !== null && !sourceResourceId)
  ) {
    fields.push('source');
  }
  if (fields.length) return { ok: false, fields };
  return {
    ok: true,
    value: {
      kind: kind!,
      title,
      grade: grade as number,
      board,
      subject: subject as SubjectId,
      chapter: chapter || null,
      topic: topic || null,
      difficulty: (difficulty || null) as Difficulty | null,
      instructions,
      sourceResourceId: sourceResourceId || null,
      sourceFromPage: from as number | null,
      sourceToPage: to as number | null,
    },
  };
}

export type SaveResult =
  | { ok: true; id: string; status: 'draft' | 'ready' }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'invalid' }
  | { ok: false; reason: 'details'; fields: DetailsField[] }
  | { ok: false; reason: 'not_ready'; empty: boolean; problems: Array<{ index: number; problems: QuestionProblem[] }> };

export interface SaveInput {
  /** Absent for a new worksheet. */
  id?: unknown;
  details: Record<string, unknown>;
  questions: unknown;
  /** Mark ready (W2) rather than save as a draft. */
  ready: boolean;
}

/**
 * Saves a worksheet from the builder (W2): a new one, or changes to the teacher's own. Questions
 * are replaced as a whole. A draft may have empty questions; "Mark ready" needs a complete
 * worksheet (the database checks this again at commit). Copies already given to students never
 * change: they are separate records (frozen when assigned).
 */
export async function saveWorksheet(
  sql: Sql,
  teacherId: string,
  input: SaveInput,
  now: Date = new Date(),
): Promise<SaveResult> {
  const subjects = await activeTeacher(sql, teacherId);
  if (!subjects) return { ok: false, reason: 'not_allowed' };
  const id = input.id === undefined || input.id === null || input.id === '' ? null : line(input.id);
  if (id !== null && !UUID.test(id)) return { ok: false, reason: 'not_found' };
  const checked = checkDetails(input.details ?? {});
  if (!checked.ok) return { ok: false, reason: 'details', fields: checked.fields };
  const d = checked.value;
  if (!subjects.includes(d.subject)) return { ok: false, reason: 'details', fields: ['subject'] };
  if (!Array.isArray(input.questions) || input.questions.length > LIMITS.questions)
    return { ok: false, reason: 'invalid' };

  const stored: StoredQuestion[] = [];
  const problems: Array<{ index: number; problems: QuestionProblem[] }> = [];
  for (const [index, raw] of input.questions.entries()) {
    const r = toStored(raw);
    if (!r) return { ok: false, reason: 'invalid' };
    stored.push(r.question);
    if (r.problems.length) problems.push({ index, problems: r.problems });
  }
  if (d.kind === 'handwritten' && stored.length) return { ok: false, reason: 'invalid' };
  if (input.ready && (problems.length || (d.kind === 'exercise' && stored.length === 0))) {
    return { ok: false, reason: 'not_ready', empty: d.kind === 'exercise' && stored.length === 0, problems };
  }

  const status = input.ready ? 'ready' : 'draft';
  return sql.begin(async (tx): Promise<SaveResult> => {
    if (d.sourceResourceId) {
      const [own] = await tx`SELECT 1 FROM teacher_resources
        WHERE id = ${d.sourceResourceId} AND teacher_id = ${teacherId} AND archived_at IS NULL`;
      if (!own) return { ok: false, reason: 'details', fields: ['source'] };
    }
    let worksheetId = id;
    if (worksheetId) {
      const rows = await tx`
        UPDATE worksheets SET kind = ${d.kind}, title = ${d.title}, grade = ${d.grade}, board = ${d.board},
          subject = ${d.subject}, chapter = ${d.chapter}, topic = ${d.topic}, difficulty = ${d.difficulty},
          instructions = ${d.instructions}, source_resource_id = ${d.sourceResourceId},
          source_from_page = ${d.sourceFromPage}, source_to_page = ${d.sourceToPage}, status = ${status}
        WHERE id = ${worksheetId} AND teacher_id = ${teacherId} AND archived_at IS NULL
        RETURNING id`;
      if (rows.length === 0) return { ok: false, reason: 'not_found' };
      await tx`DELETE FROM worksheet_questions WHERE worksheet_id = ${worksheetId}`;
    } else {
      const [row] = await tx<Array<{ id: string }>>`
        INSERT INTO worksheets (teacher_id, kind, title, grade, board, subject, chapter, topic, difficulty, instructions,
                                source_resource_id, source_from_page, source_to_page, status, created_at, updated_at)
        VALUES (${teacherId}, ${d.kind}, ${d.title}, ${d.grade}, ${d.board}, ${d.subject}, ${d.chapter}, ${d.topic},
                ${d.difficulty}, ${d.instructions}, ${d.sourceResourceId}, ${d.sourceFromPage}, ${d.sourceToPage},
                ${status}, ${now}, ${now})
        RETURNING id`;
      worksheetId = row!.id;
    }
    await insertQuestions(tx, worksheetId, stored);
    await writeAudit(
      tx,
      {
        type: id ? 'WORKSHEET_UPDATED' : 'WORKSHEET_CREATED',
        outcome: 'success',
        actorId: teacherId,
        details: { worksheetId, status, questions: stored.length },
      },
      now,
    );
    return { ok: true, id: worksheetId, status };
  });
}

async function insertQuestions(tx: Tx, worksheetId: string, qs: StoredQuestion[]): Promise<void> {
  for (const [i, q] of qs.entries()) {
    await tx`
      INSERT INTO worksheet_questions (worksheet_id, position, type, prompt, data, answer_key, points, partial_credit, source_page)
      VALUES (${worksheetId}, ${i + 1}, ${q.type}, ${q.prompt}, ${tx.json(q.data as never)},
              ${q.answerKey ? tx.json(q.answerKey as never) : null}, ${q.points}, ${q.partialCredit}, ${q.sourcePage})`;
  }
}

type QuestionRow = {
  type: StoredQuestion['type'];
  prompt: string;
  data: Record<string, unknown>;
  answer_key: Record<string, unknown> | null;
  points: number;
  partial_credit: boolean;
  source_page: number | null;
};
const fromRow = (r: QuestionRow): StoredQuestion => ({
  type: r.type,
  prompt: r.prompt,
  data: r.data,
  answerKey: r.answer_key,
  points: r.points,
  partialCredit: r.partial_credit,
  sourcePage: r.source_page,
});

async function questionsOf(sql: Db, worksheetId: string): Promise<StoredQuestion[]> {
  const rows = await sql<QuestionRow[]>`
    SELECT type, prompt, data, answer_key, points, partial_credit, source_page
    FROM worksheet_questions WHERE worksheet_id = ${worksheetId} ORDER BY position`;
  return rows.map(fromRow);
}

export interface WorksheetForEdit extends WorksheetDetails {
  id: string;
  status: 'draft' | 'ready';
  archived: boolean;
  updatedAt: Date;
  questions: QuestionDraft[];
}

type WorksheetRow = {
  id: string;
  kind: WorksheetKind;
  title: string;
  grade: number;
  board: string;
  subject: SubjectId;
  chapter: string | null;
  topic: string | null;
  difficulty: Difficulty | null;
  instructions: string;
  source_resource_id: string | null;
  source_from_page: number | null;
  source_to_page: number | null;
  status: 'draft' | 'ready';
  archived_at: Date | null;
  updated_at: Date;
};

async function ownWorksheet(sql: Db, teacherId: string, id: string): Promise<WorksheetRow | null> {
  if (!UUID.test(teacherId) || !UUID.test(id)) return null;
  const [row] = await sql<WorksheetRow[]>`
    SELECT id, kind, title, grade, board, subject, chapter, topic, difficulty, instructions, source_resource_id,
           source_from_page, source_to_page, status, archived_at, updated_at
    FROM worksheets WHERE id = ${id} AND teacher_id = ${teacherId}`;
  return row ?? null;
}

/** The teacher's own worksheet for the builder; null if it is not theirs (or does not exist). */
export async function getWorksheet(sql: Sql, teacherId: string, id: string): Promise<WorksheetForEdit | null> {
  if (!(await activeTeacher(sql, teacherId))) return null;
  const w = await ownWorksheet(sql, teacherId, id);
  if (!w) return null;
  return {
    id: w.id,
    kind: w.kind,
    title: w.title,
    grade: w.grade,
    board: w.board,
    subject: w.subject,
    chapter: w.chapter,
    topic: w.topic,
    difficulty: w.difficulty,
    instructions: w.instructions,
    sourceResourceId: w.source_resource_id,
    sourceFromPage: w.source_from_page,
    sourceToPage: w.source_to_page,
    status: w.status,
    archived: w.archived_at !== null,
    updatedAt: w.updated_at,
    questions: (await questionsOf(sql, w.id)).map(toDraft),
  };
}

type Simple = { ok: true; id?: string } | { ok: false; reason: 'not_found' | 'not_allowed' };

/** "Duplicate" (W1): a new draft copy with the same questions. Nothing is assigned. */
export async function duplicateWorksheet(
  sql: Sql,
  teacherId: string,
  id: string,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeTeacher(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  const w = await ownWorksheet(sql, teacherId, id);
  if (!w) return { ok: false, reason: 'not_found' };
  const title = `Copy of ${w.title}`.slice(0, 120);
  return sql.begin(async (tx): Promise<Simple> => {
    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO worksheets (teacher_id, kind, title, grade, board, subject, chapter, topic, difficulty, instructions,
                              source_resource_id, source_from_page, source_to_page, status, created_at, updated_at)
      SELECT teacher_id, kind, ${title}, grade, board, subject, chapter, topic, difficulty, instructions,
             (SELECT r.id FROM teacher_resources r WHERE r.id = w.source_resource_id AND r.archived_at IS NULL),
             CASE WHEN EXISTS (SELECT 1 FROM teacher_resources r WHERE r.id = w.source_resource_id AND r.archived_at IS NULL)
                  THEN source_from_page END,
             CASE WHEN EXISTS (SELECT 1 FROM teacher_resources r WHERE r.id = w.source_resource_id AND r.archived_at IS NULL)
                  THEN source_to_page END,
             'draft', ${now}, ${now}
      FROM worksheets w WHERE w.id = ${id}
      RETURNING id`;
    await tx`
      INSERT INTO worksheet_questions (worksheet_id, position, type, prompt, data, answer_key, points, partial_credit, source_page)
      SELECT ${row!.id}, position, type, prompt, data, answer_key, points, partial_credit, source_page
      FROM worksheet_questions WHERE worksheet_id = ${id}`;
    await writeAudit(
      tx,
      {
        type: 'WORKSHEET_DUPLICATED',
        outcome: 'success',
        actorId: teacherId,
        details: { from: id, worksheetId: row!.id },
      },
      now,
    );
    return { ok: true, id: row!.id };
  });
}

/**
 * Archive or restore (W1). Archived worksheets can't be edited or assigned; copies already given
 * to students are separate and stay as they are.
 */
export async function setWorksheetArchived(
  sql: Sql,
  teacherId: string,
  id: string,
  archived: boolean,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeTeacher(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  const w = await ownWorksheet(sql, teacherId, id);
  if (!w || (archived ? w.archived_at !== null : w.archived_at === null)) return { ok: false, reason: 'not_found' };
  await sql`UPDATE worksheets SET archived_at = ${archived ? now : null} WHERE id = ${id} AND teacher_id = ${teacherId}`;
  await writeAudit(
    sql,
    {
      type: archived ? 'WORKSHEET_ARCHIVED' : 'WORKSHEET_RESTORED',
      outcome: 'success',
      actorId: teacherId,
      details: { worksheetId: id },
    },
    now,
  );
  return { ok: true };
}

export type LibraryStatus = 'all' | 'draft' | 'ready' | 'archived';

export interface LibraryFilters {
  q?: string;
  studentId?: string;
  grade?: number | null;
  board?: string;
  subject?: string;
  chapter?: string;
  status?: LibraryStatus;
}

export interface LibraryCard {
  id: string;
  kind: WorksheetKind;
  title: string;
  grade: number;
  board: string;
  subject: SubjectId;
  chapter: string | null;
  topic: string | null;
  difficulty: Difficulty | null;
  status: 'draft' | 'ready';
  archived: boolean;
  updatedAt: Date;
  archivedAt: Date | null;
  questions: number;
  emptyQuestions: number;
  marks: number;
  /** Copies not yet handed in (scheduled ones included). */
  assigned: number;
  /** Submitted or under review. */
  waiting: number;
  reviewed: number;
  /** Copies that are not visible to the student yet. */
  scheduled: number;
}

export interface Library {
  cards: LibraryCard[];
  counts: Record<LibraryStatus, number>;
  /** Filter choices: only what this teacher has, and only students linked to them now (W-11). */
  options: {
    students: Array<{ id: string; name: string }>;
    grades: number[];
    boards: string[];
    subjects: SubjectId[];
    chapters: string[];
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** My worksheets (W1): the teacher's own library with filters and assignment counts. */
export async function listWorksheets(
  sql: Sql,
  teacherId: string,
  f: LibraryFilters = {},
  now: Date = new Date(),
): Promise<Library> {
  const empty: Library = {
    cards: [],
    counts: { all: 0, draft: 0, ready: 0, archived: 0 },
    options: { students: [], grades: [], boards: [], subjects: [], chapters: [] },
  };
  if (!(await activeTeacher(sql, teacherId))) return empty;
  const linked = await shareOptions(sql, teacherId);
  const students = linked.map((s) => ({ id: s.studentId, name: s.name }));
  // A student filter only works for a student linked to this teacher now (W-11).
  const studentId = f.studentId && students.some((s) => s.id === f.studentId) ? f.studentId : null;
  const q = line(f.q).slice(0, 100);
  const status: LibraryStatus = f.status ?? 'all';

  const rows = await sql<
    Array<
      WorksheetRow & {
        questions: number;
        empty_questions: number;
        marks: number;
        assigned: number;
        waiting: number;
        reviewed: number;
        scheduled: number;
      }
    >
  >`
    SELECT w.id, w.kind, w.title, w.grade, w.board, w.subject, w.chapter, w.topic, w.difficulty, w.instructions,
           w.source_resource_id, w.source_from_page, w.source_to_page, w.status, w.archived_at, w.updated_at,
           (SELECT count(*)::int FROM worksheet_questions x WHERE x.worksheet_id = w.id) AS questions,
           (SELECT count(*)::int FROM worksheet_questions x WHERE x.worksheet_id = w.id AND x.prompt = '') AS empty_questions,
           (SELECT coalesce(sum(x.points), 0)::int FROM worksheet_questions x WHERE x.worksheet_id = w.id) AS marks,
           count(t.id) FILTER (WHERE t.status IN ('assigned', 'in_progress', 'revision_required'))::int AS assigned,
           count(t.id) FILTER (WHERE t.status IN ('submitted', 'under_review'))::int AS waiting,
           count(t.id) FILTER (WHERE t.status = 'reviewed')::int AS reviewed,
           count(t.id) FILTER (WHERE t.status = 'assigned' AND a.visible_from > ${now})::int AS scheduled
    FROM worksheets w
    LEFT JOIN assignments a ON a.worksheet_id = w.id AND a.teacher_id = w.teacher_id
    -- Counts only for students linked to this teacher now in that subject (W-11).
    LEFT JOIN assignment_targets t ON t.assignment_id = a.id AND EXISTS (
      SELECT 1 FROM teacher_student_links l WHERE l.teacher_id = w.teacher_id AND l.student_id = t.student_id
        AND l.status = 'active' AND a.subject = ANY (l.subjects))
    WHERE w.teacher_id = ${teacherId}
      AND (${q} = '' OR w.title ILIKE ${'%' + escapeLike(q) + '%'} OR w.topic ILIKE ${'%' + escapeLike(q) + '%'})
      AND (${f.grade ?? null}::smallint IS NULL OR w.grade = ${f.grade ?? null})
      AND (${line(f.board)} = '' OR w.board = ${line(f.board)})
      AND (${line(f.subject)} = '' OR w.subject = ${line(f.subject)})
      AND (${line(f.chapter)} = '' OR w.chapter = ${line(f.chapter)})
      AND (${studentId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM assignments a2 JOIN assignment_targets t2 ON t2.assignment_id = a2.id
            WHERE a2.worksheet_id = w.id AND a2.teacher_id = w.teacher_id AND t2.student_id = ${studentId}))
    GROUP BY w.id
    ORDER BY w.updated_at DESC`;

  const cards: LibraryCard[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    grade: r.grade,
    board: r.board,
    subject: r.subject,
    chapter: r.chapter,
    topic: r.topic,
    difficulty: r.difficulty,
    status: r.status,
    archived: r.archived_at !== null,
    archivedAt: r.archived_at,
    updatedAt: r.updated_at,
    questions: r.questions,
    emptyQuestions: r.empty_questions,
    marks: r.marks,
    assigned: r.assigned,
    waiting: r.waiting,
    reviewed: r.reviewed,
    scheduled: r.scheduled,
  }));
  const counts: Record<LibraryStatus, number> = {
    all: cards.filter((c) => !c.archived).length,
    draft: cards.filter((c) => !c.archived && c.status === 'draft').length,
    ready: cards.filter((c) => !c.archived && c.status === 'ready').length,
    archived: cards.filter((c) => c.archived).length,
  };
  const shown = cards.filter((c) =>
    status === 'archived' ? c.archived : !c.archived && (status === 'all' || c.status === status),
  );

  const all = await sql<Array<{ grade: number; board: string; subject: SubjectId; chapter: string | null }>>`
    SELECT DISTINCT grade, board, subject, chapter FROM worksheets WHERE teacher_id = ${teacherId}`;
  const uniqSorted = <T>(xs: T[]) => [...new Set(xs)].sort() as T[];
  return {
    cards: shown,
    counts,
    options: {
      students,
      grades: [...new Set(all.map((r) => r.grade))].sort((a, b) => a - b),
      boards: uniqSorted(all.map((r) => r.board)),
      subjects: SUBJECT_IDS.filter((s) => all.some((r) => r.subject === s)),
      chapters: uniqSorted(all.map((r) => r.chapter).filter((c): c is string => !!c)),
    },
  };
}

export interface BuilderOptions {
  subjects: SubjectId[];
  boards: readonly string[];
  /** The teacher's own shared files, for "work from one of my shared files". */
  resources: Array<{ id: string; title: string; subject: SubjectId }>;
  /** The teacher's other worksheets, for "Copy questions from my worksheets". */
  worksheets: Array<{ id: string; title: string; subject: SubjectId; questions: number }>;
}

export async function builderOptions(sql: Sql, teacherId: string, exceptId?: string): Promise<BuilderOptions | null> {
  const subjects = await activeTeacher(sql, teacherId);
  if (!subjects) return null;
  const resources = await sql<Array<{ id: string; title: string; subject: SubjectId }>>`
    SELECT id, title, subject FROM teacher_resources
    WHERE teacher_id = ${teacherId} AND archived_at IS NULL ORDER BY created_at DESC`;
  const worksheets = await sql<Array<{ id: string; title: string; subject: SubjectId; questions: number }>>`
    SELECT w.id, w.title, w.subject, (SELECT count(*)::int FROM worksheet_questions x WHERE x.worksheet_id = w.id) AS questions
    FROM worksheets w
    WHERE w.teacher_id = ${teacherId} AND w.kind = 'exercise' AND w.id <> ${exceptId && UUID.test(exceptId) ? exceptId : '00000000-0000-0000-0000-000000000000'}
    ORDER BY w.updated_at DESC`;
  return {
    subjects,
    boards: CURRICULA_LIST,
    resources: [...resources],
    worksheets: worksheets.filter((w) => w.questions > 0),
  };
}

/** "Copy questions from my worksheets" (W2): only the teacher's own. Copies are independent. */
export async function questionsToCopy(sql: Sql, teacherId: string, fromId: string): Promise<QuestionDraft[] | null> {
  if (!(await activeTeacher(sql, teacherId))) return null;
  const w = await ownWorksheet(sql, teacherId, fromId);
  if (!w) return null;
  return (await questionsOf(sql, w.id)).map(toDraft);
}

export interface WorksheetPreview {
  id: string;
  title: string;
  kind: WorksheetKind;
  subject: SubjectId;
  grade: number;
  board: string;
  chapter: string | null;
  instructions: string;
  marks: number;
  questions: StudentQuestion[];
}

/** "Preview as a student" (W2): what a student would see. No answer key, ever. */
export async function previewWorksheet(sql: Sql, teacherId: string, id: string): Promise<WorksheetPreview | null> {
  if (!(await activeTeacher(sql, teacherId))) return null;
  const w = await ownWorksheet(sql, teacherId, id);
  if (!w) return null;
  const qs = await questionsOf(sql, w.id);
  return {
    id: w.id,
    title: w.title,
    kind: w.kind,
    subject: w.subject,
    grade: w.grade,
    board: w.board,
    chapter: w.chapter,
    instructions: w.instructions,
    marks: totalPoints(qs),
    questions: qs.map((q, i) => studentView(q, `${w.id}:${i}`)),
  };
}
