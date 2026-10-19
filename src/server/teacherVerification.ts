import 'server-only';
import {
  type DecisionOutcome,
  looksLikeIdNumber,
  mayRequestFrom,
  type VerificationState,
  verificationState,
} from '@/lib/verification';
import { mayAct, teacherClaims, teacherDetail } from './admin';
import { writeAudit } from './auth/audit';
import type { Db, Sql, Tx } from './db/client';

/**
 * "AA Pro Verified" (CR-15 §5.1; owner decision OC-106 (2); FR-045).
 *
 * - A teacher asks to be checked when approved, active and with a confirmed email; again after
 *   "not verified", expiry or removal. One open request at a time.
 * - Only the Super Admin decides (not Admins, not teachers). "Mark verified" needs all three
 *   checks; the email check is read from the account on the server, never ticked by hand.
 * - Every decision is a new row that the database refuses to change or delete; each is also
 *   written to the audit log. No identity document, image or number is stored.
 * - Valid for 12 months from the decision. The public tick is worked out live at read time, so it
 *   disappears at expiry or removal without anything having to run.
 *
 * All functions take `now` so tests can fix the clock. Requests and decisions for one teacher are
 * serialised with a transaction-level advisory lock; the unique open-request index and the
 * decision-per-request index back that up in the database.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';
export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

const lockTeacher = (tx: Tx, teacherId: string) =>
  tx`SELECT pg_advisory_xact_lock(hashtext(${`verification:${teacherId}`}))`;

interface Facts {
  name: string;
  email: string;
  active: boolean;
  approved: boolean;
  emailConfirmed: boolean;
}

async function teacherFacts(sql: Db, teacherId: string): Promise<Facts | null> {
  const [row] = await sql<
    Array<{ name: string; email: string; active: boolean; approved: boolean; email_confirmed: boolean }>
  >`SELECT a.display_name AS name, a.email, a.status = 'active' AS active,
           t.approval_status = 'approved' AS approved, a.email_verified_at IS NOT NULL AS email_confirmed
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
    WHERE a.id = ${teacherId} AND a.role = 'teacher'`;
  return row
    ? {
        name: row.name,
        email: row.email,
        active: row.active,
        approved: row.approved,
        emailConfirmed: row.email_confirmed,
      }
    : null;
}

interface Current {
  state: VerificationState;
  request: { id: string; requestedAt: Date } | null;
  latest: { outcome: DecisionOutcome; decidedAt: Date; expiresAt: Date | null } | null;
}

async function current(sql: Db, teacherId: string, now: Date): Promise<Current> {
  const [latest] = await sql<Array<{ outcome: DecisionOutcome; decided_at: Date; expires_at: Date | null }>>`
    SELECT outcome, decided_at, expires_at FROM teacher_verification_decisions
    WHERE teacher_id = ${teacherId} ORDER BY seq DESC LIMIT 1`;
  const [request] = await sql<Array<{ id: string; requested_at: Date }>>`
    SELECT id, requested_at FROM teacher_verification_requests
    WHERE teacher_id = ${teacherId} AND closed_at IS NULL`;
  const l = latest ? { outcome: latest.outcome, decidedAt: latest.decided_at, expiresAt: latest.expires_at } : null;
  return {
    state: verificationState(l, Boolean(request), now),
    request: request ? { id: request.id, requestedAt: request.requested_at } : null,
    latest: l,
  };
}

const cleanNote = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

type NoteProblem = 'note_required' | 'note_too_long' | 'note_has_number';
function noteProblem(note: string): NoteProblem | null {
  if (note.length < NOTE_MIN) return 'note_required';
  if (note.length > NOTE_MAX) return 'note_too_long';
  if (looksLikeIdNumber(note)) return 'note_has_number';
  return null;
}

// ------------------------------------------------------------------ teacher

export interface OwnVerification {
  state: VerificationState;
  requestedAt: Date | null;
  /** The newest decision (verified, not verified or removed). */
  decidedAt: Date | null;
  /** Verified or expired: when the 12 months end(ed). */
  expiresAt: Date | null;
  /** The "Request verification" button is offered. */
  canRequest: boolean;
  /** Why asking is not possible yet, when the state itself would allow it. */
  blocked: 'email_unconfirmed' | 'not_eligible' | null;
}

