import 'server-only';
import { SUBJECT_IDS, type SubjectId } from '@/fixtures/subjects';
import { writeAudit } from './auth/audit';
import type { Db, Sql, Tx } from './db/client';
import { storeUploadedFile } from './files/pieces';
import { resourceShared } from './notifications/events';
import { removeFile, type StoreResult } from './files/store';

/**
 * Teacher-shared resources (CR-07 H-2b; FR-021, FR-027.2).
 *
 * - An approved, active teacher shares a file with students linked to them, only in a subject
 *   the parent ticked for that link (OC-87 Q-1). No approval is needed per file (OC-86).
 * - The student and their parents see it straight away. Nobody else does: not other families,
 *   not other teachers, not Admins or the Super Admin (OC-90 Q-8). Refusals look like "not found".
 * - After a link ends the child keeps what was already shared, marked as from a former teacher
 *   (OC-87 Q-5); the teacher cannot share more.
 * - Deleting archives a resource for 30 days (it can be restored), then it is removed with its
 *   file (FR-021.10).
 * The teacher always comes from the session; ids from the browser are checked here.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 24 * 60 * 60 * 1000;
export const ARCHIVE_DAYS = 30;
const MAX_STUDENTS = 50;

const isSubject = (s: string): s is SubjectId => (SUBJECT_IDS as readonly string[]).includes(s);
const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const cleanNote = (s: unknown) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').trim() : '');

async function activeTeacher(sql: Db, teacherId: string): Promise<boolean> {
  if (!UUID.test(teacherId)) return false;
  const [row] = await sql<Array<{ ok: boolean }>>`
    SELECT (a.role = 'teacher' AND a.status = 'active' AND t.approval_status = 'approved') AS ok
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id WHERE a.id = ${teacherId}`;
  return row?.ok === true;
}

export interface LinkedStudent {
  studentId: string;
  name: string;
  grade: number | null;
  subjects: SubjectId[];
}

/** Students the teacher may share with, and in which subjects (active links only). */
export async function shareOptions(sql: Db, teacherId: string): Promise<LinkedStudent[]> {
  if (!(await activeTeacher(sql, teacherId))) return [];
  const rows = await sql<Array<{ student_id: string; name: string; grade: number | null; subjects: string[] }>>`
    SELECT l.student_id, a.display_name AS name, p.grade, l.subjects
    FROM teacher_student_links l
    JOIN accounts a ON a.id = l.student_id AND a.status = 'active'
    LEFT JOIN student_profiles p ON p.account_id = l.student_id
    WHERE l.teacher_id = ${teacherId} AND l.status = 'active'
    ORDER BY a.display_name`;
  return rows.map((r) => ({
    studentId: r.student_id,
    name: r.name,
    grade: r.grade,
    subjects: SUBJECT_IDS.filter((s) => r.subjects.includes(s)),
  }));
}

export interface ResourceDetails {
  title: unknown;
  subject: unknown;
  chapter?: unknown;
  note?: unknown;
}

type Checked = { title: string; subject: SubjectId; chapter: string | null; note: string | null };

function checkDetails(d: ResourceDetails): Checked | null {
  const title = clean(d.title);
  const subject = clean(d.subject);
  const chapter = clean(d.chapter);
  const note = cleanNote(d.note);
  if (title.length < 1 || title.length > 120 || !isSubject(subject)) return null;
  if (chapter.length > 120 || note.length > 1000) return null;
  return { title, subject, chapter: chapter || null, note: note || null };
}

function checkStudents(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const unique = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
  if (unique.length === 0 || unique.length > MAX_STUDENTS || unique.some((x) => !UUID.test(x))) return null;
  return unique;
}

/** Which of these students are linked to the teacher in the subject right now. */
async function linkedIn(sql: Db, teacherId: string, subject: string, studentIds: string[]): Promise<Set<string>> {
  const rows = await sql<Array<{ student_id: string }>>`
    SELECT l.student_id FROM teacher_student_links l JOIN accounts a ON a.id = l.student_id AND a.status = 'active'
    WHERE l.teacher_id = ${teacherId} AND l.status = 'active' AND ${subject} = ANY (l.subjects)
      AND l.student_id IN ${sql(studentIds)}`;
  return new Set(rows.map((r) => r.student_id));
}

