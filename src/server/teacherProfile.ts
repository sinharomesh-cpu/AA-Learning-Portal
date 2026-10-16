import 'server-only';
import { cache } from 'react';
import { SUBJECT_IDS } from '@/fixtures/subjects';
import { writeAudit } from './auth/audit';
import { type Db, db, type Sql } from './db/client';
import { isDemoMode } from './demo';

/**
 * Teacher profile (M-20 onboarding, M-22 edit; OC-38, OC-71, OC-73).
 *
 * - Before approval the teacher fills in the profile, saves drafts and sends it for approval,
 *   accepting the teacher terms. After "changes requested" they edit and send it again.
 * - A rejected teacher cannot edit anything (OC-72): they only see the status page.
 * - After approval, name, bio and time zone save at once; a change to subjects or grades waits
 *   for an approver while the teacher keeps using the portal with the approved values (OC-73).
 *
 * The teacher is always taken from the server-side session; nothing here trusts an id from a form.
 */

/** The draft terms version a teacher accepts (OC-71). Changes when the owner approves final terms. */
export const TEACHER_TERMS_VERSION = 'teacher-terms-draft-2026-10-16';

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const BIO_MAX = 1000;
export const NAME_MAX = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApprovalStatus = 'draft' | 'submitted' | 'approved' | 'changes_requested' | 'rejected';

export interface TeacherProfile {
  name: string;
  email: string;
  timeZone: string;
  subjects: string[];
  grades: number[];
  bio: string;
  origin: 'self_registered' | 'parent_added' | 'admin_created';
  approvalStatus: ApprovalStatus;
  decisionNote: string | null;
  submittedAt: Date | null;
  termsAccepted: boolean;
  /** A subject/grade change waiting for review (approved teachers only). */
  pendingChange: { subjects: string[]; grades: number[]; submittedAt: Date } | null;
  /** OC-54: the teacher has chosen not to appear in the parents' teacher directory (board 65). */
  hiddenFromSearch: boolean;
  /** The outcome of the latest change review. */
  lastChange: { decision: 'approved' | 'declined'; note: string | null; decidedAt: Date } | null;
}

export interface TeacherProfileInput {
  name: string;
  timeZone: string;
  subjects: string[];
  grades: number[];
  bio: string;
  acceptTerms: boolean;
}

export type TeacherProfileProblem = 'name' | 'time_zone' | 'subjects' | 'grades' | 'bio' | 'terms';

