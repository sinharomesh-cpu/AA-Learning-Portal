import 'server-only';
import { formatLessonTime } from '@/lib/lessonDisplay';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';
import { notify } from './notifications/notify';

/**
 * Teachers' own Zoom meeting links for Human Teacher lessons (CR-17 PR 3, migration 0030).
 *
 * - D3A-1 (owner, 24 Oct 2026, 12:44 IST, Option A, rules 1–4): a parent allows a teacher's own
 *   meeting links once per teacher and child. Either parent of the child may allow or stop it; the
 *   other parent is told in-app. Stopping takes effect at once. Removing the teacher–child link
 *   withdraws it (database trigger), and re-linking needs a fresh "Allow".
 * - D3A-8 (Option A): a link is deleted 7 days after the lesson's scheduled end (the database sets
 *   the time; the deletion runs in the existing CR-17 lesson maintenance at the next site
 *   activity), and at once when the lesson is cancelled (database trigger).
 * - The link is a secret (it usually carries the meeting passcode). It is never selected for a
 *   page, never put in a notification or email, and never returned by an action. Join Class
 *   (src/app/lessons/[id]/join) reads it only for an allowed viewer inside the OC-44 window and
 *   sends the browser straight on to Zoom.
 * - OC-123 (2): no Zoom API, paid plan or recording. AA Pro cannot check the meeting itself.
 * The database (0030) re-checks every rule; these functions give the friendly answers first.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mirrors the 0030 CHECK. */
const STORED = /^https:\/\/([a-z0-9-]+\.)*zoom\.us(\/[A-Za-z0-9/?=&._~%+#-]*)?$/;
export const MEETING_LINK_MAX = 500;
/** OC-44: Join opens 10 minutes before the start and stays open until the scheduled end. */
export const JOIN_OPENS_MINUTES = 10;

/**
 * A pasted Zoom link in the one form AA Pro stores, or null. https only; the host must be zoom.us
 * or one of its subdomains (so "evilzoom.us" and "zoom.us.example.com" are refused); no user name,
 * password or port; at most 500 characters. Short-link services are refused by the host rule.
 */
export function normaliseZoomLink(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || raw.length > MEETING_LINK_MAX || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'zoom.us' && !host.endsWith('.zoom.us')) return null;
  const out = `https://${host}${url.pathname}${url.search}${url.hash}`;
  return out.length <= MEETING_LINK_MAX && STORED.test(out) ? out : null;
}

// ======================================================================= permissions (D3A-1)

export interface MeetingPermission {
  teacherId: string;
  childId: string;
  allowed: boolean;
  /** When the live permission was given (database clock). */
  allowedAt: Date | null;
}

/** The live permissions for this parent's children (active parent only). */
export async function meetingPermissionsForParent(sql: Db, parentId: string): Promise<MeetingPermission[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await sql<Array<{ teacher_id: string; student_id: string; granted_at: Date }>>`
    SELECT p.teacher_id, p.student_id, p.granted_at FROM meeting_link_permissions p
    JOIN guardian_links g ON g.student_id = p.student_id AND g.parent_id = ${parentId} AND g.status = 'active'
    WHERE p.withdrawn_at IS NULL`;
  return rows.map((r) => ({ teacherId: r.teacher_id, childId: r.student_id, allowed: true, allowedAt: r.granted_at }));
}

export type PermissionResult = { ok: true } | { ok: false; reason: 'not_found' };

interface LinkFacts {
  link_id: string;
  teacher_name: string;
  child_name: string;
}

/** The active teacher–child link, if this parent may act for the child; otherwise null. */
async function linkFor(tx: Db, parentId: string, teacherId: string, childId: string): Promise<LinkFacts | null> {
  const [r] = await tx<LinkFacts[]>`
    SELECT k.id AS link_id, t.display_name AS teacher_name, c.display_name AS child_name
    FROM teacher_student_links k
    JOIN accounts t ON t.id = k.teacher_id JOIN accounts c ON c.id = k.student_id
    JOIN guardian_links g ON g.student_id = k.student_id AND g.parent_id = ${parentId} AND g.status = 'active'
    JOIN accounts p ON p.id = g.parent_id AND p.role = 'parent' AND p.status = 'active'
    WHERE k.teacher_id = ${teacherId} AND k.student_id = ${childId} AND k.status = 'active'`;
  return r ?? null;
}

/** Rule 1: the other active parents of the child are told; never the parent who acted. */
async function tellOtherParents(
  tx: Db,
  actorId: string,
  childId: string,
  teacherId: string,
  facts: LinkFacts,
  type: 'meeting_links_allowed' | 'meeting_links_stopped',
  eventKey: string,
  now: Date,
): Promise<void> {
  const [actor] = await tx<Array<{ name: string }>>`SELECT display_name AS name FROM accounts WHERE id = ${actorId}`;
  const who = (actor?.name ?? '').trim().split(/\s+/)[0] || 'A parent';
  const parents = await tx<Array<{ id: string }>>`
    SELECT p.id FROM guardian_links g JOIN accounts p ON p.id = g.parent_id AND p.role = 'parent' AND p.status = 'active'
    WHERE g.student_id = ${childId} AND g.status = 'active' AND p.id <> ${actorId}`;
  const title =
    type === 'meeting_links_allowed'
      ? `${who} allowed ${facts.teacher_name} to use their own Zoom meetings for ${facts.child_name}`
      : `${who} stopped ${facts.teacher_name} using their own Zoom meetings for ${facts.child_name}`;
  for (const p of parents) {
    await notify(tx, {
      recipientId: p.id,
      kind: 'update',
      type,
      title,
      body:
        type === 'meeting_links_allowed'
          ? 'Join Class can open the teacher’s meeting links for this child’s lessons.'
          : 'Join Class won’t open this teacher’s meeting links until a parent allows them again.',
      href: `/parent/teachers/${teacherId}`,
      entityType: 'link_request',
      entityId: facts.link_id,
      dedupeKey: `${type}:${eventKey}:${p.id}`,
      now,
    });
  }
}

/** "Allow": either parent of the child, for a teacher linked to the child now. Repeating it is fine. */
export async function allowMeetingLinks(
  sql: Sql,
  parentId: string,
  teacherId: string,
  childId: string,
  now: Date = new Date(),
): Promise<PermissionResult> {
  if (![parentId, teacherId, childId].every((x) => UUID.test(x))) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<PermissionResult> => {
    const facts = await linkFor(tx, parentId, teacherId, childId);
    if (!facts) return { ok: false, reason: 'not_found' };
    let id: string | undefined;
    try {
      const rows = await tx.savepoint(
        (sp) => sp<Array<{ id: string }>>`
        INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by)
        VALUES (${teacherId}, ${childId}, ${parentId}) RETURNING id`,
      );
      id = rows[0]?.id;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') return { ok: true }; // already allowed (perhaps by the other parent)
      if (code === '23514') return { ok: false, reason: 'not_found' };
      throw error;
    }
    if (!id) return { ok: false, reason: 'not_found' };
    await writeAudit(
      tx,
      { type: 'MEETING_LINKS_ALLOWED', outcome: 'success', actorId: parentId, details: { permission: id } },
      now,
    );
    await tellOtherParents(tx, parentId, childId, teacherId, facts, 'meeting_links_allowed', id, now);
    return { ok: true };
  });
}

