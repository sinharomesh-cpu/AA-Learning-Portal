import 'server-only';
import { randomUUID } from 'node:crypto';
import { SUBJECT_IDS } from '@/fixtures/subjects';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';

/**
 * AI Tutor session allowance (OC-89(4)). Provider-independent; no AI service is called here.
 *
 * Rules (also written in docs/ai-teacher/AI_Teacher_Session_Rules.md):
 * - Every session is at most 15 minutes, whatever the subject or chapter.
 * - A child may START at most one session in any rolling 24 hours. The next session is
 *   available exactly 24 hours after the last counted start.
 * - Only one active session per child. Refreshing, a second tab or a second browser rejoins the
 *   same session until it ends; it never starts a new one and never adds time.
 * - Interrupted (network loss, closed tab): the session keeps running and can be rejoined until
 *   its end; time lost is not given back. Abandoned: it ends at its end time and counts.
 * - No service: if the AI service never produced any output and the server reports the failure
 *   within the first 3 minutes, the session is marked "no service" and does not count.
 * - Only the child starts a session. Parents can see the allowance and end a running session.
 * The child id always comes from the signed-in session, never from the page.
 */

export const AI_SESSION_MINUTES = 15;
export const AI_SESSION_WINDOW_HOURS = 24;
export const NO_SERVICE_GRACE_MINUTES = 3;
const MINUTE = 60_000;
const WINDOW_MS = AI_SESSION_WINDOW_HOURS * 60 * MINUTE;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AiSession {
  id: string;
  subject: string;
  startedAt: Date;
  endsAt: Date;
  status: 'active' | 'ended' | 'no_service';
}

export interface AiAllowance {
  /** True when a new session may start now. */
  canStart: boolean;
  /** The running session, which the child rejoins instead of starting a new one. */
  active: AiSession | null;
  /** When the next session may start (now, if canStart). */
  nextAvailableAt: Date;
  sessionMinutes: number;
}

type Row = { id: string; subject: string; started_at: Date; ends_at: Date; status: AiSession['status'] };
const toSession = (r: Row): AiSession => ({
  id: r.id,
  subject: r.subject,
  startedAt: r.started_at,
  endsAt: r.ends_at,
  status: r.status,
});

/** Closes sessions whose time is up (they count: an abandoned session is a used session). */
async function closeExpired(sql: Db, studentId: string, now: Date): Promise<void> {
  await sql`UPDATE ai_sessions SET status = 'ended', end_reason = 'time_up', ended_at = ends_at
            WHERE student_id = ${studentId} AND status = 'active' AND ends_at <= ${now}`;
}

async function allowanceFor(sql: Db, studentId: string, now: Date): Promise<AiAllowance> {
  await closeExpired(sql, studentId, now);
  const [active] = await sql<Row[]>`
    SELECT id, subject, started_at, ends_at, status FROM ai_sessions
    WHERE student_id = ${studentId} AND status = 'active'`;
  const [last] = await sql<Array<{ started_at: Date }>>`
    SELECT started_at FROM ai_sessions
    WHERE student_id = ${studentId} AND status <> 'no_service' AND started_at > ${new Date(now.getTime() - WINDOW_MS)}
    ORDER BY started_at DESC LIMIT 1`;
  const next = last ? new Date(last.started_at.getTime() + WINDOW_MS) : now;
  return {
    canStart: !active && !last,
    active: active ? toSession(active) : null,
    nextAvailableAt: next,
    sessionMinutes: AI_SESSION_MINUTES,
  };
}

async function isStudent(sql: Db, id: string): Promise<boolean> {
  const [r] = await sql`SELECT 1 FROM accounts WHERE id = ${id} AND role = 'student' AND status = 'active'`;
  return Boolean(r);
}

async function isGuardian(sql: Db, parentId: string, studentId: string): Promise<boolean> {
  const [r] = await sql`
    SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
    WHERE g.parent_id = ${parentId} AND g.student_id = ${studentId} AND g.status = 'active'
      AND p.role = 'parent' AND p.status = 'active'`;
  return Boolean(r);
}

/** The child's allowance, for the child themselves or a parent with an active link. Else null. */
export async function getAiAllowance(
  sql: Db,
  viewerId: string,
  studentId: string,
  now: Date = new Date(),
): Promise<AiAllowance | null> {
  if (!UUID.test(viewerId) || !UUID.test(studentId)) return null;
  const allowed = viewerId === studentId ? await isStudent(sql, studentId) : await isGuardian(sql, viewerId, studentId);
  return allowed ? allowanceFor(sql, studentId, now) : null;
}

export type StartResult =
  | { ok: true; session: AiSession; rejoined: boolean }
  | { ok: false; reason: 'daily_limit'; nextAvailableAt: Date }
  | { ok: false; reason: 'not_allowed' | 'invalid' };

/**
 * The child starts (or rejoins) their AI Tutor session. `requestKey` is a random id made once
 * per page; sending it again returns the same session. `endsBy` (optional) is a booked end time:
 * the session never runs past it, nor past 15 minutes.
 */
