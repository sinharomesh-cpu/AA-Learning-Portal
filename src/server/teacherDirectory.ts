import 'server-only';
import { SUBJECT_IDS } from '@/fixtures/subjects';
import type { Db } from './db/client';

/**
 * Teacher directory (PR3; approved board 65; OC-48, OC-54, OC-62).
 *
 * Parents search approved, active teachers who have not hidden themselves from search. Only the
 * OC-54 fields leave this module: name, approved subjects, approved grades, time zone and bio.
 * Email addresses, phone numbers, pending subject or grade changes and approval notes are never
 * selected, so they cannot reach the page.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Most results a single search returns; the page asks parents to narrow the search beyond this. */
export const DIRECTORY_LIMIT = 50;
export const NAME_QUERY_MAX = 80;

export interface DirectoryTeacher {
  id: string;
  name: string;
  subjects: string[];
  grades: number[];
  timeZone: string;
  bio: string;
  /** Already linked (active or waiting) to at least one of this parent's children. */
  alreadyMine: boolean;
}

export interface DirectoryQuery {
  subject?: string;
  grade?: number;
  name?: string;
}

/** Cleans the search form: unknown subjects or grades are ignored, the name is trimmed and capped. */
export function cleanDirectoryQuery(raw: { subject?: string; grade?: string; name?: string }): DirectoryQuery {
  const subject = (SUBJECT_IDS as readonly string[]).includes(raw.subject ?? '') ? raw.subject : undefined;
  const g = Number(raw.grade);
  const grade = Number.isInteger(g) && g >= 1 && g <= 12 ? g : undefined;
  const name = [...(raw.name ?? '').normalize('NFC').trim().replace(/\s+/g, ' ')].slice(0, NAME_QUERY_MAX).join('');
  return { subject, grade, name: name || undefined };
}

type Row = {
  id: string;
  name: string;
  subjects: string[];
  grades: number[];
  time_zone: string;
  bio: string | null;
  mine: boolean;
};

const toTeacher = (r: Row): DirectoryTeacher => ({
  id: r.id,
  name: r.name,
  subjects: r.subjects,
  grades: r.grades.map(Number).sort((a, b) => a - b),
  timeZone: r.time_zone,
  bio: r.bio ?? '',
  alreadyMine: r.mine,
});

/** True when the account is an active parent (only parents may use the directory). */
async function activeParent(sql: Db, parentId: string): Promise<boolean> {
  if (!UUID.test(parentId)) return false;
  const [row] = await sql<Array<{ ok: boolean }>>`
    SELECT true AS ok FROM accounts WHERE id = ${parentId} AND role = 'parent' AND status = 'active'`;
  return Boolean(row);
}

/** Escapes LIKE wildcards so a name search matches the typed text literally. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Board 65 search. Returns at most DIRECTORY_LIMIT teachers ordered by name, and whether more
 * matched. Every filter is optional; with none, all listed teachers are returned (up to the limit).
 */
export async function searchTeachers(
  sql: Db,
  parentId: string,
  query: DirectoryQuery,
): Promise<{ teachers: DirectoryTeacher[]; more: boolean }> {
  if (!(await activeParent(sql, parentId))) return { teachers: [], more: false };
  const rows = await sql<Row[]>`
    SELECT a.id, a.display_name AS name, tp.subjects, tp.grades, a.time_zone, tp.bio,
           EXISTS (
             SELECT 1 FROM teacher_student_links l
             JOIN guardian_links g ON g.student_id = l.student_id AND g.parent_id = ${parentId} AND g.status = 'active'
             WHERE l.teacher_id = a.id AND l.status <> 'removed'
           ) AS mine
    FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id
    WHERE a.role = 'teacher' AND a.status = 'active'
      AND tp.approval_status = 'approved' AND NOT tp.hidden_from_search
      AND cardinality(tp.subjects) > 0
      ${query.subject ? sql`AND ${query.subject} = ANY(tp.subjects)` : sql``}
      ${query.grade ? sql`AND ${query.grade}::smallint = ANY(tp.grades)` : sql``}
      ${query.name ? sql`AND a.display_name ILIKE ${`%${likeEscape(query.name)}%`} ESCAPE '\\'` : sql``}
    ORDER BY lower(a.display_name), a.id
    LIMIT ${DIRECTORY_LIMIT + 1}`;
  return { teachers: rows.slice(0, DIRECTORY_LIMIT).map(toTeacher), more: rows.length > DIRECTORY_LIMIT };
}

/** One listed teacher for the "Add as my teacher" page; null unless the directory would show them. */
export async function getDirectoryTeacher(
  sql: Db,
  parentId: string,
  teacherId: string,
): Promise<DirectoryTeacher | null> {
  if (!UUID.test(teacherId) || !(await activeParent(sql, parentId))) return null;
  const [row] = await sql<Row[]>`
    SELECT a.id, a.display_name AS name, tp.subjects, tp.grades, a.time_zone, tp.bio,
           EXISTS (
             SELECT 1 FROM teacher_student_links l
             JOIN guardian_links g ON g.student_id = l.student_id AND g.parent_id = ${parentId} AND g.status = 'active'
             WHERE l.teacher_id = a.id AND l.status <> 'removed'
           ) AS mine
    FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id
    WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'active'
      AND tp.approval_status = 'approved' AND NOT tp.hidden_from_search
      AND cardinality(tp.subjects) > 0`;
  return row ? toTeacher(row) : null;
}