/** "Stop allowing": either parent of the child; takes effect at once. Nothing to stop is fine. */
export async function stopMeetingLinks(
  sql: Sql,
  parentId: string,
  teacherId: string,
  childId: string,
  now: Date = new Date(),
): Promise<PermissionResult> {
  if (![parentId, teacherId, childId].every((x) => UUID.test(x))) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<PermissionResult> => {
    const facts = await linkFor(tx, parentId, teacherId, childId);
    if (!facts) return { ok: false, reason: 'not_found' };
    const rows = await tx<Array<{ id: string }>>`
      UPDATE meeting_link_permissions SET withdrawn_how = 'parent', withdrawn_by = ${parentId}
      WHERE teacher_id = ${teacherId} AND student_id = ${childId} AND withdrawn_at IS NULL
      RETURNING id`;
    const id = rows[0]?.id;
    if (!id) return { ok: true };
    await writeAudit(
      tx,
      { type: 'MEETING_LINKS_STOPPED', outcome: 'success', actorId: parentId, details: { permission: id } },
      now,
    );
    await tellOtherParents(tx, parentId, childId, teacherId, facts, 'meeting_links_stopped', id, now);
    return { ok: true };
  });
}

// ======================================================================= links (teacher)

export type SetLinkResult =
  { ok: true; changed: boolean } | { ok: false; reason: 'not_found' | 'invalid' | 'not_allowed' | 'closed' };

/**
 * The lesson's own teacher adds or changes its meeting link: a confirmed lesson that hasn't
 * ended, while a parent's permission is live. Both parents are told (never the link itself).
 */
