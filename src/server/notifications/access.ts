import 'server-only';
import type { Db } from '../db/client';
import type { EntityType } from './notify';

/**
 * Who may see a notification's record now, and the action label it shows (CR-16 §6.1, §8, §8.1).
 * Everything is decided on the server from the current business records each time a list is
 * shown or a notification is opened; nothing comes from the browser except the notification id,
 * which must belong to the signed-in account.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * full: an active parent or student, or an approved, active teacher.
 * awaiting: a teacher awaiting approval (§0) — approval-status and profile notifications only (D-5).
 * none: not approved (Q-2), Super Admin / Admin (D-6), or an account that is not active.
 */
export type Standing = 'full' | 'awaiting' | 'none';

export interface NotificationViewer {
  id: string;
  role: 'parent' | 'teacher' | 'student';
  standing: Standing;
}

/** The signed-in account as the database sees it now. `accountId` comes from the session only. */
export async function loadViewer(sql: Db, accountId: string): Promise<NotificationViewer | null> {
  if (!UUID.test(accountId)) return null;
  const [a] = await sql<Array<{ role: string; status: string; approval: string | null }>>`
    SELECT a.role, a.status, t.approval_status AS approval
    FROM accounts a LEFT JOIN teacher_profiles t ON t.account_id = a.id WHERE a.id = ${accountId}`;
  if (!a || (a.role !== 'parent' && a.role !== 'teacher' && a.role !== 'student')) return null;
  let standing: Standing = 'none';
  if (a.role === 'teacher') {
    if (a.status === 'active' && a.approval === 'approved') standing = 'full';
    else if (a.status === 'pending_approval' && ['draft', 'submitted', 'changes_requested'].includes(a.approval ?? ''))
      standing = 'awaiting';
  } else if (a.status === 'active') {
    standing = 'full';
  }
  return { id: accountId, role: a.role, standing };
}

export interface StoredNotification {
  id: string;
  kind: 'action' | 'update' | 'reminder';
  type: string;
  title: string;
  body: string;
  href: string;
  entity_type: EntityType;
  entity_id: string;
  offer_seq: number | null;
  created_at: Date;
  read_at: Date | null;
}

const one = async (q: PromiseLike<ArrayLike<unknown>>) => (await q).length > 0;

/**
 * §8: may this viewer still see the record behind this notification? The same rules as the
 * destination pages: guardian relationship, teacher–child link, sharing, account status and
 * approval (the five D-8 causes). A notification never grants access (D-8).
 */