/** The signed-in teacher's own status, or null for anyone who is not a teacher. */
export async function getOwnVerification(
  sql: Db,
  teacherId: string,
  now: Date = new Date(),
): Promise<OwnVerification | null> {
  if (!UUID.test(teacherId)) return null;
  const facts = await teacherFacts(sql, teacherId);
  if (!facts) return null;
  const c = await current(sql, teacherId, now);
  const open = mayRequestFrom(c.state);
  const blocked = !open
    ? null
    : !facts.active || !facts.approved
      ? ('not_eligible' as const)
      : !facts.emailConfirmed
        ? ('email_unconfirmed' as const)
        : null;
  return {
    state: c.state,
    requestedAt: c.request?.requestedAt ?? null,
    decidedAt: c.latest?.decidedAt ?? null,
    expiresAt: c.latest?.outcome === 'verified' ? c.latest.expiresAt : null,
    canRequest: open && !blocked,
    blocked,
  };
}

export type RequestResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'not_eligible' | 'email_unconfirmed' | 'already_pending' | 'already_verified' };

/** The teacher asks to be checked (pending). The teacher id comes from the session only. */
export async function requestVerification(sql: Sql, teacherId: string, now: Date = new Date()): Promise<RequestResult> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_found' };
  try {
    return await sql.begin(async (tx): Promise<RequestResult> => {
      await lockTeacher(tx, teacherId);
      const facts = await teacherFacts(tx, teacherId);
      if (!facts) return { ok: false, reason: 'not_found' };
      if (!facts.active || !facts.approved) return { ok: false, reason: 'not_eligible' };
      if (!facts.emailConfirmed) return { ok: false, reason: 'email_unconfirmed' };
      const c = await current(tx, teacherId, now);
      if (c.state === 'pending') return { ok: false, reason: 'already_pending' };
      if (c.state === 'verified') return { ok: false, reason: 'already_verified' };
      await tx`INSERT INTO teacher_verification_requests (teacher_id, requested_at) VALUES (${teacherId}, ${now})`;
      await writeAudit(
        tx,
        { type: 'TEACHER_VERIFICATION_REQUESTED', outcome: 'success', actorId: teacherId, subjectId: teacherId },
        now,
      );
      return { ok: true };
    });
  } catch (e) {
    if ((e as { code?: string }).code === UNIQUE_VIOLATION) return { ok: false, reason: 'already_pending' };
    throw e;
  }
}

// ------------------------------------------------------------------ Super Admin

export interface HistoryRow {
  id: string;
  outcome: DecisionOutcome;
  decidedAt: Date;
  decidedBy: string;
  emailConfirmed: boolean;
  profileReviewed: boolean;
  identityChecked: boolean;
  note: string;
  expiresAt: Date | null;
}

export interface VerificationCase {
  teacherId: string;
  name: string;
  email: string;
  /** Read from the account record now, not from any earlier decision. */
  emailConfirmed: boolean;
  /** Approved and active: may be marked verified. */
  eligible: boolean;
  detail: string;
  claims: string | null;
  bio: string | null;
  state: VerificationState;
  requestedAt: Date | null;
  decidedAt: Date | null;
  expiresAt: Date | null;
  history: HistoryRow[];
}

/**
 * The Super Admin's page: open requests (oldest first) and teachers verified now (soonest expiry
 * first), each with the full decision history. Null for anyone else.
 */
