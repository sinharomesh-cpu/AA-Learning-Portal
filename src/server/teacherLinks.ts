import 'server-only';
import { SUBJECT_IDS } from '@/fixtures/subjects';
import {
  addDays,
  cleanText,
  DECLINE_NOTE_MAX,
  DECLINE_WAIT_DAYS,
  type DeclineReason,
  ENDED_SHOWN_DAYS,
  isDeclineReason,
  MESSAGE_MAX,
  REQUEST_DAYS,
  type RequestState,
} from '@/lib/linkRequests';
import { looksLikeEmail, normaliseEmail } from './auth/accounts';
import { writeAudit } from './auth/audit';
import { queueEmail } from './auth/outbox';
import { issueSetPassword } from './auth/setPasswordLink';
import type { Db, Sql } from './db/client';
import { closeLessonsWithoutLink, type KeepScope } from './lessons';
import { linkRequestAnswered, linkRequestExpired, linkRequestReceived } from './notifications/events';
import { inTx } from './notifications/notify';
import type { ExpiryScope } from './teacherEnquiries';

/**
 * Parent–teacher linking (PR2; boards 57, 58, M-25; OC-36, OC-41, OC-62) with the teacher's
 * acceptance of each child (CR-12 Point 1; FR-038; boards TR1–TR5; OC-97, OC-101).
 *
 * A teacher sees a child only through an active `teacher_student_links` row, and only for the
 * subjects the parent ticked. Since CR-12 a parent's choice is a REQUEST per child that the
 * teacher accepts or declines; requests in any state give no access. Links that were already
 * active before CR-12 stay as they are (decision 4). Parents manage requests and links for their
 * own children only; every function takes the parent or teacher id from the server-side session
 * and checks again here, and migration 0020 enforces the lifecycle in the database too.
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

/** Live row states in the database. */
type LiveStatus = 'pending' | 'requested' | 'active';

export interface MyTeacherChild {
  linkId: string;
  childId: string;
  name: string;
  subjects: string[];
  status: RequestState;
  /** When the request reached the teacher (null before AA Pro approval, and for links made before CR-12). */
  requestedAt: Date | null;
  expiresAt: Date | null;
  /** When the teacher accepted or declined. */
  answeredAt: Date | null;
  /** When a declined, expired or withdrawn request ended. */
  endedAt: Date | null;
  declineReason: DeclineReason | null;
  declineNote: string | null;
  /** After a decline: the first day the parent may ask this teacher for this child again. */
  askAgainFrom: Date | null;
}

export interface MyTeacher {
  id: string;
  name: string;
  /** active: approved and usable; waiting: AA Pro approval pending; not_approved: rejected; inactive: deactivated. */
  state: 'active' | 'waiting' | 'not_approved' | 'inactive';
  /** The subjects on the teacher's approved profile (for information). */
  teaches: string[];
  children: MyTeacherChild[];
  addedAt: Date;
}

const LIVE: readonly string[] = ['pending', 'requested', 'active'];
export const isLive = (s: RequestState) => LIVE.includes(s);

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