const clean = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ');
const cleanBio = (s: string) =>
  s
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
const sortedUnique = <T extends string | number>(xs: T[]) =>
  [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const sameSet = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks a profile. A draft may leave subjects, grades and bio empty; sending for approval
 * (or changing an approved profile) needs at least one subject and grade, a bio and, before
 * approval, the terms.
 */
export function checkTeacherProfile(
  input: TeacherProfileInput,
  mode: 'draft' | 'complete',
  needTerms: boolean,
): TeacherProfileProblem[] {
  const problems: TeacherProfileProblem[] = [];
  const name = clean(input.name);
  if (name.length < 2 || [...name].length > NAME_MAX) problems.push('name');
  if (!isValidTimeZone(input.timeZone)) problems.push('time_zone');
  const subjectsOk = input.subjects.every((s) => (SUBJECT_IDS as readonly string[]).includes(s));
  if (!subjectsOk || (mode === 'complete' && input.subjects.length === 0)) problems.push('subjects');
  const gradesOk = input.grades.every((g) => Number.isInteger(g) && g >= 1 && g <= 12);
  if (!gradesOk || (mode === 'complete' && input.grades.length === 0)) problems.push('grades');
  const bio = cleanBio(input.bio);
  if ([...bio].length > BIO_MAX || (mode === 'complete' && bio.length < 20)) problems.push('bio');
  if (needTerms && mode === 'complete' && !input.acceptTerms) problems.push('terms');
  return problems;
}

type Row = {
  name: string;
  email: string;
  time_zone: string;
  status: string;
  subjects: string[];
  grades: number[];
  bio: string | null;
  origin: TeacherProfile['origin'];
  approval_status: ApprovalStatus;
  decision_note: string | null;
  submitted_at: Date | null;
  terms: boolean;
  pending_subjects: string[] | null;
  pending_grades: number[] | null;
  change_submitted_at: Date | null;
  change_decision: 'approved' | 'declined' | null;
  change_decision_note: string | null;
  change_decided_at: Date | null;
  hidden_from_search: boolean;
};

async function loadRow(sql: Db, teacherId: string, lock = false): Promise<Row | undefined> {
  const [row] = await sql<Row[]>`
    SELECT a.display_name AS name, a.email, a.time_zone, a.status, t.subjects, t.grades, t.bio, t.origin,
           t.approval_status, t.decision_note, t.submitted_at,
           EXISTS (SELECT 1 FROM consents c WHERE c.account_id = a.id AND c.kind = 'teacher_terms') AS terms,
           t.pending_subjects, t.pending_grades, t.change_submitted_at,
           t.change_decision, t.change_decision_note, t.change_decided_at, t.hidden_from_search
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
    WHERE a.id = ${teacherId} AND a.role = 'teacher'
    ${lock ? sql`FOR UPDATE OF a, t` : sql``}`;
  return row;
}

export async function getTeacherProfile(sql: Db, teacherId: string): Promise<TeacherProfile | null> {
  if (!UUID.test(teacherId)) return null;
  const r = await loadRow(sql, teacherId);
  if (!r) return null;
  return {
    name: r.name,
    email: r.email,
    timeZone: r.time_zone,
    subjects: r.subjects,
    grades: r.grades.map(Number),
    bio: r.bio ?? '',
    origin: r.origin,
    approvalStatus: r.approval_status,
    decisionNote: r.decision_note,
    submittedAt: r.submitted_at,
    termsAccepted: r.terms,
    pendingChange:
      r.pending_subjects && r.pending_grades && r.change_submitted_at
        ? { subjects: r.pending_subjects, grades: r.pending_grades.map(Number), submittedAt: r.change_submitted_at }
        : null,
    hiddenFromSearch: r.hidden_from_search,
    lastChange:
      r.change_decision && r.change_decided_at
        ? { decision: r.change_decision, note: r.change_decision_note, decidedAt: r.change_decided_at }
        : null,
  };
}

export type SaveOutcome =
  /** Draft saved (not yet sent). */
  | 'draft_saved'
  /** Sent (or sent again) for approval. */
  | 'submitted'
  /** Already waiting: the changes update what the approver sees. */
  | 'updated_in_queue'
  /** Approved profile: everything saved at once. */
  | 'saved'
  /** Approved profile: name/bio/time zone saved; the subject or grade change waits for review. */
  | 'saved_change_pending'
  /** Approved profile: the waiting change was withdrawn (subjects and grades set back). */
  | 'saved_change_withdrawn';

export type SaveResult =
  | { ok: true; outcome: SaveOutcome }
  | { ok: false; reason: 'invalid'; problems: TeacherProfileProblem[] }
  | { ok: false; reason: 'not_allowed' };

/**
 * Saves the teacher's own profile. `intent` is "draft" or "submit" before approval; after
 * approval it is ignored (there is one Save button, M-22).
 */
export async function saveTeacherProfile(
  sql: Sql,
  teacherId: string,
  input: TeacherProfileInput,
  intent: 'draft' | 'submit',
  now: Date = new Date(),
): Promise<SaveResult> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  const subjects = sortedUnique(input.subjects);
  const grades = sortedUnique(input.grades);
  const name = clean(input.name);
  const bio = cleanBio(input.bio);
  return sql.begin(async (tx): Promise<SaveResult> => {
    const row = await loadRow(tx, teacherId, true);
    if (!row) return { ok: false, reason: 'not_allowed' };
    // Only a teacher who may use the portal or is waiting for approval; never a rejected one (OC-72).
    const usable =
      (row.status === 'active' && row.approval_status === 'approved') ||
      (row.status === 'pending_approval' && row.approval_status !== 'approved' && row.approval_status !== 'rejected');
    if (!usable) return { ok: false, reason: 'not_allowed' };

    const approved = row.approval_status === 'approved';
    const complete = approved || intent === 'submit' || row.approval_status === 'submitted';
    const problems = checkTeacherProfile(
      { ...input, subjects, grades },
      complete ? 'complete' : 'draft',
      !approved && !row.terms,
    );
    if (problems.length) return { ok: false, reason: 'invalid', problems };

    await tx`UPDATE accounts SET display_name = ${name}, time_zone = ${input.timeZone} WHERE id = ${teacherId}`;

    if (approved) {
      const approvedSubjects = sortedUnique(row.subjects);
      const approvedGrades = sortedUnique(row.grades.map(Number));
      const changed = !sameSet(subjects, approvedSubjects) || !sameSet(grades, approvedGrades);
      const hadPending = row.change_submitted_at !== null;
      if (changed) {
        const samePending =
          hadPending &&
          sameSet(subjects, sortedUnique(row.pending_subjects ?? [])) &&
          sameSet(grades, sortedUnique((row.pending_grades ?? []).map(Number)));
        await tx`UPDATE teacher_profiles SET bio = ${bio || null},
                   pending_subjects = ${subjects}, pending_grades = ${grades},
                   change_submitted_at = ${samePending ? row.change_submitted_at : now}
                 WHERE account_id = ${teacherId}`;
        if (!samePending) {
          await writeAudit(
            tx,
            {
              type: 'TEACHER_PROFILE_CHANGE_SUBMITTED',
              outcome: 'success',
              actorId: teacherId,
              subjectId: teacherId,
              details: { subjects: subjects.join(','), grades: grades.join(',') },
            },
            now,
          );
        }
        return { ok: true, outcome: 'saved_change_pending' };
      }
      await tx`UPDATE teacher_profiles SET bio = ${bio || null},
                 pending_subjects = NULL, pending_grades = NULL, change_submitted_at = NULL
               WHERE account_id = ${teacherId}`;
      await writeAudit(
        tx,
        { type: 'TEACHER_PROFILE_UPDATED', outcome: 'success', actorId: teacherId, subjectId: teacherId },
        now,
      );
      return { ok: true, outcome: hadPending ? 'saved_change_withdrawn' : 'saved' };
    }

    // Before approval.
    if (row.approval_status === 'submitted') {
      await tx`UPDATE teacher_profiles SET subjects = ${subjects}, grades = ${grades}, bio = ${bio || null}
               WHERE account_id = ${teacherId}`;
      await writeAudit(
        tx,
        { type: 'TEACHER_PROFILE_UPDATED', outcome: 'success', actorId: teacherId, subjectId: teacherId },
        now,
      );
      return { ok: true, outcome: 'updated_in_queue' };
    }
    if (intent === 'draft') {
      await tx`UPDATE teacher_profiles SET subjects = ${subjects}, grades = ${grades}, bio = ${bio || null}
               WHERE account_id = ${teacherId}`;
      return { ok: true, outcome: 'draft_saved' };
    }
    if (!row.terms) {
      await tx`INSERT INTO consents (account_id, kind, version, accepted_at)
               VALUES (${teacherId}, 'teacher_terms', ${TEACHER_TERMS_VERSION}, ${now})
               ON CONFLICT (account_id, kind, version) DO NOTHING`;
    }
    await tx`UPDATE teacher_profiles SET subjects = ${subjects}, grades = ${grades}, bio = ${bio || null},
               approval_status = 'submitted', submitted_at = ${now}
             WHERE account_id = ${teacherId}`;
    await writeAudit(
      tx,
      {
        type: 'TEACHER_PROFILE_SUBMITTED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: teacherId,
        details: { again: row.approval_status === 'changes_requested' },
      },
      now,
    );
    return { ok: true, outcome: 'submitted' };
  });
}

