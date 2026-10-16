import 'server-only';
import { SUBJECT_IDS } from '@/fixtures/subjects';
import { looksLikeEmail, normaliseEmail } from './auth/accounts';
import { writeAudit } from './auth/audit';
import { queueEmail } from './auth/outbox';
import { issueSetPassword } from './auth/setPasswordLink';
import type { Db, Sql } from './db/client';

/**
 * Parent–teacher linking (PR2; boards 57, 58, M-25; OC-36, OC-41, OC-62).
 *
 * A teacher sees a child only through an active `teacher_student_links` row, and only for the
 * subjects the parent ticked. Parents manage links for their own children only; every function
 * takes the parent or teacher id from the server-side session and checks again here.
 * `teacherMaySee` is the single check that later features (books, bookings) must call.
 */

const WITHDRAWN = 'Request withdrawn by the parent';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** New teacher accounts a parent may create per day (protects against misuse of the email form). */
export const NEW_TEACHERS_PER_DAY = 10;

export interface ChildSubjects {
  childId: string;
  subjects: string[];
}

export type LinkStatus = 'pending' | 'active';

export interface MyTeacher {
  id: string;
  name: string;
  /** active: approved and usable; waiting: AA Pro approval pending; not_approved: rejected; inactive: deactivated. */
  state: 'active' | 'waiting' | 'not_approved' | 'inactive';
  /** The subjects on the teacher's approved profile (for information). */
  teaches: string[];
  children: Array<{ childId: string; name: string; subjects: string[]; status: LinkStatus }>;
  addedAt: Date;
}

const subjectsOk = (subjects: string[]) =>
  subjects.length > 0 && subjects.every((s) => (SUBJECT_IDS as readonly string[]).includes(s));

function teacherState(status: string, approval: string): MyTeacher['state'] {
  if (approval === 'rejected') return 'not_approved';
  if (status === 'active' && approval === 'approved') return 'active';
  if (status === 'pending_approval') return 'waiting';
  return 'inactive';
}

/** The parent's own active children with their subjects; also checks the parent is active. */
async function ownChildren(sql: Db, parentId: string): Promise<Map<string, { name: string; subjects: string[] }>> {
  const rows = await sql<Array<{ id: string; name: string; subjects: string[] }>>`
    SELECT c.id, c.display_name AS name, sp.subjects
    FROM guardian_links g
    JOIN accounts p ON p.id = g.parent_id AND p.role = 'parent' AND p.status = 'active'
    JOIN accounts c ON c.id = g.student_id AND c.role = 'student'
    JOIN student_profiles sp ON sp.account_id = c.id
    WHERE g.parent_id = ${parentId} AND g.status = 'active'`;
  return new Map(rows.map((r) => [r.id, { name: r.name, subjects: r.subjects }]));
}

/** The subjects on a teacher's approved profile (empty unless approved). */
async function approvedSubjects(sql: Db, teacherId: string): Promise<string[]> {
  const [row] = await sql<Array<{ subjects: string[] }>>`
    SELECT subjects FROM teacher_profiles WHERE account_id = ${teacherId} AND approval_status = 'approved'`;
  return row?.subjects ?? [];
}

/** Board 57: the teachers linked to this parent's children, with their children and subjects. */
export async function listMyTeachers(sql: Db, parentId: string): Promise<MyTeacher[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await sql<
    Array<{
      teacher_id: string;
      name: string;
      status: string;
      approval: string;
      teaches: string[];
      child_id: string;
      child_name: string;
      subjects: string[];
      link_status: LinkStatus;
      created_at: Date;
    }>
  >`
    SELECT t.id AS teacher_id, t.display_name AS name, t.status, tp.approval_status AS approval, tp.subjects AS teaches,
           c.id AS child_id, c.display_name AS child_name, l.subjects, l.status AS link_status, l.created_at
    FROM teacher_student_links l
    JOIN guardian_links g ON g.student_id = l.student_id AND g.parent_id = ${parentId} AND g.status = 'active'
    JOIN accounts t ON t.id = l.teacher_id
    JOIN teacher_profiles tp ON tp.account_id = t.id
    JOIN accounts c ON c.id = l.student_id
    WHERE l.status <> 'removed'
    ORDER BY l.created_at, t.id, c.display_name`;
  const byTeacher = new Map<string, MyTeacher>();
  for (const r of rows) {
    let t = byTeacher.get(r.teacher_id);
    if (!t) {
      t = {
        id: r.teacher_id,
        name: r.name,
        state: teacherState(r.status, r.approval),
        teaches: r.approval === 'approved' ? r.teaches : [],
        children: [],
        addedAt: r.created_at,
      };
      byTeacher.set(r.teacher_id, t);
    }
    t.children.push({ childId: r.child_id, name: r.child_name, subjects: r.subjects, status: r.link_status });
  }
  return [...byTeacher.values()];
}