const firstName = (name: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * FR-038.6: waiting requests older than 14 days expire. Safe to call on every page; the parent
 * is told in AA Pro (My teachers) and an email is queued (never claimed as delivered).
 * CR-16: the expiry, its audit, the email and the parent's in-app notification are one
 * transaction (§13.2 (2)). With `scope`, only that teacher's requests, or the requests that parent
 * made for a child they are still the active guardian of (§7.6).
 */
export async function expireLinkRequests(sql: Db, now: Date = new Date(), scope?: ExpiryScope): Promise<number> {
  if (scope && !(scope.teacherId && UUID.test(scope.teacherId)) && !(scope.parentId && UUID.test(scope.parentId))) {
    return 0;
  }
  return inTx(sql, async (tx) => {
    const rows = await tx<
      Array<{
        id: string;
        teacher: string;
        teacher_id: string;
        parent: string | null;
        email: string | null;
        child: string;
      }>
    >`
      WITH e AS (
        UPDATE teacher_student_links l SET status = 'removed', removed_at = expires_at, ended_as = 'expired'
        WHERE status = 'requested' AND expires_at <= ${now}
          ${scope?.teacherId ? tx`AND l.teacher_id = ${scope.teacherId}` : tx``}
          ${
            scope?.parentId
              ? tx`AND l.created_by_parent_id = ${scope.parentId}
                   AND EXISTS (SELECT 1 FROM guardian_links g WHERE g.parent_id = ${scope.parentId}
                                 AND g.student_id = l.student_id AND g.status = 'active')`
              : tx``
          }
        RETURNING id, teacher_id, student_id, created_by_parent_id)
      SELECT e.id, e.teacher_id, t.display_name AS teacher, p.display_name AS parent, p.email, c.display_name AS child
      FROM e JOIN accounts t ON t.id = e.teacher_id JOIN accounts c ON c.id = e.student_id
      LEFT JOIN accounts p ON p.id = e.created_by_parent_id AND p.status = 'active'`;
    for (const r of rows) {
      await writeAudit(
        tx,
        { type: 'LINK_REQUEST_EXPIRED', outcome: 'success', subjectId: r.teacher_id, details: { request: r.id } },
        now,
      );
      if (r.email) {
        await queueEmail(tx, {
          to: r.email,
          template: 'parent_link_request_expired',
          payload: { name: firstName(r.parent), teacher: r.teacher, child: r.child },
          dedupeKey: `link_request_expired:${r.id}`,
        });
      }
      await linkRequestExpired(tx, r.id, now);
    }
    return rows.length;
  });
}

/** Board 57 / TR2: the parent's teachers, with every live link or request and recently ended requests. */
export async function listMyTeachers(sql: Db, parentId: string, now: Date = new Date()): Promise<MyTeacher[]> {
  if (!UUID.test(parentId)) return [];
  await expireLinkRequests(sql, now);
  const shownSince = addDays(now, -ENDED_SHOWN_DAYS);
  const rows = await sql<
    Array<{
      link_id: string;
      teacher_id: string;
      name: string;
      status: string;
      approval: string;
      teaches: string[];
      child_id: string;
      child_name: string;
      subjects: string[];
      link_status: LiveStatus | 'removed';
      ended_as: 'declined' | 'expired' | 'withdrawn' | null;
      created_at: Date;
      requested_at: Date | null;
      expires_at: Date | null;
      answered_at: Date | null;
      removed_at: Date | null;
      decline_reason: DeclineReason | null;
      decline_note: string | null;
    }>
  >`
    SELECT l.id AS link_id, t.id AS teacher_id, t.display_name AS name, t.status, tp.approval_status AS approval,
           tp.subjects AS teaches, c.id AS child_id, c.display_name AS child_name, l.subjects,
           l.status AS link_status, l.ended_as, l.created_at, l.requested_at, l.expires_at, l.answered_at,
           l.removed_at, l.decline_reason, l.decline_note
    FROM teacher_student_links l
    JOIN guardian_links g ON g.student_id = l.student_id AND g.parent_id = ${parentId} AND g.status = 'active'
    JOIN accounts t ON t.id = l.teacher_id
    JOIN teacher_profiles tp ON tp.account_id = t.id
    JOIN accounts c ON c.id = l.student_id
    WHERE l.status <> 'removed'
       -- The latest ended request per teacher and child, for a while, unless something newer is live.
       OR (l.ended_as IS NOT NULL AND l.removed_at > ${shownSince}
           AND NOT EXISTS (SELECT 1 FROM teacher_student_links n
                           WHERE n.teacher_id = l.teacher_id AND n.student_id = l.student_id
                             AND (n.status <> 'removed' OR (n.ended_as IS NOT NULL AND n.removed_at > l.removed_at))))
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
    const status: RequestState = r.link_status === 'removed' ? r.ended_as! : r.link_status;
    t.children.push({
      linkId: r.link_id,
      childId: r.child_id,
      name: r.child_name,
      subjects: r.subjects,
      status,
      requestedAt: r.requested_at,
      expiresAt: r.expires_at,
      answeredAt: r.answered_at,
      endedAt: r.link_status === 'removed' ? r.removed_at : null,
      declineReason: r.decline_reason,
      declineNote: r.decline_note,
      askAgainFrom: status === 'declined' && r.removed_at ? addDays(r.removed_at, DECLINE_WAIT_DAYS) : null,
    });
  }
  return [...byTeacher.values()];
}

export type AddTeacherResult =
  | { ok: true; outcome: 'sent' | 'waiting_approval'; teacherName: string; expiresAt: Date | null }
  | {
      ok: false;
      reason: 'name' | 'email' | 'choose' | 'subjects' | 'cannot_add' | 'too_many' | 'not_allowed' | 'message';
    }
  /** OC-75: an approved teacher can only be linked for subjects on their approved profile. */
  | { ok: false; reason: 'not_taught'; teacherName: string; teaches: string[] }
  /** FR-038.8: every ticked child already has a link or a waiting request with this teacher. */
  | { ok: false; reason: 'already'; teacherName: string }
  /** FR-038.8: the teacher declined this child less than 7 days ago. */
  | { ok: false; reason: 'wait'; teacherName: string; child: string; until: Date };

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

type SendOutcome = { created: string[]; skipped: string[] } | { wait: { childId: string; until: Date } };

/**
 * FR-038.1/.8: one request per child. A child that already has a live link or waiting request with
 * this teacher is left as it is (board TR1 "nothing changes"). The 7-day wait after a decline is
 * checked here, for every route that creates a request, under the per-pair row lock.
 */
async function sendRequests(
  tx: Db,
  parentId: string,
  teacherId: string,
  picked: ChildSubjects[],
  status: 'pending' | 'requested',
  message: string | null,
  now: Date,
): Promise<SendOutcome> {
  // Serialise requests for the same teacher and child (two tabs, or a double click).
  for (const c of [...picked].sort((a, b) => a.childId.localeCompare(b.childId))) {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`link:${teacherId}:${c.childId}`}))`;
  }
  const created: string[] = [];
  const skipped: string[] = [];
  const fresh: ChildSubjects[] = [];
  for (const c of picked) {
    const [live] = await tx<Array<{ id: string }>>`
      SELECT id FROM teacher_student_links
      WHERE teacher_id = ${teacherId} AND student_id = ${c.childId} AND status <> 'removed'`;
    if (live) {
      skipped.push(c.childId);
      continue;
    }
    const [declined] = await tx<Array<{ at: Date }>>`
      SELECT max(removed_at) AS at FROM teacher_student_links
      WHERE teacher_id = ${teacherId} AND student_id = ${c.childId} AND ended_as = 'declined'`;
    if (declined?.at) {
      const until = addDays(declined.at, DECLINE_WAIT_DAYS);
      if (until > now) return { wait: { childId: c.childId, until } };
    }
    fresh.push(c);
  }
  for (const c of fresh) {
    const requestedAt = status === 'requested' ? now : null;
    const expiresAt = status === 'requested' ? addDays(now, REQUEST_DAYS) : null;
    const [row] = await tx<Array<{ id: string }>>`INSERT INTO teacher_student_links
               (teacher_id, student_id, created_by_parent_id, source, status, subjects,
                requested_at, expires_at, parent_message, created_at)
             VALUES (${teacherId}, ${c.childId}, ${parentId}, 'parent_added', ${status}, ${unique(c.subjects)},
                     ${requestedAt}, ${expiresAt}, ${message}, ${now})
             RETURNING id`;
    created.push(c.childId);
    // CR-16 §3: a request that reaches the teacher tells them in AA Pro (held ones on approval).
    if (status === 'requested') await linkRequestReceived(tx, row!.id, now);
  }
  return { created, skipped };
}