export async function startAiSession(
  sql: Sql,
  studentId: string,
  input: { requestKey: string; subject: string; endsBy?: Date },
  now: Date = new Date(),
): Promise<StartResult> {
  if (!UUID.test(studentId) || !UUID.test(input.requestKey)) return { ok: false, reason: 'invalid' };
  if (!(SUBJECT_IDS as readonly string[]).includes(input.subject)) return { ok: false, reason: 'invalid' };
  const latestEnd = new Date(now.getTime() + AI_SESSION_MINUTES * MINUTE);
  const endsAt = input.endsBy && input.endsBy < latestEnd ? input.endsBy : latestEnd;
  if (endsAt <= now) return { ok: false, reason: 'invalid' };
  return sql.begin(async (tx): Promise<StartResult> => {
    // Lock the child first: every start for this child waits its turn (refresh, second tab).
    const [child] = await tx<Array<{ ok: boolean }>>`
      SELECT (role = 'student' AND status = 'active') AS ok FROM accounts WHERE id = ${studentId} FOR UPDATE`;
    if (!child?.ok) return { ok: false, reason: 'not_allowed' };
    const [same] = await tx<Row[]>`
      SELECT id, subject, started_at, ends_at, status FROM ai_sessions
      WHERE student_id = ${studentId} AND request_key = ${input.requestKey}`;
    if (same) {
      await closeExpired(tx, studentId, now);
      const [fresh] = await tx<
        Row[]
      >`SELECT id, subject, started_at, ends_at, status FROM ai_sessions WHERE id = ${same.id}`;
      if (fresh!.status === 'active') return { ok: true, session: toSession(fresh!), rejoined: true };
    }
    const allowance = await allowanceFor(tx, studentId, now);
    if (allowance.active) return { ok: true, session: allowance.active, rejoined: true };
    if (!allowance.canStart) {
      await writeAudit(
        tx,
        {
          type: 'AI_SESSION_REFUSED',
          outcome: 'denied',
          actorId: studentId,
          subjectId: studentId,
          details: { reason: 'daily_limit' },
        },
        now,
      );
      return { ok: false, reason: 'daily_limit', nextAvailableAt: allowance.nextAvailableAt };
    }
    const [row] = await tx<Row[]>`
      INSERT INTO ai_sessions (student_id, request_key, subject, started_at, ends_at)
      VALUES (${studentId}, ${same ? randomUUID() : input.requestKey}, ${input.subject}, ${now}, ${endsAt})
      RETURNING id, subject, started_at, ends_at, status`;
    await writeAudit(
      tx,
      { type: 'AI_SESSION_STARTED', outcome: 'success', actorId: studentId, subjectId: studentId },
      now,
    );
    return { ok: true, session: toSession(row!), rejoined: false };
  });
}

/** The child, or a parent with an active link, ends a running session early. It still counts. */
export async function endAiSession(
  sql: Sql,
  viewerId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!UUID.test(viewerId) || !UUID.test(sessionId)) return false;
  const [s] = await sql<Array<{ student_id: string }>>`
    SELECT student_id FROM ai_sessions WHERE id = ${sessionId} AND status = 'active' AND ends_at > ${now}`;
  if (!s) return false;
  const allowed = viewerId === s.student_id || (await isGuardian(sql, viewerId, s.student_id));
  if (!allowed) return false;
  const r = await sql`UPDATE ai_sessions SET status = 'ended', end_reason = 'ended_by_user', ended_at = ${now}
                      WHERE id = ${sessionId} AND status = 'active'`;
  if (r.count === 1) {
    await writeAudit(
      sql,
      { type: 'AI_SESSION_ENDED', outcome: 'success', actorId: viewerId, subjectId: s.student_id },
      now,
    );
  }
  return r.count === 1;
}

/** Server relay only: the tutor produced its first output. */
export async function markTutorOutput(sql: Db, sessionId: string, now: Date = new Date()): Promise<void> {
  if (!UUID.test(sessionId)) return;
  await sql`UPDATE ai_sessions SET first_tutor_output_at = ${now}
            WHERE id = ${sessionId} AND status = 'active' AND first_tutor_output_at IS NULL`;
}

/**
 * Server relay only: the AI service failed before producing any output, within the first
 * 3 minutes. The session closes and does not count, so the child can start again.
 */
export async function markNoService(sql: Db, sessionId: string, now: Date = new Date()): Promise<boolean> {
  if (!UUID.test(sessionId)) return false;
  const r = await sql`
    UPDATE ai_sessions SET status = 'no_service', end_reason = 'no_service', ended_at = ${now}
    WHERE id = ${sessionId} AND status = 'active' AND first_tutor_output_at IS NULL
      AND ${now} <= started_at + make_interval(mins => ${NO_SERVICE_GRACE_MINUTES})`;
  return r.count === 1;
}

/** A fresh request key for a page (exported for the page and tests). */
export const newRequestKey = () => randomUUID();