export type AddTeacherResult =
  | { ok: true; outcome: 'linked' | 'requested'; teacherName: string }
  | { ok: false; reason: 'name' | 'email' | 'choose' | 'subjects' | 'cannot_add' | 'too_many' | 'not_allowed' }
  /** OC-75: an approved teacher can only be linked for subjects on their approved profile. */
  | { ok: false; reason: 'not_taught'; teacherName: string; teaches: string[] };

/** Validates a children/subjects choice against the parent's own children. */
function checkChoice(
  mine: Map<string, { name: string; subjects: string[] }>,
  choice: ChildSubjects[],
): 'choose' | 'subjects' | 'not_allowed' | null {
  const picked = choice.filter((c) => c.subjects.length > 0);
  if (picked.length === 0) return 'choose';
  for (const c of picked) {
    const child = mine.get(c.childId);
    if (!child) return 'not_allowed';
    if (!subjectsOk(c.subjects) || !c.subjects.every((s) => child.subjects.includes(s))) return 'subjects';
  }
  return null;
}

const unique = (xs: string[]) => [...new Set(xs)].sort();

/** Creates or updates the live link for one child; returns true when something changed. */
async function upsertLink(
  tx: Db,
  parentId: string,
  teacherId: string,
  childId: string,
  subjects: string[],
  status: LinkStatus,
): Promise<boolean> {
  const [live] = await tx<Array<{ id: string; subjects: string[] }>>`
    SELECT id, subjects FROM teacher_student_links
    WHERE teacher_id = ${teacherId} AND student_id = ${childId} AND status <> 'removed' FOR UPDATE`;
  if (live) {
    if (unique(live.subjects).join() === unique(subjects).join()) return false;
    await tx`UPDATE teacher_student_links SET subjects = ${unique(subjects)} WHERE id = ${live.id}`;
    return true;
  }
  await tx`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
           VALUES (${teacherId}, ${childId}, ${parentId}, 'parent_added', ${status}, ${unique(subjects)})`;
  return true;
}

/**
 * Board 58 / OC-36: add a teacher by email for some of the parent's children and subjects.
 * - An approved, active teacher is linked at once and emailed (OC-36(6)).
 * - A new email becomes a parent-added teacher waiting for approval; links wait too (OC-36(2)–(4)).
 * - A teacher still waiting for approval: links wait.
 * - Anything else (a parent or admin email, a rejected or closed teacher) gets one neutral answer.
 */