/** Tells the teacher a request is waiting. No child names before acceptance (Reading B). */
async function tellTeacher(tx: Db, teacherId: string, count: number, baseUrl: string, now: Date) {
  const [t] = await tx<Array<{ email: string | null; name: string }>>`
    SELECT email, display_name AS name FROM accounts WHERE id = ${teacherId}`;
  if (!t?.email || count === 0) return;
  await queueEmail(tx, {
    to: t.email,
    template: 'teacher_link_request',
    payload: { name: t.name, requests: String(count), requestsUrl: `${baseUrl}/teacher/students` },
    dedupeKey: `link_request:${teacherId}:${now.getTime()}`,
  });
}

/**
 * Board 58 / TR1 (OC-36 as amended by OC-97): ask a teacher, by email, to work with some of the
 * parent's children in some subjects.
 * - An approved, active teacher gets one request per child (14 days to answer).
 * - A new email becomes a parent-added teacher waiting for AA Pro approval; the requests wait
 *   too, and reach the teacher on approval (Reading A).
 * - A teacher still waiting for approval: the requests wait.
 * - Anything else (a parent or admin email, a rejected or closed teacher) gets one neutral answer.
 */
export async function addTeacher(
  sql: Sql,
  parentId: string,
  input: { name: string; email: string; children: ChildSubjects[]; baseUrl: string; message?: string },
  now: Date = new Date(),
): Promise<AddTeacherResult> {
  if (!UUID.test(parentId)) return { ok: false, reason: 'not_allowed' };
  const name = input.name.normalize('NFC').trim().replace(/\s+/g, ' ');
  if ([...name].length < 2 || [...name].length > 80) return { ok: false, reason: 'name' };
  const email = normaliseEmail(input.email.trim());
  if (!looksLikeEmail(email)) return { ok: false, reason: 'email' };
  const message = cleanText(input.message ?? '', MESSAGE_MAX);
  if (message === 'too_long') return { ok: false, reason: 'message' };
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
    let outcome: 'sent' | 'waiting_approval';
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
      outcome = 'waiting_approval';
    } else if (existing.role === 'teacher' && existing.status === 'active' && existing.approval === 'approved') {
      teacherId = existing.id;
      teacherName = existing.name;
      outcome = 'sent';
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
      outcome = 'waiting_approval';
    } else {
      await writeAudit(
        tx,
        { type: 'TEACHER_LINK_REFUSED', outcome: 'denied', actorId: parentId, details: { reason: 'not_linkable' } },
        now,
      );
      return { ok: false, reason: 'cannot_add' };
    }

    const status = outcome === 'sent' ? 'requested' : 'pending';
    const sent = await sendRequests(tx, parentId, teacherId, picked, status, message, now);
    if ('wait' in sent) {
      return refuseWait(tx, parentId, teacherId, teacherName, mine, sent.wait, now);
    }
    if (sent.created.length === 0) return { ok: false, reason: 'already', teacherName };
    if (outcome === 'sent') await tellTeacher(tx, teacherId, sent.created.length, input.baseUrl, now);
    await writeAudit(
      tx,
      {
        type: 'LINK_REQUEST_SENT',
        outcome: 'success',
        actorId: parentId,
        subjectId: teacherId,
        details: { children: sent.created.length, status, newAccount: !existing },
      },
      now,
    );
    return { ok: true, outcome, teacherName, expiresAt: outcome === 'sent' ? addDays(now, REQUEST_DAYS) : null };
  });
}

async function refuseWait(
  tx: Db,
  parentId: string,
  teacherId: string,
  teacherName: string,
  mine: Map<string, { name: string }>,
  wait: { childId: string; until: Date },
  now: Date,
): Promise<{ ok: false; reason: 'wait'; teacherName: string; child: string; until: Date }> {
  await writeAudit(
    tx,
    {
      type: 'LINK_REQUEST_REFUSED',
      outcome: 'denied',
      actorId: parentId,
      subjectId: teacherId,
      details: { reason: 'decline_wait' },
    },
    now,
  );
  return { ok: false, reason: 'wait', teacherName, child: mine.get(wait.childId)?.name ?? '', until: wait.until };
}