export async function listVerificationCases(
  sql: Db,
  actorId: string,
  now: Date = new Date(),
): Promise<{ pending: VerificationCase[]; verified: VerificationCase[] } | null> {
  if (!(await mayAct(sql, actorId, 'superadmin'))) return null;
  const rows = await sql<
    Array<{
      teacher_id: string;
      name: string;
      email: string;
      email_confirmed: boolean;
      eligible: boolean;
      subjects: string[];
      grades: number[];
      curricula: string[];
      experience_years: number | null;
      bio: string | null;
      requested_at: Date | null;
      outcome: DecisionOutcome | null;
      decided_at: Date | null;
      expires_at: Date | null;
    }>
  >`WITH latest AS (
      SELECT DISTINCT ON (teacher_id) teacher_id, outcome, decided_at, expires_at
      FROM teacher_verification_decisions ORDER BY teacher_id, seq DESC
    ), open AS (
      SELECT teacher_id, requested_at FROM teacher_verification_requests WHERE closed_at IS NULL
    )
    SELECT a.id AS teacher_id, a.display_name AS name, a.email, a.email_verified_at IS NOT NULL AS email_confirmed,
           (a.status = 'active' AND t.approval_status = 'approved') AS eligible,
           t.subjects, t.grades, t.curricula, t.experience_years, t.bio,
           o.requested_at, l.outcome, l.decided_at, l.expires_at
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
    LEFT JOIN open o ON o.teacher_id = a.id
    LEFT JOIN latest l ON l.teacher_id = a.id
    WHERE a.role = 'teacher'
      AND (o.teacher_id IS NOT NULL OR (l.outcome = 'verified' AND l.expires_at > ${now}))
    ORDER BY o.requested_at NULLS LAST, l.expires_at, a.id`;
  const ids = rows.map((r) => r.teacher_id);
  const history = ids.length
    ? await sql<
        Array<{
          id: string;
          teacher_id: string;
          outcome: DecisionOutcome;
          decided_at: Date;
          decider: string | null;
          email_confirmed: boolean;
          profile_reviewed: boolean;
          identity_checked: boolean;
          note: string;
          expires_at: Date | null;
        }>
      >`SELECT d.id, d.teacher_id, d.outcome, d.decided_at, s.display_name AS decider, d.email_confirmed,
               d.profile_reviewed, d.identity_checked, d.note, d.expires_at
        FROM teacher_verification_decisions d LEFT JOIN accounts s ON s.id = d.decided_by
        WHERE d.teacher_id = ANY(${ids}) ORDER BY d.seq DESC`
    : [];
  const cases = rows.map((r): VerificationCase => {
    const latest = r.outcome ? { outcome: r.outcome, expiresAt: r.expires_at } : null;
    return {
      teacherId: r.teacher_id,
      name: r.name,
      email: r.email,
      emailConfirmed: r.email_confirmed,
      eligible: r.eligible,
      detail: teacherDetail(r.subjects, r.grades),
      claims: teacherClaims(r.curricula, r.experience_years),
      bio: r.bio,
      state: verificationState(latest, r.requested_at !== null, now),
      requestedAt: r.requested_at,
      decidedAt: r.decided_at,
      expiresAt: r.outcome === 'verified' ? r.expires_at : null,
      history: history
        .filter((h) => h.teacher_id === r.teacher_id)
        .map((h) => ({
          id: h.id,
          outcome: h.outcome,
          decidedAt: h.decided_at,
          decidedBy: h.decider ? `${h.decider} (Super Admin)` : 'Super Admin',
          emailConfirmed: h.email_confirmed,
          profileReviewed: h.profile_reviewed,
          identityChecked: h.identity_checked,
          note: h.note,
          expiresAt: h.expires_at,
        })),
    };
  });
  return {
    pending: cases.filter((c) => c.state === 'pending'),
    verified: cases.filter((c) => c.state === 'verified'),
  };
}

export type DecideResult =
  | { ok: true; outcome: 'verified' | 'not_verified' }
  | {
      ok: false;
      reason:
        | 'denied'
        | 'not_found'
        | NoteProblem
        | 'checks_required'
        | 'email_unconfirmed'
        | 'not_eligible'
        | 'invalid_outcome';
    };

/**
 * The Super Admin answers an open request: "Mark verified" (all three checks) or "Not verified".
 * A second decision on the same request finds it closed and changes nothing ('not_found').
 */
export async function decideVerification(
  sql: Sql,
  actorId: string,
  teacherId: string,
  input: { outcome: string; profileReviewed: boolean; identityChecked: boolean; note: string },
  now: Date = new Date(),
): Promise<DecideResult> {
  if (!(await mayAct(sql, actorId, 'superadmin'))) return { ok: false, reason: 'denied' };
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_found' };
  const outcome = input.outcome;
  if (outcome !== 'verified' && outcome !== 'not_verified') return { ok: false, reason: 'invalid_outcome' };
  const note = cleanNote(input.note);
  const problem = noteProblem(note);
  if (problem) return { ok: false, reason: problem };
  if (outcome === 'verified' && !(input.profileReviewed && input.identityChecked))
    return { ok: false, reason: 'checks_required' };
  return sql.begin(async (tx): Promise<DecideResult> => {
    await lockTeacher(tx, teacherId);
    const [request] = await tx<Array<{ id: string }>>`
      SELECT id FROM teacher_verification_requests
      WHERE teacher_id = ${teacherId} AND closed_at IS NULL FOR UPDATE`;
    if (!request) return { ok: false, reason: 'not_found' };
    const facts = await teacherFacts(tx, teacherId);
    if (!facts) return { ok: false, reason: 'not_found' };
    if (outcome === 'verified') {
      // (a) is the account's own record: the Super Admin cannot tick it.
      if (!facts.emailConfirmed) return { ok: false, reason: 'email_unconfirmed' };
      if (!facts.active || !facts.approved) return { ok: false, reason: 'not_eligible' };
    }
    await tx`
      INSERT INTO teacher_verification_decisions
        (teacher_id, request_id, outcome, email_confirmed, profile_reviewed, identity_checked, note, decided_by, decided_at)
      VALUES (${teacherId}, ${request.id}, ${outcome}, ${facts.emailConfirmed}, ${input.profileReviewed},
              ${input.identityChecked}, ${note}, ${actorId}, ${now})`;
    await tx`UPDATE teacher_verification_requests SET closed_at = ${now} WHERE id = ${request.id}`;
    await writeAudit(
      tx,
      {
        type: 'TEACHER_VERIFICATION_DECISION',
        outcome: 'success',
        actorId,
        subjectId: teacherId,
        details: {
          result: outcome,
          emailConfirmed: facts.emailConfirmed,
          profileReviewed: input.profileReviewed,
          identityChecked: input.identityChecked,
        },
      },
      now,
    );
    return { ok: true, outcome };
  });
}