export async function addTeacher(
  sql: Sql,
  parentId: string,
  input: { name: string; email: string; children: ChildSubjects[]; baseUrl: string },
  now: Date = new Date(),
): Promise<AddTeacherResult> {
  if (!UUID.test(parentId)) return { ok: false, reason: 'not_allowed' };
  const name = input.name.normalize('NFC').trim().replace(/\s+/g, ' ');
  if ([...name].length < 2 || [...name].length > 80) return { ok: false, reason: 'name' };
  const email = normaliseEmail(input.email.trim());
  if (!looksLikeEmail(email)) return { ok: false, reason: 'email' };
  return sql.begin(async (tx): Promise<AddTeacherResult> => {
    const mine = await ownChildren(tx, parentId);
    if (mine.size === 0) return { ok: false, reason: 'not_allowed' };
    const problem = checkChoice(mine, input.children);
    if (problem) return { ok: false, reason: problem };
    const picked = input.children.filter((c) => c.subjects.length > 0);

    const [existing] = await tx<
      Array<{
        id: string;
        role: string;
        status: string;
        approval: string | null;
        name: string;
        withdrawn: boolean;
      }>
    >`
      SELECT a.id, a.role, a.status, tp.approval_status AS approval, a.display_name AS name,
             (a.status = 'deactivated' AND a.status_reason = ${WITHDRAWN} AND a.password_hash IS NULL
              AND tp.origin = 'parent_added') AS withdrawn
      FROM accounts a LEFT JOIN teacher_profiles tp ON tp.account_id = a.id
      WHERE a.email = ${email} FOR UPDATE OF a`;
    // A request a parent withdrew earlier can be made again (by any parent).
    if (existing?.withdrawn) {
      await tx`UPDATE accounts SET status = 'pending_approval', status_reason = NULL WHERE id = ${existing.id}`;
      existing.status = 'pending_approval';
    }

    let teacherId: string;
    let teacherName: string;
    let outcome: 'linked' | 'requested';
    if (!existing) {
      const [recent] = await tx<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM teacher_profiles tp JOIN accounts a ON a.id = tp.account_id
        WHERE tp.added_by_parent_id = ${parentId} AND a.created_at > ${new Date(now.getTime() - 86_400_000)}`;
      if ((recent?.count ?? 0) >= NEW_TEACHERS_PER_DAY) return { ok: false, reason: 'too_many' };
      const [created] = await tx<Array<{ id: string }>>`
        INSERT INTO accounts (role, status, email, display_name, created_at, updated_at)
        VALUES ('teacher', 'pending_approval', ${email}, ${name}, ${now}, ${now}) RETURNING id`;
      teacherId = created!.id;
      teacherName = name;
      await tx`INSERT INTO teacher_profiles (account_id, origin, added_by_parent_id, approval_status)
               VALUES (${teacherId}, 'parent_added', ${parentId}, 'draft')`;
      // OC-75: the teacher sets a password now, completes the profile and sends it for approval.
      await issueSetPassword(tx, { id: teacherId, email, name }, 'teacher_added_by_parent', input.baseUrl, now);
      outcome = 'requested';
    } else if (existing.role === 'teacher' && existing.status === 'active' && existing.approval === 'approved') {
      teacherId = existing.id;
      teacherName = existing.name;
      outcome = 'linked';
      const teaches = await approvedSubjects(tx, teacherId);
      if (!picked.every((c) => c.subjects.every((x) => teaches.includes(x)))) {
        return { ok: false, reason: 'not_taught', teacherName, teaches };
      }
    } else if (
      existing.role === 'teacher' &&
      existing.status === 'pending_approval' &&
      existing.approval !== 'rejected'
    ) {
      teacherId = existing.id;
      teacherName = existing.name;
      outcome = 'requested';
    } else {
      await writeAudit(
        tx,
        { type: 'TEACHER_LINK_REFUSED', outcome: 'denied', actorId: parentId, details: { reason: 'not_linkable' } },
        now,
      );
      return { ok: false, reason: 'cannot_add' };
    }

    const status: LinkStatus = outcome === 'linked' ? 'active' : 'pending';
    for (const c of picked) await upsertLink(tx, parentId, teacherId, c.childId, c.subjects, status);
    if (outcome === 'linked') {
      await queueEmail(tx, {
        to: email,
        template: 'teacher_linked_to_child',
        // First names only; no parent contact details (M-25).
        payload: { name: teacherName, children: picked.map((c) => mine.get(c.childId)!.name).join(', ') },
        dedupeKey: `teacher_linked:${teacherId}:${parentId}:${now.getTime()}`,
      });
    }
    await writeAudit(
      tx,
      {
        type: 'TEACHER_LINKED',
        outcome: 'success',
        actorId: parentId,
        subjectId: teacherId,
        details: { children: picked.length, status, newAccount: !existing },
      },
      now,
    );
    return { ok: true, outcome, teacherName };
  });
}

export type UpdateLinksResult =
  { ok: true; removed: boolean } | { ok: false; reason: 'subjects' | 'not_found' | 'not_allowed' };

/**
 * "Change children and subjects" (board 57). The choice replaces the teacher's links to this
 * parent's children: a child left out loses the link at once. Unticking everything removes the
 * teacher. Links to other families' children are never touched.
 */
export async function updateTeacherLinks(
  sql: Sql,
  parentId: string,
  teacherId: string,
  children: ChildSubjects[],
  now: Date = new Date(),
): Promise<UpdateLinksResult> {
  if (!UUID.test(parentId) || !UUID.test(teacherId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<UpdateLinksResult> => {
    const mine = await ownChildren(tx, parentId);
    if (mine.size === 0) return { ok: false, reason: 'not_allowed' };
    const live = await tx<Array<{ id: string; student_id: string; status: LinkStatus }>>`
      SELECT id, student_id, status FROM teacher_student_links
      WHERE teacher_id = ${teacherId} AND status <> 'removed' AND student_id = ANY(${[...mine.keys()]}) FOR UPDATE`;
    if (live.length === 0) return { ok: false, reason: 'not_found' };
    const picked = children.filter((c) => c.subjects.length > 0);
    if (picked.length === 0) {
      await removeLinks(tx, parentId, teacherId, live, now);
      return { ok: true, removed: true };
    }
    const problem = checkChoice(mine, picked);
    if (problem === 'choose') return { ok: false, reason: 'subjects' };
    if (problem) return { ok: false, reason: problem === 'not_allowed' ? 'not_allowed' : 'subjects' };
    // A new child gets the same status as the teacher's existing links (active once approved).
    const [teacher] = await tx<Array<{ ok: boolean }>>`
      SELECT (a.status = 'active' AND tp.approval_status = 'approved') AS ok
      FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id WHERE a.id = ${teacherId}`;
    const status: LinkStatus = teacher?.ok ? 'active' : 'pending';
    if (teacher?.ok) {
      const teaches = await approvedSubjects(tx, teacherId);
      if (!picked.every((c) => c.subjects.every((x) => teaches.includes(x)))) return { ok: false, reason: 'subjects' };
    }
    const keep = new Set(picked.map((c) => c.childId));
    await removeLinks(
      tx,
      parentId,
      teacherId,
      live.filter((l) => !keep.has(l.student_id)),
      now,
    );
    for (const c of picked) await upsertLink(tx, parentId, teacherId, c.childId, c.subjects, status);
    await writeAudit(
      tx,
      {
        type: 'TEACHER_LINK_CHANGED',
        outcome: 'success',
        actorId: parentId,
        subjectId: teacherId,
        details: { children: picked.length },
      },
      now,
    );
    return { ok: true, removed: false };
  });
}

/** "Remove teacher" / "Cancel request" (board 57): ends every link to this parent's children. */
export async function removeTeacher(
  sql: Sql,
  parentId: string,
  teacherId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  if (!UUID.test(parentId) || !UUID.test(teacherId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx) => {
    const mine = await ownChildren(tx, parentId);
    const live = await tx<Array<{ id: string; student_id: string; status: LinkStatus }>>`
      SELECT id, student_id, status FROM teacher_student_links
      WHERE teacher_id = ${teacherId} AND status <> 'removed' AND student_id = ANY(${[...mine.keys()]}) FOR UPDATE`;
    if (live.length === 0) return { ok: false as const, reason: 'not_found' as const };
    await removeLinks(tx, parentId, teacherId, live, now);
    return { ok: true as const };
  });
}

async function removeLinks(
  tx: Db,
  parentId: string,
  teacherId: string,
  links: Array<{ id: string }>,
  now: Date,
): Promise<void> {
  if (links.length === 0) return;
  await tx`UPDATE teacher_student_links SET status = 'removed', removed_at = ${now}
           WHERE id = ANY(${links.map((l) => l.id)})`;
  await writeAudit(
    tx,
    {
      type: 'TEACHER_LINK_REMOVED',
      outcome: 'success',
      actorId: parentId,
      subjectId: teacherId,
      details: { children: links.length },
    },
    now,
  );
  // A teacher this parent added, still waiting, with no password and no other link left: the
  // approval request is withdrawn so it does not stay in the admin queue (Claude's reading).
  const [withdraw] = await tx<Array<{ id: string }>>`
    SELECT a.id FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id
    WHERE a.id = ${teacherId} AND a.status = 'pending_approval' AND a.password_hash IS NULL
      AND tp.origin = 'parent_added' AND tp.added_by_parent_id = ${parentId}
      AND NOT EXISTS (SELECT 1 FROM teacher_student_links l WHERE l.teacher_id = a.id AND l.status <> 'removed')`;
  if (withdraw) {
    await tx`UPDATE accounts SET status = 'deactivated', status_reason = ${WITHDRAWN} WHERE id = ${teacherId}`;
    await writeAudit(
      tx,
      { type: 'TEACHER_REQUEST_WITHDRAWN', outcome: 'success', actorId: parentId, subjectId: teacherId },
      now,
    );
  }
}

/**
 * OC-75: brings a teacher's links in line with their approved subjects. Each link keeps only
 * subjects the teacher is approved for; a link left with none ends. With `activate`, waiting
 * links that still have subjects start (teacher approval). The parents affected are emailed.
 */
export async function revalidateTeacherLinks(
  tx: Db,
  teacherId: string,
  opts: { activate: boolean; baseUrl: string },
  now: Date,
): Promise<void> {
  const teaches = await approvedSubjects(tx, teacherId);
  const [teacher] = await tx<
    Array<{ name: string }>
  >`SELECT display_name AS name FROM accounts WHERE id = ${teacherId}`;
  const links = await tx<
    Array<{
      id: string;
      subjects: string[];
      status: LinkStatus;
      parent_email: string | null;
      parent_name: string | null;
      child: string;
      parent_id: string;
    }>
  >`
    SELECT l.id, l.subjects, l.status, p.email AS parent_email, p.display_name AS parent_name,
           c.display_name AS child, l.created_by_parent_id AS parent_id
    FROM teacher_student_links l
    JOIN accounts c ON c.id = l.student_id
    LEFT JOIN accounts p ON p.id = l.created_by_parent_id AND p.status = 'active'
    WHERE l.teacher_id = ${teacherId} AND l.status <> 'removed' FOR UPDATE OF l`;
  const told = new Set<string>();
  for (const l of links) {
    const keep = l.subjects.filter((x) => teaches.includes(x));
    const dropped = l.subjects.filter((x) => !teaches.includes(x));
    if (keep.length === 0) {
      await tx`UPDATE teacher_student_links SET status = 'removed', removed_at = ${now} WHERE id = ${l.id}`;
      await writeAudit(
        tx,
        { type: 'TEACHER_LINK_ENDED_SUBJECTS', outcome: 'success', subjectId: teacherId, details: { link: l.id } },
        now,
      );
      if (l.parent_email) {
        await queueEmail(tx, {
          to: l.parent_email,
          template: 'parent_teacher_link_ended',
          payload: {
            name: l.parent_name ?? '',
            teacher: teacher?.name ?? '',
            child: l.child,
            teachersUrl: `${opts.baseUrl}/parent/teachers`,
          },
          dedupeKey: `link_ended:${l.id}`,
        });
      }
      continue;
    }
    const status: LinkStatus = opts.activate && teaches.length ? 'active' : l.status;
    if (dropped.length || status !== l.status) {
      await tx`UPDATE teacher_student_links SET subjects = ${keep}, status = ${status} WHERE id = ${l.id}`;
    }
    if (dropped.length && l.parent_email) {
      await queueEmail(tx, {
        to: l.parent_email,
        template: 'parent_teacher_subjects_reduced',
        payload: {
          name: l.parent_name ?? '',
          teacher: teacher?.name ?? '',
          child: l.child,
          teachersUrl: `${opts.baseUrl}/parent/teachers`,
        },
        dedupeKey: `link_reduced:${l.id}:${now.getTime()}`,
      });
      await writeAudit(
        tx,
        {
          type: 'TEACHER_LINK_SUBJECTS_REDUCED',
          outcome: 'success',
          subjectId: teacherId,
          details: { link: l.id, removed: dropped.join(',') },
        },
        now,
      );
    }
    if (opts.activate && l.parent_email && !told.has(l.parent_email)) {
      told.add(l.parent_email);
      await queueEmail(tx, {
        to: l.parent_email,
        template: 'parent_teacher_approved',
        payload: {
          name: l.parent_name ?? '',
          teacher: teacher?.name ?? '',
          teachersUrl: `${opts.baseUrl}/parent/teachers`,
        },
        dedupeKey: `parent_teacher_decision:${teacherId}:${l.parent_email}:approved`,
      });
    }
  }
}

/** On rejection the waiting links stay (no access) so the parent sees "Not approved" (board 57). */
export async function parentsToTellOfRejection(
  tx: Db,
  teacherId: string,
): Promise<Array<{ email: string; name: string }>> {
  return tx<Array<{ email: string; name: string }>>`
    SELECT DISTINCT p.email, p.display_name AS name
    FROM teacher_student_links l JOIN accounts p ON p.id = l.created_by_parent_id AND p.status = 'active'
    WHERE l.teacher_id = ${teacherId} AND l.status <> 'removed'`;
}

// ------------------------------------------------------------------ the teacher's side

export interface LinkedStudent {
  id: string;
  name: string;
  grade: number;
  subjects: string[];
}

/**
 * The one access check (OC-36(5), OC-41): may this teacher see this child (and, if given, this
 * subject)? True only for an approved, active teacher with an active link, while the child has
 * an active parent (OC-72).
 */
export async function teacherMaySee(sql: Db, teacherId: string, studentId: string, subject?: string): Promise<boolean> {
  if (!UUID.test(teacherId) || !UUID.test(studentId)) return false;
  const [row] = await sql<Array<{ ok: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM teacher_student_links l
      JOIN accounts t ON t.id = l.teacher_id AND t.role = 'teacher' AND t.status = 'active'
      JOIN teacher_profiles tp ON tp.account_id = t.id AND tp.approval_status = 'approved'
      JOIN accounts c ON c.id = l.student_id AND c.status = 'active'
      WHERE l.teacher_id = ${teacherId} AND l.student_id = ${studentId} AND l.status = 'active'
        AND (${subject ?? null}::text IS NULL
             OR (${subject ?? null}::text = ANY(l.subjects) AND ${subject ?? null}::text = ANY(tp.subjects)))
        AND EXISTS (SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
                    WHERE g.student_id = c.id AND g.status = 'active' AND p.status = 'active')
    ) AS ok`;
  return Boolean(row?.ok);
}

/** The teacher's Students page: active links only, first name, grade and ticked subjects. */
export async function listLinkedStudents(sql: Db, teacherId: string): Promise<LinkedStudent[]> {
  if (!UUID.test(teacherId)) return [];
  const rows = await sql<Array<{ id: string; name: string; grade: number; subjects: string[] }>>`
    SELECT c.id, c.display_name AS name, sp.grade,
           ARRAY(SELECT unnest(l.subjects) INTERSECT SELECT unnest(tp.subjects) ORDER BY 1) AS subjects
    FROM teacher_student_links l
    JOIN accounts t ON t.id = l.teacher_id AND t.status = 'active'
    JOIN teacher_profiles tp ON tp.account_id = t.id AND tp.approval_status = 'approved'
    JOIN accounts c ON c.id = l.student_id AND c.status = 'active'
    JOIN student_profiles sp ON sp.account_id = c.id
    WHERE l.teacher_id = ${teacherId} AND l.status = 'active'
      AND EXISTS (SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
                  WHERE g.student_id = c.id AND g.status = 'active' AND p.status = 'active')
    ORDER BY c.display_name, c.id`;
  return rows.map((r) => ({ id: r.id, name: r.name, grade: Number(r.grade), subjects: r.subjects }));
}

export async function getLinkedStudent(sql: Db, teacherId: string, studentId: string): Promise<LinkedStudent | null> {
  if (!(await teacherMaySee(sql, teacherId, studentId))) return null;
  return (await listLinkedStudents(sql, teacherId)).find((s) => s.id === studentId) ?? null;
}