export type DirectoryAddResult =
  | { ok: true; teacherName: string; expiresAt: Date }
  | { ok: false; reason: 'choose' | 'subjects' | 'not_listed' | 'not_allowed' | 'message' }
  | { ok: false; reason: 'not_taught'; teacherName: string; teaches: string[] }
  | { ok: false; reason: 'already'; teacherName: string }
  | { ok: false; reason: 'wait'; teacherName: string; child: string; until: Date };

/**
 * Board 65 "Add as my teacher" (PR3; C-1 option (a)) as amended by OC-97: the parent picks a
 * teacher from the directory instead of typing an email, so the email is looked up here and never
 * reaches the parent. Only a teacher the directory lists (approved, active, not hidden) can be
 * asked this way; each child becomes a request the teacher accepts or declines.
 * OC-75: only the teacher's approved subjects that the child studies.
 */
export async function addTeacherFromDirectory(
  sql: Sql,
  parentId: string,
  teacherId: string,
  children: ChildSubjects[],
  extra: { message?: string; baseUrl?: string } = {},
  now: Date = new Date(),
): Promise<DirectoryAddResult> {
  if (!UUID.test(parentId)) return { ok: false, reason: 'not_allowed' };
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_listed' };
  const message = cleanText(extra.message ?? '', MESSAGE_MAX);
  if (message === 'too_long') return { ok: false, reason: 'message' };
  return sql.begin(async (tx): Promise<DirectoryAddResult> => {
    const mine = await ownChildren(tx, parentId);
    if (mine.size === 0) return { ok: false, reason: 'not_allowed' };
    const problem = checkChoice(mine, children);
    if (problem) return { ok: false, reason: problem };
    const picked = children.filter((c) => c.subjects.length > 0);
    const [teacher] = await tx<Array<{ name: string; teaches: string[] }>>`
      SELECT a.display_name AS name, tp.subjects AS teaches
      FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id
      WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'active'
        AND tp.approval_status = 'approved'
        -- A hidden teacher can still be asked by a parent whose enquiry they accepted (OC-77(2)).
        AND (NOT tp.hidden_from_search OR EXISTS (
          SELECT 1 FROM teacher_enquiries e
          WHERE e.parent_id = ${parentId} AND e.teacher_id = a.id AND e.status = 'accepted'))
      FOR SHARE OF a, tp`;
    if (!teacher) {
      await writeAudit(
        tx,
        { type: 'TEACHER_LINK_REFUSED', outcome: 'denied', actorId: parentId, details: { reason: 'not_listed' } },
        now,
      );
      return { ok: false, reason: 'not_listed' };
    }
    if (!picked.every((c) => c.subjects.every((x) => teacher.teaches.includes(x)))) {
      return { ok: false, reason: 'not_taught', teacherName: teacher.name, teaches: teacher.teaches };
    }
    const sent = await sendRequests(tx, parentId, teacherId, picked, 'requested', message, now);
    if ('wait' in sent) return refuseWait(tx, parentId, teacherId, teacher.name, mine, sent.wait, now);
    if (sent.created.length === 0) return { ok: false, reason: 'already', teacherName: teacher.name };
    await tellTeacher(tx, teacherId, sent.created.length, extra.baseUrl ?? '', now);
    await writeAudit(
      tx,
      {
        type: 'LINK_REQUEST_SENT',
        outcome: 'success',
        actorId: parentId,
        subjectId: teacherId,
        details: { children: sent.created.length, status: 'requested', newAccount: false, from: 'directory' },
      },
      now,
    );
    return { ok: true, teacherName: teacher.name, expiresAt: addDays(now, REQUEST_DAYS) };
  });
}

export type UpdateLinksResult =
  | { ok: true; removed: boolean; requested: number }
  | { ok: false; reason: 'subjects' | 'not_found' | 'not_allowed' }
  | { ok: false; reason: 'wait'; child: string; until: Date };

/**
 * "Change children and subjects" (board 57). The choice replaces the teacher's links and requests
 * for this parent's children: a child left out loses the link at once (a waiting request is
 * withdrawn). Changing the subjects of an active link needs no new acceptance (OC-41(4),
 * FR-038.9); a newly ticked child becomes a request the teacher accepts. Unticking everything
 * removes the teacher. Links to other families' children are never touched.
 */