export type RevokeResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'not_found' | 'reason_required' | 'note_too_long' | 'note_has_number' };

/** The Super Admin removes a current verification; a reason is required. */
export async function revokeVerification(
  sql: Sql,
  actorId: string,
  teacherId: string,
  input: { reason: string },
  now: Date = new Date(),
): Promise<RevokeResult> {
  if (!(await mayAct(sql, actorId, 'superadmin'))) return { ok: false, reason: 'denied' };
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_found' };
  const reason = cleanNote(input.reason);
  const problem = noteProblem(reason);
  if (problem) return { ok: false, reason: problem === 'note_required' ? 'reason_required' : problem };
  return sql.begin(async (tx): Promise<RevokeResult> => {
    await lockTeacher(tx, teacherId);
    const c = await current(tx, teacherId, now);
    if (c.state !== 'verified') return { ok: false, reason: 'not_found' };
    const facts = await teacherFacts(tx, teacherId);
    if (!facts) return { ok: false, reason: 'not_found' };
    await tx`
      INSERT INTO teacher_verification_decisions
        (teacher_id, outcome, email_confirmed, profile_reviewed, identity_checked, note, decided_by, decided_at)
      VALUES (${teacherId}, 'revoked', ${facts.emailConfirmed}, false, false, ${reason}, ${actorId}, ${now})`;
    await writeAudit(
      tx,
      { type: 'TEACHER_VERIFICATION_REVOKED', outcome: 'success', actorId, subjectId: teacherId },
      now,
    );
    return { ok: true };
  });
}

// ------------------------------------------------------------------ public

/**
 * Of these listings (by public id), the ones whose teacher is verified right now: approved,
 * active, newest decision "verified" and not yet expired. Worked out live, never from the
 * stored public copy of a listing.
 */
export async function verifiedPublicIds(sql: Db, publicIds: string[], now: Date = new Date()): Promise<Set<string>> {
  const ids = publicIds.filter((p) => /^t-[a-z0-9]{10}$/.test(p));
  if (!ids.length) return new Set();
  const rows = await sql<Array<{ public_id: string }>>`
    SELECT l.public_id FROM teacher_listings l
    JOIN accounts a ON a.id = l.teacher_id
    JOIN teacher_profiles t ON t.account_id = a.id
    JOIN LATERAL (
      SELECT outcome, expires_at FROM teacher_verification_decisions d
      WHERE d.teacher_id = l.teacher_id ORDER BY d.seq DESC LIMIT 1
    ) v ON true
    WHERE l.public_id = ANY(${ids}) AND a.status = 'active' AND t.approval_status = 'approved'
      AND v.outcome = 'verified' AND v.expires_at > ${now}`;
  return new Set(rows.map((r) => r.public_id));
}

/** The same rule by teacher account id (the parent "Find a teacher" directory). */
export async function verifiedTeacherIds(sql: Db, teacherIds: string[], now: Date = new Date()): Promise<Set<string>> {
  const ids = teacherIds.filter((id) => UUID.test(id));
  if (!ids.length) return new Set();
  const rows = await sql<Array<{ id: string }>>`
    SELECT a.id FROM accounts a
    JOIN teacher_profiles t ON t.account_id = a.id
    JOIN LATERAL (
      SELECT outcome, expires_at FROM teacher_verification_decisions d
      WHERE d.teacher_id = a.id ORDER BY d.seq DESC LIMIT 1
    ) v ON true
    WHERE a.id = ANY(${ids}) AND a.role = 'teacher' AND a.status = 'active' AND t.approval_status = 'approved'
      AND v.outcome = 'verified' AND v.expires_at > ${now}`;
  return new Set(rows.map((r) => r.id));
}

/** True while this teacher's tick may be shown publicly. */
export async function isPubliclyVerified(sql: Db, teacherId: string, now: Date = new Date()): Promise<boolean> {
  return (await verifiedTeacherIds(sql, [teacherId], now)).has(teacherId);
}