export async function setMeetingLink(
  sql: Sql,
  teacherId: string,
  lessonId: string,
  input: unknown,
  now: Date = new Date(),
): Promise<SetLinkResult> {
  if (!UUID.test(teacherId) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  const url = normaliseZoomLink(input);
  return sql.begin(async (tx): Promise<SetLinkResult> => {
    const [l] = await tx<
      Array<{
        id: string;
        student_id: string;
        subject: string;
        starts_at: Date;
        status: string;
        ended: boolean;
        linked: boolean;
        allowed: boolean;
        teacher_name: string;
        child_name: string;
      }>
    >`
      SELECT l.id, l.student_id, l.subject, l.starts_at, l.status, l.ends_at <= now() AS ended,
             EXISTS (SELECT 1 FROM teacher_student_links k JOIN accounts a ON a.id = k.teacher_id AND a.status = 'active'
                     JOIN teacher_profiles tp ON tp.account_id = k.teacher_id AND tp.approval_status = 'approved'
                     WHERE k.teacher_id = l.teacher_id AND k.student_id = l.student_id AND k.status = 'active'
                       AND l.subject = ANY (k.subjects)) AS linked,
             EXISTS (SELECT 1 FROM meeting_link_permissions p WHERE p.teacher_id = l.teacher_id
                     AND p.student_id = l.student_id AND p.withdrawn_at IS NULL) AS allowed,
             t.display_name AS teacher_name, c.display_name AS child_name
      FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
      WHERE l.id = ${lessonId} AND l.teacher_id = ${teacherId}
      FOR SHARE OF l`;
    if (!l || !l.linked) return { ok: false, reason: 'not_found' };
    if (l.status !== 'confirmed' || l.ended) return { ok: false, reason: 'closed' };
    if (!l.allowed) return { ok: false, reason: 'not_allowed' };
    if (!url) return { ok: false, reason: 'invalid' };
    const [current] = await tx<
      Array<{ url: string }>
    >`SELECT url FROM lesson_meeting_links WHERE lesson_id = ${lessonId}`;
    if (current?.url === url) return { ok: true, changed: false };
    let version: number;
    try {
      const rows = await tx.savepoint(
        (sp) => sp<Array<{ version: number }>>`
        INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${lessonId}, ${url}, ${teacherId})
        ON CONFLICT (lesson_id) DO UPDATE SET url = EXCLUDED.url, set_by = EXCLUDED.set_by
        RETURNING version`,
      );
      version = Number(rows[0]!.version);
    } catch (error) {
      if ((error as { code?: string }).code === '23514') return { ok: false, reason: 'closed' };
      throw error;
    }
    await writeAudit(
      tx,
      { type: 'MEETING_LINK_SET', outcome: 'success', actorId: teacherId, details: { lesson: lessonId, version } },
      now,
    );
    const type = version === 1 ? 'lesson_link_added' : 'lesson_link_changed';
    const subject = SUBJECTS[l.subject as SubjectId]?.name ?? l.subject;
    const parents = await tx<Array<{ id: string; zone: string }>>`
      SELECT p.id, p.time_zone AS zone FROM guardian_links g
      JOIN accounts p ON p.id = g.parent_id AND p.role = 'parent' AND p.status = 'active'
      WHERE g.student_id = ${l.student_id} AND g.status = 'active'`;
    for (const p of parents) {
      await notify(tx, {
        recipientId: p.id,
        kind: 'update',
        type,
        title: `${l.teacher_name} ${version === 1 ? 'added' : 'changed'} the meeting link for ${l.child_name}’s ${subject} lesson, ${formatLessonTime(l.starts_at, p.zone)}`,
        body: 'Join Class opens 10 minutes before the start. The meeting is run by the teacher, not by AA Pro.',
        href: '/parent/calendar',
        entityType: 'lesson',
        entityId: lessonId,
        dedupeKey: `${type}:${lessonId}:${version}:${p.id}`,
        now,
      });
    }
    return { ok: true, changed: true };
  });
}

/**
 * After a teacher accepts a lesson (same transaction): when no parent has allowed this teacher's
 * meeting links for the child yet, the parents are asked once per lesson.
 */
export async function askForMeetingPermission(tx: Db, lessonId: string, now: Date): Promise<void> {
  const [l] = await tx<
    Array<{
      teacher_id: string;
      student_id: string;
      subject: string;
      starts_at: Date;
      teacher_name: string;
      child_name: string;
    }>
  >`
    SELECT l.teacher_id, l.student_id, l.subject, l.starts_at, t.display_name AS teacher_name, c.display_name AS child_name
    FROM lessons l JOIN accounts t ON t.id = l.teacher_id JOIN accounts c ON c.id = l.student_id
    WHERE l.id = ${lessonId} AND l.status = 'confirmed'
      AND NOT EXISTS (SELECT 1 FROM meeting_link_permissions p WHERE p.teacher_id = l.teacher_id
                      AND p.student_id = l.student_id AND p.withdrawn_at IS NULL)`;
  if (!l) return;
  const parents = await tx<Array<{ id: string }>>`
    SELECT p.id FROM guardian_links g JOIN accounts p ON p.id = g.parent_id AND p.role = 'parent' AND p.status = 'active'
    WHERE g.student_id = ${l.student_id} AND g.status = 'active'`;
  for (const p of parents) {
    await notify(tx, {
      recipientId: p.id,
      kind: 'update',
      type: 'lesson_link_permission_needed',
      title: `${l.teacher_name} would like to use their own Zoom meetings for ${l.child_name}’s lessons`,
      body: 'Allow it on the teacher’s page in My teachers, so Join Class can open the lesson.',
      href: `/parent/teachers/${l.teacher_id}`,
      entityType: 'lesson',
      entityId: lessonId,
      dedupeKey: `lesson_link_permission_needed:${lessonId}:${p.id}`,
      now,
    });
  }
}

/** D3A-8: links past their deletion time; part of the CR-17 lesson maintenance (no scheduler). */
export async function purgeMeetingLinks(sql: Db): Promise<number> {
  const [r] = await sql<Array<{ n: number }>>`SELECT meeting_links_purge(200) AS n`;
  return Number(r?.n ?? 0);
}

// ======================================================================= Join Class

export type JoinViewer = { id: string; role: 'parent' | 'teacher' | 'student' };
export type JoinResult =
  { ok: true; url: string } | { ok: false; reason: 'not_found' | 'not_open' | 'ended' | 'not_allowed' | 'no_link' };

/**
 * Join Class (OC-44): the lesson's own teacher, an active parent of the child, or the child; a
 * confirmed lesson; from 10 minutes before the start until the scheduled end (database clock);
 * a live permission; a stored link. Anyone else gets "not found".
 */
export async function joinTarget(sql: Db, viewer: JoinViewer, lessonId: string): Promise<JoinResult> {
  if (!UUID.test(viewer.id) || !UUID.test(lessonId)) return { ok: false, reason: 'not_found' };
  const [l] = await sql<
    Array<{ opens_ok: boolean; ended: boolean; allowed: boolean; url: string | null; mine: boolean }>
  >`
    SELECT now() >= l.starts_at - make_interval(mins => ${JOIN_OPENS_MINUTES}) AS opens_ok,
           now() >= l.ends_at AS ended,
           EXISTS (SELECT 1 FROM meeting_link_permissions p WHERE p.teacher_id = l.teacher_id
                   AND p.student_id = l.student_id AND p.withdrawn_at IS NULL) AS allowed,
           ml.url,
           CASE ${viewer.role}::text
             WHEN 'teacher' THEN l.teacher_id = ${viewer.id} AND EXISTS (
               SELECT 1 FROM teacher_student_links k JOIN accounts a ON a.id = k.teacher_id AND a.status = 'active'
               JOIN teacher_profiles tp ON tp.account_id = k.teacher_id AND tp.approval_status = 'approved'
               WHERE k.teacher_id = l.teacher_id AND k.student_id = l.student_id AND k.status = 'active'
                 AND l.subject = ANY (k.subjects))
             WHEN 'parent' THEN EXISTS (
               SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id AND p.status = 'active'
               WHERE g.student_id = l.student_id AND g.parent_id = ${viewer.id} AND g.status = 'active')
             WHEN 'student' THEN l.student_id = ${viewer.id} AND EXISTS (
               SELECT 1 FROM accounts c WHERE c.id = l.student_id AND c.status = 'active')
             ELSE false
           END AS mine
    FROM lessons l LEFT JOIN lesson_meeting_links ml ON ml.lesson_id = l.id
    WHERE l.id = ${lessonId} AND l.status = 'confirmed'`;
  if (!l || !l.mine) return { ok: false, reason: 'not_found' };
  if (l.ended) return { ok: false, reason: 'ended' };
  if (!l.opens_ok) return { ok: false, reason: 'not_open' };
  if (!l.allowed) return { ok: false, reason: 'not_allowed' };
  if (!l.url || !STORED.test(l.url)) return { ok: false, reason: 'no_link' };
  return { ok: true, url: l.url };
}