export async function updateTeacherLinks(
  sql: Sql,
  parentId: string,
  teacherId: string,
  children: ChildSubjects[],
  now: Date = new Date(),
  baseUrl = '',
): Promise<UpdateLinksResult> {
  if (!UUID.test(parentId) || !UUID.test(teacherId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<UpdateLinksResult> => {
    const mine = await ownChildren(tx, parentId);
    if (mine.size === 0) return { ok: false, reason: 'not_allowed' };
    await expireLinkRequests(tx, now);
    const live = await tx<Array<{ id: string; student_id: string; status: LiveStatus; subjects: string[] }>>`
      SELECT id, student_id, status, subjects FROM teacher_student_links
      WHERE teacher_id = ${teacherId} AND status <> 'removed' AND student_id = ANY(${[...mine.keys()]}) FOR UPDATE`;
    if (live.length === 0) return { ok: false, reason: 'not_found' };
    const picked = children.filter((c) => c.subjects.length > 0);
    if (picked.length === 0) {
      await removeLinks(tx, parentId, teacherId, live, now);
      return { ok: true, removed: true, requested: 0 };
    }
    const problem = checkChoice(mine, picked);
    if (problem === 'choose') return { ok: false, reason: 'subjects' };
    if (problem) return { ok: false, reason: problem === 'not_allowed' ? 'not_allowed' : 'subjects' };
    const [teacher] = await tx<Array<{ ok: boolean }>>`
      SELECT (a.status = 'active' AND tp.approval_status = 'approved') AS ok
      FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id WHERE a.id = ${teacherId}`;
    if (teacher?.ok) {
      const teaches = await approvedSubjects(tx, teacherId);
      if (!picked.every((c) => c.subjects.every((x) => teaches.includes(x)))) return { ok: false, reason: 'subjects' };
    }
    const byChild = new Map(live.map((l) => [l.student_id, l]));
    const fresh = picked.filter((c) => !byChild.has(c.childId));
    // New children become requests (to the teacher once approved, otherwise waiting for approval).
    const sent = await sendRequests(tx, parentId, teacherId, fresh, teacher?.ok ? 'requested' : 'pending', null, now);
    if ('wait' in sent) {
      await refuseWait(tx, parentId, teacherId, '', mine, sent.wait, now);
      return { ok: false, reason: 'wait', child: mine.get(sent.wait.childId)?.name ?? '', until: sent.wait.until };
    }
    const keep = new Set(picked.map((c) => c.childId));
    await removeLinks(
      tx,
      parentId,
      teacherId,
      live.filter((l) => !keep.has(l.student_id)),
      now,
    );
    const unticked: KeepScope[] = [];
    for (const c of picked) {
      const l = byChild.get(c.childId);
      if (l && unique(l.subjects).join() !== unique(c.subjects).join()) {
        await tx`UPDATE teacher_student_links SET subjects = ${unique(c.subjects)} WHERE id = ${l.id}`;
        // OD-A: only the subjects this parent unticked on an active link (a waiting request has no lessons).
        const gone = l.subjects.filter((x) => !c.subjects.includes(x));
        if (l.status === 'active' && gone.length) unticked.push({ childId: c.childId, subjects: gone });
      }
    }
    // D3A-24 with OC-53 Option A (scope OD-A): lessons in an unticked subject are closed by AA Pro,
    // except those starting within 30 minutes; other subjects and children are not affected.
    // (Removed children were handled by removeLinks above.)
    await closeLessonsWithoutLink(tx, { teacherId }, now, { keepSoonFor: { parentId, scope: unticked } });
    if (teacher?.ok) await tellTeacher(tx, teacherId, sent.created.length, baseUrl, now);
    await writeAudit(
      tx,
      {
        type: 'TEACHER_LINK_CHANGED',
        outcome: 'success',
        actorId: parentId,
        subjectId: teacherId,
        details: { children: picked.length, newRequests: sent.created.length },
      },
      now,
    );
    return { ok: true, removed: false, requested: sent.created.length };
  });
}

/** "Remove teacher" / "Cancel request" (board 57): ends every link and request for this parent's children. */
export async function removeTeacher(
  sql: Sql,
  parentId: string,
  teacherId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  if (!UUID.test(parentId) || !UUID.test(teacherId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx) => {
    const mine = await ownChildren(tx, parentId);
    const live = await tx<Array<{ id: string; student_id: string; status: LiveStatus }>>`
      SELECT id, student_id, status FROM teacher_student_links
      WHERE teacher_id = ${teacherId} AND status <> 'removed' AND student_id = ANY(${[...mine.keys()]}) FOR UPDATE`;
    if (live.length === 0) return { ok: false as const, reason: 'not_found' as const };
    await removeLinks(tx, parentId, teacherId, live, now);
    return { ok: true as const };
  });
}

export type WithdrawResult = { ok: true } | { ok: false; reason: 'not_found' | 'answered' };

/** FR-038.7 / TR2: the parent withdraws one waiting request. It can never be accepted afterwards. */
export async function withdrawLinkRequest(
  sql: Sql,
  parentId: string,
  linkId: string,
  now: Date = new Date(),
): Promise<WithdrawResult> {
  if (!UUID.test(parentId) || !UUID.test(linkId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<WithdrawResult> => {
    const mine = await ownChildren(tx, parentId);
    const [row] = await tx<Array<{ id: string; teacher_id: string; status: string; expires_at: Date | null }>>`
      SELECT id, teacher_id, status, expires_at FROM teacher_student_links
      WHERE id = ${linkId} AND student_id = ANY(${[...mine.keys()]}) FOR UPDATE`;
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.status === 'requested' && row.expires_at && row.expires_at <= now) {
      await expireLinkRequests(tx, now);
      return { ok: false, reason: 'answered' };
    }
    if (row.status !== 'pending' && row.status !== 'requested') return { ok: false, reason: 'answered' };
    await removeLinks(tx, parentId, row.teacher_id, [{ id: row.id, status: row.status }], now);
    return { ok: true };
  });
}

export type ResendResult =
  | { ok: true; teacherName: string; outcome: 'sent' | 'waiting_approval' }
  | { ok: false; reason: 'not_found' | 'already' | 'cannot_add' | 'subjects' }
  | { ok: false; reason: 'wait'; until: Date };

/**
 * TR2 "Send again": a new request for a child whose earlier request expired, was withdrawn, or
 * was declined more than 7 days ago. Same subjects, limited to what the child still studies and
 * the teacher is still approved for.
 */
export async function resendLinkRequest(
  sql: Sql,
  parentId: string,
  linkId: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<ResendResult> {
  if (!UUID.test(parentId) || !UUID.test(linkId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<ResendResult> => {
    const mine = await ownChildren(tx, parentId);
    const [row] = await tx<
      Array<{
        teacher_id: string;
        student_id: string;
        subjects: string[];
        status: string;
        approval: string;
        name: string;
      }>
    >`
      SELECT l.teacher_id, l.student_id, l.subjects, a.status, tp.approval_status AS approval, a.display_name AS name
      FROM teacher_student_links l
      JOIN accounts a ON a.id = l.teacher_id JOIN teacher_profiles tp ON tp.account_id = a.id
      WHERE l.id = ${linkId} AND l.ended_as IS NOT NULL AND l.student_id = ANY(${[...mine.keys()]})`;
    if (!row) return { ok: false, reason: 'not_found' };
    const approved = row.status === 'active' && row.approval === 'approved';
    const waiting = row.status === 'pending_approval' && row.approval !== 'rejected';
    if (!approved && !waiting) return { ok: false, reason: 'cannot_add' };
    const studies = mine.get(row.student_id)!.subjects;
    const teaches = approved ? await approvedSubjects(tx, row.teacher_id) : null;
    const subjects = row.subjects.filter((s) => studies.includes(s) && (!teaches || teaches.includes(s)));
    if (subjects.length === 0) return { ok: false, reason: 'subjects' };
    const sent = await sendRequests(
      tx,
      parentId,
      row.teacher_id,
      [{ childId: row.student_id, subjects }],
      approved ? 'requested' : 'pending',
      null,
      now,
    );
    if ('wait' in sent) {
      await refuseWait(tx, parentId, row.teacher_id, row.name, mine, sent.wait, now);
      return { ok: false, reason: 'wait', until: sent.wait.until };
    }
    if (sent.created.length === 0) return { ok: false, reason: 'already' };
    if (approved) await tellTeacher(tx, row.teacher_id, 1, baseUrl, now);
    await writeAudit(
      tx,
      {
        type: 'LINK_REQUEST_SENT',
        outcome: 'success',
        actorId: parentId,
        subjectId: row.teacher_id,
        details: { children: 1, status: approved ? 'requested' : 'pending', again: true },
      },
      now,
    );
    return { ok: true, teacherName: row.name, outcome: approved ? 'sent' : 'waiting_approval' };
  });
}

async function removeLinks(
  tx: Db,
  parentId: string,
  teacherId: string,
  links: Array<{ id: string; status: string }>,
  now: Date,
): Promise<void> {
  if (links.length === 0) return;
  const active = links.filter((l) => l.status === 'active').map((l) => l.id);
  const waiting = links.filter((l) => l.status !== 'active').map((l) => l.id);
  if (active.length) {
    await tx`UPDATE teacher_student_links SET status = 'removed', removed_at = ${now} WHERE id = ANY(${active})`;
    await writeAudit(
      tx,
      {
        type: 'TEACHER_LINK_REMOVED',
        outcome: 'success',
        actorId: parentId,
        subjectId: teacherId,
        details: { children: active.length },
      },
      now,
    ); // D3A-24 with OC-53 Option A: AA Pro closes requests and cancels that child's upcoming lessons
    // with this teacher, except lessons starting within the next 30 minutes, which stay scheduled.
    const children = await tx<Array<{ student_id: string }>>`
      SELECT student_id FROM teacher_student_links WHERE id = ANY(${active})`;
    await closeLessonsWithoutLink(tx, { teacherId }, now, {
      keepSoonFor: { parentId, scope: children.map((c) => ({ childId: c.student_id })) },
    });
  }
  if (waiting.length) {
    await tx`UPDATE teacher_student_links SET status = 'removed', removed_at = ${now}, ended_as = 'withdrawn'
             WHERE id = ANY(${waiting})`;
    await writeAudit(
      tx,
      {
        type: 'LINK_REQUEST_WITHDRAWN',
        outcome: 'success',
        actorId: parentId,
        subjectId: teacherId,
        details: { children: waiting.length },
      },
      now,
    );
  }
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
 * OC-75: brings a teacher's links and requests in line with their approved subjects. Each keeps
 * only subjects the teacher is approved for; one left with none ends. With `activate` (teacher
 * approval), requests that were waiting for AA Pro approval go to the teacher, who has 14 days to
 * answer (Reading A, OC-101); nothing becomes active without the teacher's acceptance.
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
      status: LiveStatus;
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
  let sentToTeacher = 0;
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
    if (dropped.length) {
      await tx`UPDATE teacher_student_links SET subjects = ${keep} WHERE id = ${l.id}`;
    }
    if (opts.activate && l.status === 'pending') {
      await tx`UPDATE teacher_student_links
               SET status = 'requested', requested_at = ${now}, expires_at = ${addDays(now, REQUEST_DAYS)}
               WHERE id = ${l.id}`;
      sentToTeacher += 1;
      await linkRequestReceived(tx, l.id, now);
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
  if (sentToTeacher > 0) {
    await writeAudit(
      tx,
      {
        type: 'LINK_REQUEST_SENT',
        outcome: 'success',
        subjectId: teacherId,
        details: { children: sentToTeacher, status: 'requested', onApproval: true },
      },
      now,
    );
    await tellTeacher(tx, teacherId, sentToTeacher, opts.baseUrl, now);
  } // D3A-24: a link or subject that ended because of the teacher's approved subjects ends its lessons.
  await closeLessonsWithoutLink(tx, { teacherId }, now);
}

/** On rejection the waiting requests stay (no access) so the parent sees "Not approved" (board 57). */
export async function parentsToTellOfRejection(
  tx: Db,
  teacherId: string,
): Promise<Array<{ email: string; name: string }>> {
  return tx<Array<{ email: string; name: string }>>`
    SELECT DISTINCT p.email, p.display_name AS name
    FROM teacher_student_links l JOIN accounts p ON p.id = l.created_by_parent_id AND p.status = 'active'
    WHERE l.teacher_id = ${teacherId} AND l.status <> 'removed'`;
}

// ------------------------------------------------------------------ requests, the teacher's side

/** TR3: what the teacher sees before accepting (Reading B). No child name or id. */
export interface LinkRequestForTeacher {
  id: string;
  grade: number;
  curriculum: string | null;
  subjects: string[];
  parentFirstName: string;
  message: string | null;
  requestedAt: Date;
  expiresAt: Date;
}

/** Only an approved, active teacher sees requests. */
async function teacherIsLive(sql: Db, teacherId: string): Promise<boolean> {
  const [row] = await sql<Array<{ ok: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id
                   WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'active'
                     AND tp.approval_status = 'approved') AS ok`;
  return Boolean(row?.ok);
}

/** TR3 "Requests from parents": waiting requests for this teacher, oldest first, minimum details only. */
export async function listLinkRequests(
  sql: Db,
  teacherId: string,
  now: Date = new Date(),
): Promise<LinkRequestForTeacher[]> {
  if (!UUID.test(teacherId)) return [];
  await expireLinkRequests(sql, now);
  if (!(await teacherIsLive(sql, teacherId))) return [];
  const rows = await sql<
    Array<{
      id: string;
      grade: number;
      curriculum: string | null;
      subjects: string[];
      parent: string;
      message: string | null;
      requested_at: Date;
      expires_at: Date;
    }>
  >`
    SELECT l.id, sp.grade, sp.curriculum, l.subjects, p.display_name AS parent, l.parent_message AS message,
           l.requested_at, l.expires_at
    FROM teacher_student_links l
    JOIN student_profiles sp ON sp.account_id = l.student_id
    JOIN accounts p ON p.id = l.created_by_parent_id AND p.status = 'active'
    JOIN guardian_links g ON g.parent_id = p.id AND g.student_id = l.student_id AND g.status = 'active'
    WHERE l.teacher_id = ${teacherId} AND l.status = 'requested' AND l.expires_at > ${now}
    ORDER BY l.requested_at, l.id`;
  return rows.map((r) => ({
    id: r.id,
    grade: Number(r.grade),
    curriculum: r.curriculum,
    subjects: r.subjects,
    parentFirstName: firstName(r.parent),
    message: r.message,
    requestedAt: r.requested_at,
    expiresAt: r.expires_at,
  }));
}

export type AnswerRefusal = 'not_found' | 'expired' | 'withdrawn' | 'answered' | 'not_allowed' | 'not_taught';
export type AcceptResult =
  | { ok: true; studentId: string; childName: string; subjects: string[]; parentFirstName: string }
  | { ok: false; reason: AnswerRefusal };
export type DeclineResult = { ok: true } | { ok: false; reason: AnswerRefusal | 'invalid' };

interface LockedRequest {
  id: string;
  status: string;
  ended_as: string | null;
  expires_at: Date | null;
  subjects: string[];
  student_id: string;
  child: string;
  parent_id: string;
  parent: string | null;
  parent_email: string | null;
  guardian_ok: boolean;
}

/**
 * Locks one request of this teacher and checks it can still be answered. A request that has just
 * passed its expiry date is expired here, so the answer is refused (FR-038.6).
 */
async function lockRequest(
  tx: Db,
  teacherId: string,
  linkId: string,
  now: Date,
): Promise<{ row: LockedRequest } | { reason: AnswerRefusal }> {
  if (!UUID.test(teacherId) || !UUID.test(linkId)) return { reason: 'not_found' };
  const [row] = await tx<LockedRequest[]>`
    SELECT l.id, l.status, l.ended_as, l.expires_at, l.subjects, l.student_id, c.display_name AS child,
           l.created_by_parent_id AS parent_id, p.display_name AS parent,
           CASE WHEN p.status = 'active' THEN p.email END AS parent_email,
           EXISTS (SELECT 1 FROM guardian_links g WHERE g.parent_id = p.id AND g.student_id = l.student_id
                     AND g.status = 'active') AND p.status = 'active' AS guardian_ok
    FROM teacher_student_links l
    JOIN accounts c ON c.id = l.student_id
    JOIN accounts p ON p.id = l.created_by_parent_id
    WHERE l.id = ${linkId} AND l.teacher_id = ${teacherId}
      -- A request reaches the teacher only once AA Pro has approved them.
      AND (l.requested_at IS NOT NULL)
    FOR UPDATE OF l`;
  if (!row) return { reason: 'not_found' };
  if (row.status === 'requested' && row.expires_at && row.expires_at <= now) {
    await expireLinkRequests(tx, now);
    return { reason: 'expired' };
  }
  if (row.status !== 'requested') {
    if (row.ended_as === 'expired') return { reason: 'expired' };
    if (row.ended_as === 'withdrawn') return { reason: 'withdrawn' };
    return { reason: 'answered' };
  }
  if (!row.guardian_ok) return { reason: 'not_found' };
  if (!(await teacherIsLive(tx, teacherId))) return { reason: 'not_allowed' };
  return { row };
}

async function refuseAnswer(
  tx: Db,
  teacherId: string,
  linkId: string,
  kind: 'accept' | 'decline',
  reason: string,
  now: Date,
) {
  await writeAudit(
    tx,
    {
      type: 'LINK_REQUEST_REFUSED',
      outcome: 'denied',
      actorId: UUID.test(teacherId) ? teacherId : undefined,
      details: { reason, kind, ...(UUID.test(linkId) ? { request: linkId } : {}) },
    },
    now,
  );
}

/** FR-038.4 / TR4: the teacher accepts one child. Access starts for that child and those subjects only. */
export async function acceptLinkRequest(
  sql: Sql,
  teacherId: string,
  linkId: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<AcceptResult> {
  return sql.begin(async (tx): Promise<AcceptResult> => {
    const locked = await lockRequest(tx, teacherId, linkId, now);
    if ('reason' in locked) {
      await refuseAnswer(tx, teacherId, linkId, 'accept', locked.reason, now);
      return { ok: false, reason: locked.reason };
    }
    const { row } = locked;
    const teaches = await approvedSubjects(tx, teacherId);
    if (!row.subjects.every((s) => teaches.includes(s))) {
      await refuseAnswer(tx, teacherId, linkId, 'accept', 'not_taught', now);
      return { ok: false, reason: 'not_taught' };
    }
    await tx`UPDATE teacher_student_links SET status = 'active', answered_at = ${now} WHERE id = ${row.id}`;
    await writeAudit(
      tx,
      {
        type: 'LINK_REQUEST_ACCEPTED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: row.student_id,
        details: { request: row.id, subjects: row.subjects.join(',') },
      },
      now,
    );
    const [teacher] = await tx<
      Array<{ name: string }>
    >`SELECT display_name AS name FROM accounts WHERE id = ${teacherId}`;
    if (row.parent_email) {
      await queueEmail(tx, {
        to: row.parent_email,
        template: 'parent_link_request_accepted',
        payload: {
          name: firstName(row.parent),
          teacher: teacher?.name ?? '',
          child: row.child,
          teachersUrl: `${baseUrl}/parent/teachers`,
        },
        dedupeKey: `link_request_answered:${row.id}`,
      });
    }
    await linkRequestAnswered(tx, row.id, 'accept', now);
    return {
      ok: true,
      studentId: row.student_id,
      childName: row.child,
      subjects: row.subjects,
      parentFirstName: firstName(row.parent),
    };
  });
}

/** FR-038.5 / TR4: the teacher declines one child with a reason; never any access. */
export async function declineLinkRequest(
  sql: Sql,
  teacherId: string,
  linkId: string,
  input: { reason: string; note?: string },
  baseUrl: string,
  now: Date = new Date(),
): Promise<DeclineResult> {
  if (!isDeclineReason(input.reason)) return { ok: false, reason: 'invalid' };
  const note = cleanText(input.note ?? '', DECLINE_NOTE_MAX);
  if (note === 'too_long') return { ok: false, reason: 'invalid' };
  const reason = input.reason;
  return sql.begin(async (tx): Promise<DeclineResult> => {
    const locked = await lockRequest(tx, teacherId, linkId, now);
    if ('reason' in locked) {
      await refuseAnswer(tx, teacherId, linkId, 'decline', locked.reason, now);
      return { ok: false, reason: locked.reason };
    }
    const { row } = locked;
    await tx`UPDATE teacher_student_links
             SET status = 'removed', removed_at = ${now}, answered_at = ${now}, ended_as = 'declined',
                 decline_reason = ${reason}, decline_note = ${note}
             WHERE id = ${row.id}`;
    // The reason is audited; the free-text note is not (FR-038.12).
    await writeAudit(
      tx,
      {
        type: 'LINK_REQUEST_DECLINED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: row.student_id,
        details: { request: row.id, reason },
      },
      now,
    );
    const [teacher] = await tx<
      Array<{ name: string }>
    >`SELECT display_name AS name FROM accounts WHERE id = ${teacherId}`;
    if (row.parent_email) {
      await queueEmail(tx, {
        to: row.parent_email,
        template: 'parent_link_request_declined',
        payload: {
          name: firstName(row.parent),
          teacher: teacher?.name ?? '',
          child: row.child,
          teachersUrl: `${baseUrl}/parent/teachers`,
        },
        dedupeKey: `link_request_answered:${row.id}`,
      });
    }
    await linkRequestAnswered(tx, row.id, 'decline', now);
    return { ok: true };
  });
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