/** CR-16 §3: each new share tells that student and each of their active parents (N-8). */
async function insertShares(tx: Tx, resourceId: string, studentIds: string[], now: Date): Promise<void> {
  for (const id of studentIds) {
    const [share] = await tx<Array<{ id: string }>>`
      INSERT INTO resource_shares (resource_id, student_id, shared_at) VALUES (${resourceId}, ${id}, ${now})
      ON CONFLICT (resource_id, student_id) WHERE unshared_at IS NULL DO NOTHING
      RETURNING id`;
    if (share) await resourceShared(tx, share.id, now);
  }
}

export type ShareResult =
  | { ok: true; resourceId: string; sharedWith: string[] }
  | { ok: false; reason: 'not_allowed' | 'invalid' | 'not_linked' | 'upload_missing' }
  | Exclude<StoreResult, { ok: true } | { ok: false; reason: 'refused' }>;

/** Uploads a file and shares it in one step (board HW2). */
export async function shareNewResource(
  sql: Sql,
  teacherId: string,
  input: ResourceDetails & { uploadId: unknown; studentIds: unknown },
  now: Date = new Date(),
): Promise<ShareResult> {
  if (!(await activeTeacher(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  const details = checkDetails(input);
  const students = checkStudents(input.studentIds);
  const uploadId = clean(input.uploadId);
  if (!details || !students) return { ok: false, reason: 'invalid' };
  if (!UUID.test(uploadId)) return { ok: false, reason: 'upload_missing' };
  if ((await linkedIn(sql, teacherId, details.subject, students)).size !== students.length) {
    return { ok: false, reason: 'not_linked' };
  }
  let resourceId = '';
  const stored = await storeUploadedFile(sql, teacherId, 'teacher_resource', uploadId, now, async (tx, fileId) => {
    // Checked again inside the save: a parent may have just removed the link or the subject.
    if ((await linkedIn(tx, teacherId, details.subject, students)).size !== students.length) {
      return { ok: false, detail: 'not_linked' };
    }
    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO teacher_resources (teacher_id, file_id, title, subject, chapter, note, created_at, updated_at)
      VALUES (${teacherId}, ${fileId}, ${details.title}, ${details.subject}, ${details.chapter}, ${details.note}, ${now}, ${now})
      RETURNING id`;
    resourceId = row!.id;
    await insertShares(tx, resourceId, students, now);
    await writeAudit(
      tx,
      {
        type: 'RESOURCE_SHARED',
        outcome: 'success',
        actorId: teacherId,
        details: { resourceId, subject: details.subject, students: students.length },
      },
      now,
    );
    return { ok: true };
  });
  if (stored.ok) return { ok: true, resourceId, sharedWith: students };
  if (stored.reason === 'refused') return { ok: false, reason: 'not_linked' };
  return stored;
}

type Owned = { id: string; subject: string; archived_at: Date | null; file_id: string };

async function ownResource(sql: Db, teacherId: string, resourceId: string): Promise<Owned | null> {
  if (!UUID.test(teacherId) || !UUID.test(resourceId)) return null;
  const [row] = await sql<Owned[]>`
    SELECT id, subject, archived_at, file_id FROM teacher_resources WHERE id = ${resourceId} AND teacher_id = ${teacherId}`;
  return row ?? null;
}

type Simple = { ok: true } | { ok: false; reason: 'not_found' | 'invalid' | 'not_linked' | 'not_allowed' };

/** Renames a resource or changes its chapter or note. */
export async function editResource(
  sql: Sql,
  teacherId: string,
  resourceId: string,
  input: Omit<ResourceDetails, 'subject'>,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeTeacher(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  const own = await ownResource(sql, teacherId, resourceId);
  if (!own || own.archived_at) return { ok: false, reason: 'not_found' };
  const details = checkDetails({ ...input, subject: own.subject });
  if (!details) return { ok: false, reason: 'invalid' };
  await sql`UPDATE teacher_resources SET title = ${details.title}, chapter = ${details.chapter}, note = ${details.note},
            updated_at = ${now} WHERE id = ${resourceId}`;
  return { ok: true };
}

/** Shares an existing resource with more linked students. */
export async function shareWithMore(
  sql: Sql,
  teacherId: string,
  resourceId: string,
  studentIds: unknown,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeTeacher(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  const own = await ownResource(sql, teacherId, resourceId);
  const students = checkStudents(studentIds);
  if (!own || own.archived_at) return { ok: false, reason: 'not_found' };
  if (!students) return { ok: false, reason: 'invalid' };
  return sql.begin(async (tx): Promise<Simple> => {
    if ((await linkedIn(tx, teacherId, own.subject, students)).size !== students.length) {
      return { ok: false, reason: 'not_linked' };
    }
    await insertShares(tx, resourceId, students, now);
    await writeAudit(
      tx,
      {
        type: 'RESOURCE_SHARED',
        outcome: 'success',
        actorId: teacherId,
        details: { resourceId, students: students.length },
      },
      now,
    );
    return { ok: true };
  });
}

/** Stops sharing with one student; it disappears for them and their parents at once. */
export async function unshareResource(
  sql: Sql,
  teacherId: string,
  resourceId: string,
  studentId: string,
  now: Date = new Date(),
): Promise<Simple> {
  const own = await ownResource(sql, teacherId, resourceId);
  if (!own || !UUID.test(studentId)) return { ok: false, reason: 'not_found' };
  const rows = await sql`UPDATE resource_shares SET unshared_at = ${now}
    WHERE resource_id = ${resourceId} AND student_id = ${studentId} AND unshared_at IS NULL RETURNING id`;
  if (rows.length === 0) return { ok: false, reason: 'not_found' };
  await writeAudit(
    sql,
    {
      type: 'RESOURCE_UNSHARED',
      outcome: 'success',
      actorId: teacherId,
      subjectId: studentId,
      details: { resourceId },
    },
    now,
  );
  return { ok: true };
}

/** Deletes (archives) or restores a resource. Archived resources are hidden from students and parents. */
export async function setArchived(
  sql: Sql,
  teacherId: string,
  resourceId: string,
  archived: boolean,
  now: Date = new Date(),
): Promise<Simple> {
  const own = await ownResource(sql, teacherId, resourceId);
  if (!own || (archived ? own.archived_at !== null : own.archived_at === null))
    return { ok: false, reason: 'not_found' };
  await sql`UPDATE teacher_resources SET archived_at = ${archived ? now : null}, updated_at = ${now} WHERE id = ${resourceId}`;
  await writeAudit(
    sql,
    {
      type: archived ? 'RESOURCE_ARCHIVED' : 'RESOURCE_RESTORED',
      outcome: 'success',
      actorId: teacherId,
      details: { resourceId },
    },
    now,
  );
  return { ok: true };
}

/** Removes resources archived more than 30 days ago, with their files. Returns how many. */
export async function purgeArchivedResources(sql: Sql, now: Date = new Date(), teacherId?: string): Promise<number> {
  const cutoff = new Date(now.getTime() - ARCHIVE_DAYS * DAY);
  const rows = teacherId
    ? await sql<Array<{ id: string; teacher_id: string; file_id: string }>>`
        SELECT id, teacher_id, file_id FROM teacher_resources WHERE teacher_id = ${teacherId} AND archived_at < ${cutoff}`
    : await sql<Array<{ id: string; teacher_id: string; file_id: string }>>`
        SELECT id, teacher_id, file_id FROM teacher_resources WHERE archived_at < ${cutoff}`;
  for (const r of rows) {
    await sql`DELETE FROM teacher_resources WHERE id = ${r.id}`;
    await removeFile(sql, r.teacher_id, r.file_id, now);
  }
  return rows.length;
}

export interface OwnResource {
  id: string;
  title: string;
  subject: SubjectId;
  chapter: string | null;
  note: string | null;
  fileId: string;
  mediaType: string;
  byteSize: number;
  createdAt: Date;
  archivedAt: Date | null;
  /** When an archived resource is removed for good. */
  removeOn: Date | null;
  sharedWith: Array<{ studentId: string; name: string; linked: boolean }>;
}

/** The teacher's own resources, newest first, with who can see each one. */
export async function listOwnResources(sql: Sql, teacherId: string, now: Date = new Date()): Promise<OwnResource[]> {
  if (!UUID.test(teacherId)) return [];
  await purgeArchivedResources(sql, now, teacherId);
  const rows = await sql<
    Array<{
      id: string;
      title: string;
      subject: SubjectId;
      chapter: string | null;
      note: string | null;
      file_id: string;
      media_type: string;
      byte_size: number;
      created_at: Date;
      archived_at: Date | null;
      shares: Array<{ studentId: string; name: string; linked: boolean }> | null;
    }>
  >`
    SELECT r.id, r.title, r.subject, r.chapter, r.note, r.file_id, f.media_type, f.byte_size, r.created_at, r.archived_at,
      (SELECT json_agg(json_build_object('studentId', s.student_id, 'name', a.display_name,
                'linked', EXISTS (SELECT 1 FROM teacher_student_links l WHERE l.teacher_id = r.teacher_id
                   AND l.student_id = s.student_id AND l.status = 'active' AND r.subject = ANY (l.subjects)))
              ORDER BY a.display_name)
       FROM resource_shares s JOIN accounts a ON a.id = s.student_id
       WHERE s.resource_id = r.id AND s.unshared_at IS NULL) AS shares
    FROM teacher_resources r JOIN stored_files f ON f.id = r.file_id
    WHERE r.teacher_id = ${teacherId}
    ORDER BY r.archived_at NULLS FIRST, r.created_at DESC`;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subject,
    chapter: r.chapter,
    note: r.note,
    fileId: r.file_id,
    mediaType: r.media_type,
    byteSize: r.byte_size,
    createdAt: r.created_at,
    archivedAt: r.archived_at,
    removeOn: r.archived_at ? new Date(r.archived_at.getTime() + ARCHIVE_DAYS * DAY) : null,
    sharedWith: r.shares ?? [],
  }));
}

export interface SharedResource {
  id: string;
  title: string;
  subject: SubjectId;
  chapter: string | null;
  note: string | null;
  fileId: string;
  mediaType: string;
  byteSize: number;
  teacherName: string;
  /** False when the child no longer works with this teacher (FR-027.2). */
  fromCurrentTeacher: boolean;
  sharedAt: Date;
  /** The children of this parent it was shared with (parent view only). */
  children: Array<{ id: string; name: string }>;
}

type SharedRow = {
  id: string;
  title: string;
  subject: SubjectId;
  chapter: string | null;
  note: string | null;
  file_id: string;
  media_type: string;
  byte_size: number;
  teacher_name: string;
  current: boolean;
  shared_at: Date;
  children: Array<{ id: string; name: string }>;
};

const toShared = (r: SharedRow): SharedResource => ({
  id: r.id,
  title: r.title,
  subject: r.subject,
  chapter: r.chapter,
  note: r.note,
  fileId: r.file_id,
  mediaType: r.media_type,
  byteSize: r.byte_size,
  teacherName: r.teacher_name,
  fromCurrentTeacher: r.current,
  sharedAt: r.shared_at,
  children: r.children,
});

/**
 * Resources shared with these children (still shared, not deleted by the teacher). One row per
 * resource; `children` lists which of the given children can see it.
 */
async function sharedWith(sql: Db, studentIds: string[]): Promise<SharedResource[]> {
  if (studentIds.length === 0) return [];
  const rows = await sql<SharedRow[]>`
    SELECT r.id, r.title, r.subject, r.chapter, r.note, r.file_id, f.media_type, f.byte_size,
           t.display_name AS teacher_name,
           bool_or(EXISTS (SELECT 1 FROM teacher_student_links l WHERE l.teacher_id = r.teacher_id
                     AND l.student_id = s.student_id AND l.status = 'active')) AS current,
           max(s.shared_at) AS shared_at,
           json_agg(json_build_object('id', c.id, 'name', c.display_name) ORDER BY c.display_name) AS children
    FROM resource_shares s
    JOIN teacher_resources r ON r.id = s.resource_id AND r.archived_at IS NULL
    JOIN stored_files f ON f.id = r.file_id AND f.deleted_at IS NULL
    JOIN accounts t ON t.id = r.teacher_id
    JOIN accounts c ON c.id = s.student_id
    WHERE s.student_id IN ${sql(studentIds)} AND s.unshared_at IS NULL
    GROUP BY r.id, f.media_type, f.byte_size, t.display_name
    ORDER BY max(s.shared_at) DESC`;
  return rows.map(toShared);
}

/** "From my teachers" for a student (board HW5): only what was shared with them. */
export async function listResourcesForStudent(sql: Db, studentId: string): Promise<SharedResource[]> {
  if (!UUID.test(studentId)) return [];
  const [me] = await sql`SELECT 1 FROM accounts WHERE id = ${studentId} AND role = 'student' AND status = 'active'`;
  return me ? sharedWith(sql, [studentId]) : [];
}

/** "Shared with your children" for a parent (board HW8): every own child, every teacher. */
export async function listResourcesForParent(sql: Db, parentId: string): Promise<SharedResource[]> {
  if (!UUID.test(parentId)) return [];
  const kids = await sql<Array<{ student_id: string }>>`
    SELECT g.student_id FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
    WHERE g.parent_id = ${parentId} AND g.status = 'active' AND p.role = 'parent' AND p.status = 'active'`;
  return sharedWith(
    sql,
    kids.map((k) => k.student_id),
  );
}