export async function mayStillSee(sql: Db, v: NotificationViewer, n: StoredNotification): Promise<boolean> {
  if (v.standing === 'none') return false;
  // D-5: a teacher awaiting approval sees approval-status and profile notifications only.
  if (v.standing === 'awaiting') return n.entity_type === 'teacher_profile' && n.entity_id === v.id;
  const id = n.entity_id;
  switch (n.entity_type) {
    case 'teacher_profile':
      return v.role === 'teacher' && id === v.id;
    case 'enquiry':
      if (v.role === 'teacher')
        return one(sql`SELECT 1 FROM teacher_enquiries WHERE id = ${id} AND teacher_id = ${v.id}`);
      if (v.role === 'parent')
        return one(sql`SELECT 1 FROM teacher_enquiries WHERE id = ${id} AND parent_id = ${v.id}`);
      return false;
    case 'rate_proposal':
      if (v.role === 'teacher')
        return one(sql`SELECT 1 FROM rate_negotiations WHERE id = ${id} AND teacher_id = ${v.id}`);
      if (v.role === 'parent')
        return one(sql`SELECT 1 FROM rate_negotiations WHERE id = ${id} AND parent_id = ${v.id}`);
      return false;
    case 'link_request':
      if (v.role === 'parent') {
        // Only while still the child's active guardian (cause 1).
        return one(sql`
          SELECT 1 FROM teacher_student_links l
          JOIN guardian_links g ON g.student_id = l.student_id AND g.parent_id = ${v.id} AND g.status = 'active'
          WHERE l.id = ${id}`);
      }
      if (v.role === 'teacher') {
        return one(sql`
          SELECT 1 FROM teacher_student_links l
          JOIN accounts c ON c.id = l.student_id
          WHERE l.id = ${id} AND l.teacher_id = ${v.id} AND (
            -- Waiting: as "Requests from parents" — the parent who asked is active and still the
            -- child's active guardian (causes 1 and 4).
            (l.status = 'requested' AND EXISTS (
               SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id AND p.status = 'active'
               WHERE g.parent_id = l.created_by_parent_id AND g.student_id = l.student_id AND g.status = 'active'))
            -- Accepted: as teacherMaySee — the child is active with an active parent.
            OR (l.status = 'active' AND c.status = 'active' AND EXISTS (
               SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id AND p.status = 'active'
               WHERE g.student_id = l.student_id AND g.status = 'active'))
            -- A request that ended without a link (declined, withdrawn, expired) stays visible as
            -- history: the notification itself never named the child. A teacher–child link that
            -- was removed after acceptance ends access (cause 2).
            OR (l.status = 'removed' AND l.ended_as IS NOT NULL))`);
      }
      return false;
    case 'resource_share': {
      const shared = sql`
        SELECT s.student_id FROM resource_shares s
        JOIN teacher_resources r ON r.id = s.resource_id AND r.archived_at IS NULL
        JOIN stored_files f ON f.id = r.file_id AND f.deleted_at IS NULL
        WHERE s.id = ${id} AND s.unshared_at IS NULL`;
      if (v.role === 'student') return one(sql`SELECT 1 FROM (${shared}) x WHERE x.student_id = ${v.id}`);
      if (v.role === 'parent') {
        return one(sql`
          SELECT 1 FROM (${shared}) x
          JOIN guardian_links g ON g.student_id = x.student_id AND g.parent_id = ${v.id} AND g.status = 'active'`);
      }
      return false;
    }
    case 'assignment': {
      // CR-17 PR 5: the student's own visible homework; a parent's own child's; the teacher's own
      // homework while linked to that child in its subject (W-11).
      const target = sql`
        SELECT t.student_id, a.teacher_id, a.subject, a.visible_from FROM assignment_targets t
        JOIN assignments a ON a.id = t.assignment_id WHERE t.id = ${id}`;
      if (v.role === 'student') {
        return one(sql`SELECT 1 FROM (${target}) x WHERE x.student_id = ${v.id} AND x.visible_from <= now()`);
      }
      if (v.role === 'parent') {
        return one(sql`
          SELECT 1 FROM (${target}) x
          JOIN guardian_links g ON g.student_id = x.student_id AND g.parent_id = ${v.id} AND g.status = 'active'
          WHERE x.visible_from <= now()`);
      }
      if (v.role === 'teacher') {
        return one(sql`
          SELECT 1 FROM (${target}) x
          JOIN teacher_student_links l ON l.teacher_id = x.teacher_id AND l.student_id = x.student_id
            AND l.status = 'active' AND x.subject = ANY (l.subjects)
          WHERE x.teacher_id = ${v.id}`);
      }
      return false;
    }
    case 'lesson':
      // CR-17 PR 2: a parent while an active parent of the child (D3A-25); the lesson's own teacher
      // (their notifications never name the child; the schedule shows linked children only).
      // Children get only their own lesson reminders (CR-17 PR 7).
      if (v.role === 'parent') {
        return one(sql`
          SELECT 1 FROM lessons l
          JOIN guardian_links g ON g.student_id = l.student_id AND g.parent_id = ${v.id} AND g.status = 'active'
          WHERE l.id = ${id}`);
      }
      if (v.role === 'teacher') return one(sql`SELECT 1 FROM lessons WHERE id = ${id} AND teacher_id = ${v.id}`);
      // CR-17 PR 7: a child sees only the reminder for their own lesson.
      if (v.role === 'student') return one(sql`SELECT 1 FROM lessons WHERE id = ${id} AND student_id = ${v.id}`);
      return false;
    case 'material_request':
      // TL-2 (TL2-6): an active parent of the lesson's child; the lesson's own teacher. Never the child.
      if (v.role === 'parent') {
        return one(sql`
          SELECT 1 FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
          JOIN guardian_links g ON g.student_id = l.student_id AND g.parent_id = ${v.id} AND g.status = 'active'
          WHERE m.id = ${id}`);
      }
      if (v.role === 'teacher') {
        return one(sql`
          SELECT 1 FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
          WHERE m.id = ${id} AND l.teacher_id = ${v.id}`);
      }
      return false;
    case 'listing':
      return v.role === 'teacher' && one(sql`SELECT 1 FROM teacher_listings WHERE id = ${id} AND teacher_id = ${v.id}`);
    case 'learning_package':
      // The package may since have been removed (rollback); the page it opens is the teacher's own.
      return (
        v.role === 'teacher' &&
        !(await one(sql`SELECT 1 FROM learning_packages WHERE id = ${id} AND teacher_id <> ${v.id}`))
      );
    default:
      return false;
  }
}

export type ActionLabel = 'Needs your reply' | 'Done' | 'No longer needed';

/**
 * §6.1 (D-1): the label of an action notification, from the current business record only —
 * never from read status. Reading it changes nothing. Update and reminder notifications have none.
 */