/** The teacher's approval status, or null (demo mode or no profile row). Cached per request. */
export const teacherApprovalStatus = cache(async (teacherId: string): Promise<ApprovalStatus | null> => {
  if (isDemoMode() || !UUID.test(teacherId)) return null;
  const [row] = await db()<Array<{ approval_status: ApprovalStatus }>>`
    SELECT approval_status FROM teacher_profiles WHERE account_id = ${teacherId}`;
  return row?.approval_status ?? null;
});

/**
 * OC-54: "Hide me from search". Only the teacher changes it, for their own profile. Hiding removes
 * the teacher from the parents' directory (board 65) at once; existing links and "Add by email"
 * (OC-36) are not affected. A rejected teacher cannot change it (OC-72).
 */
export async function setHiddenFromSearch(
  sql: Sql,
  teacherId: string,
  hidden: boolean,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'not_allowed' }> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE teacher_profiles t SET hidden_from_search = ${hidden}
      FROM accounts a
      WHERE t.account_id = ${teacherId} AND a.id = t.account_id AND a.role = 'teacher'
        AND a.status IN ('active', 'pending_approval') AND t.approval_status <> 'rejected'
      RETURNING t.account_id`;
    if (rows.length === 0) return { ok: false as const, reason: 'not_allowed' as const };
    await writeAudit(
      tx,
      { type: 'TEACHER_SEARCH_VISIBILITY', outcome: 'success', actorId: teacherId, details: { hidden } },
      now,
    );
    return { ok: true as const };
  });
}
