import 'server-only';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { formatClock } from '@/lib/lessonDisplay';
import type { Db } from './db/client';
import { notify } from './notifications/notify';
import type { NotificationViewer } from './notifications/access';

/**
 * CR-17 PR 7: the 15-minute lesson reminder, in-app only and best-effort (D3A-10 Option A, owner
 * 24 Oct 2026, 12:44 IST). No email, WhatsApp, SMS, push, scheduler or configuration.
 *
 * How it works: whenever the viewer's own AA Pro page asks for the bell — when a page is rendered,
 * on the 60-second refresh while the page is visible, and at once when a hidden tab becomes visible
 * again or the device comes back online — AA Pro creates a reminder for each of the viewer's own
 * confirmed lessons that starts within the next 15 minutes (database clock) and hasn't started.
 * Once per lesson and person (the de-duplication key). Nothing is created or delivered while
 * AA Pro is closed; a reminder that would have fallen due then appears only if the person comes
 * back before the start. A lesson AA Pro cancels takes its unread reminder with it.
 *
 * Recipients: an active parent of the child, the lesson's own teacher while approved, active and
 * linked to the child in that subject or teaching a lesson kept under OC-53 (never the child's
 * name), and the child. Each person only
 * ever creates their own reminders.
 */

export const REMINDER_MINUTES = 15;
export const REMINDER_TYPE = 'lesson_reminder';
/** What testers are told wherever reminders are described (D3A-10). */
export const REMINDER_GUIDANCE =
  'Reminders appear only while AA Pro is open, or when you come back before the lesson starts. Please note lesson times yourself.';

interface Due {
  id: string;
  subject: string;
  starts_at: Date;
  teacher_name: string;
  child_name: string;
  grade: number | null;
  zone: string;
}

/** Creates the viewer's due reminders; returns how many were new. Never throws for the caller to handle. */
export async function noteLessonReminders(
  sql: Db,
  viewer: NotificationViewer | null,
  now: Date = new Date(),
): Promise<number> {
  if (!viewer || viewer.standing !== 'full') return 0;
  const window = sql`l.status = 'confirmed' AND l.starts_at > now()
    AND l.starts_at <= now() + make_interval(mins => ${REMINDER_MINUTES})`;
  let due: Due[] = [];
  if (viewer.role === 'parent') {
    due = await sql<Due[]>`
      SELECT l.id, l.subject, l.starts_at, t.display_name AS teacher_name, c.display_name AS child_name,
             sp.grade, me.time_zone AS zone
      FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
      LEFT JOIN student_profiles sp ON sp.account_id = c.id
      JOIN guardian_links g ON g.student_id = l.student_id AND g.parent_id = ${viewer.id} AND g.status = 'active'
      JOIN accounts me ON me.id = g.parent_id AND me.status = 'active'
      WHERE ${window}`;
  } else if (viewer.role === 'teacher') {
    due = await sql<Due[]>`
      SELECT l.id, l.subject, l.starts_at, t.display_name AS teacher_name, '' AS child_name, sp.grade, t.time_zone AS zone
      FROM lessons l JOIN accounts t ON t.id = l.teacher_id AND t.status = 'active'
      JOIN teacher_profiles tp ON tp.account_id = t.id AND tp.approval_status = 'approved'
      LEFT JOIN student_profiles sp ON sp.account_id = l.student_id
      WHERE l.teacher_id = ${viewer.id} AND ${window}
        AND (EXISTS (SELECT 1 FROM teacher_student_links k WHERE k.teacher_id = l.teacher_id
                     AND k.student_id = l.student_id AND k.status = 'active' AND l.subject = ANY (k.subjects))
             -- OC-53 (0031): a lesson kept after the parent removed this teacher.
             OR EXISTS (SELECT 1 FROM lessons_kept kp WHERE kp.lesson_id = l.id))`;
  } else {
    due = await sql<Due[]>`
      SELECT l.id, l.subject, l.starts_at, t.display_name AS teacher_name, c.display_name AS child_name,
             sp.grade, c.time_zone AS zone
      FROM lessons l JOIN accounts t ON t.id = l.teacher_id
      JOIN accounts c ON c.id = l.student_id AND c.status = 'active'
      LEFT JOIN student_profiles sp ON sp.account_id = c.id
      WHERE l.student_id = ${viewer.id} AND ${window}`;
  }
  let made = 0;
  for (const l of due) {
    const subject = SUBJECTS[l.subject as SubjectId]?.name ?? l.subject;
    const at = formatClock(l.starts_at, l.zone);
    const title =
      viewer.role === 'parent'
        ? `${l.child_name}’s ${subject} lesson with ${l.teacher_name} starts at ${at}`
        : viewer.role === 'teacher'
          ? `Your ${subject} lesson (${l.grade ? `Grade ${Number(l.grade)}` : 'grade not set'}) starts at ${at}`
          : `Your ${subject} lesson with ${l.teacher_name} starts at ${at}`;
    const created = await notify(sql, {
      recipientId: viewer.id,
      kind: 'reminder',
      type: REMINDER_TYPE,
      title,
      body: `Join Class opens 10 minutes before the start. ${REMINDER_GUIDANCE}`,
      href:
        viewer.role === 'parent'
          ? '/parent/calendar'
          : viewer.role === 'teacher'
            ? '/teacher/schedule'
            : '/student/schedule',
      entityType: 'lesson',
      entityId: l.id,
      dedupeKey: `${REMINDER_TYPE}:${l.id}:${viewer.id}`,
      now,
    });
    if (created) made += 1;
  }
  return made;
}

/** A lesson AA Pro closed or cancelled: its reminders, read or not, are no longer true. */
export async function dropLessonReminders(tx: Db, lessonId: string): Promise<void> {
  await tx`DELETE FROM notifications WHERE entity_type = 'lesson' AND entity_id = ${lessonId} AND type = ${REMINDER_TYPE}`;
}