export async function actionLabel(
  sql: Db,
  v: Pick<NotificationViewer, 'id' | 'role'>,
  n: Pick<StoredNotification, 'kind' | 'entity_type' | 'entity_id' | 'offer_seq'>,
  now: Date,
): Promise<ActionLabel | null> {
  if (n.kind !== 'action' || v.role === 'student') return null;
  const id = n.entity_id;
  switch (n.entity_type) {
    case 'enquiry': {
      const [e] = await sql<Array<{ status: string; expires_at: Date }>>`
        SELECT status, expires_at FROM teacher_enquiries WHERE id = ${id}`;
      if (!e) return 'No longer needed';
      if (e.status === 'pending' && e.expires_at > now) return 'Needs your reply';
      if (e.status === 'accepted' || e.status === 'declined') return 'Done';
      return 'No longer needed';
    }
    case 'link_request': {
      const [l] = await sql<
        Array<{ status: string; ended_as: string | null; answered_at: Date | null; expires_at: Date | null }>
      >`SELECT status, ended_as, answered_at, expires_at FROM teacher_student_links WHERE id = ${id}`;
      if (!l) return 'No longer needed';
      if (l.status === 'requested') return l.expires_at && l.expires_at > now ? 'Needs your reply' : 'No longer needed';
      if (l.status === 'active') return 'Done';
      if (l.ended_as === 'declined') return 'Done';
      // Accepted, then the teacher–child link ended: still "Done".
      if (l.status === 'removed' && l.ended_as === null && l.answered_at !== null) return 'Done';
      return 'No longer needed';
    }
    case 'rate_proposal': {
      const [r] = await sql<
        Array<{ status: string; turn: string | null; offers: number; expires_at: Date; ended_by: string | null }>
      >`SELECT status, turn, offers, expires_at, ended_by FROM rate_negotiations WHERE id = ${id}`;
      const seq = Number(n.offer_seq ?? 0);
      if (!r || !seq) return 'No longer needed';
      const offers = Number(r.offers);
      const side = v.role;
      // X made a counter-offer to offer n: a later offer exists (turns alternate).
      if (offers > seq) return 'Done';
      if ((r.status === 'accepted' || r.status === 'declined') && r.ended_by === side) return 'Done';
      if ((r.status === 'pending' || r.status === 'countered') && r.turn === side && r.expires_at > now)
        return 'Needs your reply';
      return 'No longer needed';
    }
    case 'lesson': {
      // CR-17 PR 2: the teacher's lesson request (reply before the deadline) and the outcome request.
      const [l] = await sql<
        Array<{ status: string; overdue: boolean; closed_by: string | null; outcome: string | null }>
      >`
        SELECT status, reply_deadline <= ${now} AS overdue, closed_by, outcome FROM lessons WHERE id = ${id}`;
      if (!l) return 'No longer needed';
      // TL-3: a parent's "proposal waiting" notice needs a reply until it is answered or closes.
      if (v.role === 'parent') {
        if (l.status === 'proposed') return l.overdue ? 'No longer needed' : 'Needs your reply';
        if (l.status === 'confirmed' || (l.status === 'declined' && l.closed_by === 'parent')) return 'Done';
        return 'No longer needed';
      }
      if (v.role !== 'teacher') return 'No longer needed';
      if (l.status === 'requested') return l.overdue ? 'No longer needed' : 'Needs your reply';
      if (l.status === 'confirmed') return l.outcome ? 'Done' : 'Needs your reply';
      if (l.status === 'declined' && l.closed_by === 'teacher') return 'Done';
      return 'No longer needed';
    }
    case 'material_request': {
      // TL-2: the parents' "Material requested" notice: open on a live lesson = needs a reply;
      // shared or unavailable = done; withdrawn, closed with its lesson, or the lesson ended = no longer needed.
      const [m] = await sql<Array<{ status: string; live: boolean }>>`
        SELECT m.status,
               ((l.status IN ('requested', 'proposed') AND l.reply_deadline > ${now})
                OR (l.status = 'confirmed' AND l.ends_at > ${now})) AS live
        FROM material_requests m JOIN lessons l ON l.id = m.lesson_id WHERE m.id = ${id}`;
      if (!m || v.role !== 'parent') return 'No longer needed';
      if (m.status === 'open') return m.live ? 'Needs your reply' : 'No longer needed';
      if (m.status === 'shared' || m.status === 'unavailable') return 'Done';
      return 'No longer needed';
    }
    case 'learning_package': {
      const [p] = await sql<Array<{ status: string; v2: boolean; completed: boolean }>>`
        SELECT status,
               EXISTS (SELECT 1 FROM platform_settings WHERE key = 'pricing_model_v2' AND value = 1) AS v2,
               -- "Completed": it left needs_review as an offered package (PACKAGE_SAVED fromReview).
               EXISTS (SELECT 1 FROM audit_events WHERE event_type = 'PACKAGE_SAVED' AND subject_id = teacher_id
                         AND details ->> 'fromReview' = 'true') AS completed
        FROM learning_packages WHERE id = ${id}`;
      if (!p) return 'No longer needed';
      if (p.status === 'needs_review') return p.v2 ? 'Needs your reply' : 'No longer needed';
      if (p.status === 'offered' || p.completed) return 'Done';
      return 'No longer needed';
    }
    default:
      return null;
  }
}
