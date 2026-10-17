import 'server-only';
import { SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { describePrice, type ListingPrice, type ListingSnapshot } from '@/lib/listing';
import { describeUsualTime, type UsualTime } from '@/lib/usualTimes';
import { writeAudit } from './auth/audit';
import { queueEmail } from './auth/outbox';
import { CURRICULA } from './children';
import type { Db, Sql } from './db/client';

/**
 * Connect with teacher and enquiries (PR-D4a; boards D3, D4, D6, D11; OC-76, OC-77, OC-79 C,
 * OC-80). Every rule is checked here on the server; the forms only make the common case easy.
 *
 * - E-1 Only an active parent can send, and only to a listing that is public at that moment.
 * - E-2 At most 5 enquiries waiting for an answer per parent (a setting).
 * - E-3 One active (waiting or accepted) enquiry per teacher and child. Without a child account
 *   the "child" is the stated grade and curriculum, and both forms count as one (OC-80 C-2).
 * - E-4 Waiting enquiries expire after 14 days.
 * - E-5 At most 10 new enquiries per parent per 24 hours (a setting); messages up to 500
 *   characters, plain text.
 * - E-6 Subjects are the teacher's listed subjects (and the child's own, for a child account).
 * - The teacher sees the parent's first name, grade, curriculum, subjects, times, the plan asked
 *   about and the message — never the child's name or learning data. Nothing is booked, linked
 *   or shared by any status.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ID = /^t-[a-z0-9]{10}$/;
const DAY = 24 * 60 * 60 * 1000;
export const ENQUIRY_DAYS = 14;
export const CONNECT_REMEMBER_DAYS = 7;
export const MESSAGE_MAX = 500;
export const NOTE_MAX = 500;

export function enquiryLimits(env: Record<string, string | undefined> = process.env) {
  const n = (v: string | undefined, d: number) => {
    const x = Number(v);
    return Number.isInteger(x) && x > 0 && x <= 1000 ? x : d;
  };
  return {
    pendingPerParent: n(env.AA_LIMIT_ENQUIRIES_PENDING, 5),
    newPerDay: n(env.AA_LIMIT_ENQUIRIES_PER_DAY, 10),
  };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const subjectNames = (xs: string[]) => xs.map((s) => SUBJECTS[s as SubjectId]?.name ?? s).join(', ');

/** Plain text: no control characters, normal spaces, at most `max` characters. */
function cleanText(s: string, max: number): string | null {
  const t = s
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if ([...t].length > max) return null;
  return t;
}

// ------------------------------------------------------------------ remembering "Connect"

/** D11: remember the chosen teacher on a parent account for 7 days (any device). */
export async function rememberConnect(sql: Db, accountId: string, publicId: string, now: Date = new Date()) {
  if (!UUID.test(accountId) || !PUBLIC_ID.test(publicId)) return;
  await sql`INSERT INTO pending_connects (account_id, public_id, created_at) VALUES (${accountId}, ${publicId}, ${now})
            ON CONFLICT (account_id) DO UPDATE SET public_id = EXCLUDED.public_id, created_at = EXCLUDED.created_at`;
}

/** The remembered teacher, if still within 7 days; it is forgotten either way. */
export async function takeRememberedConnect(
  sql: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<string | null> {
  if (!UUID.test(accountId)) return null;
  const [row] = await sql<Array<{ public_id: string; created_at: Date }>>`
    DELETE FROM pending_connects WHERE account_id = ${accountId} RETURNING public_id, created_at`;
  if (!row || now.getTime() - row.created_at.getTime() > CONNECT_REMEMBER_DAYS * DAY) return null;
  return row.public_id;
}

// ------------------------------------------------------------------ the connect page

interface LiveListing {
  listing_id: string;
  teacher_id: string;
  published: ListingSnapshot;
}

async function liveListing(sql: Db, publicId: string, now: Date, lock = false): Promise<LiveListing | undefined> {
  if (!PUBLIC_ID.test(publicId)) return undefined;
  const [row] = await sql<LiveListing[]>`
    SELECT l.id AS listing_id, l.teacher_id, l.published
    FROM teacher_listings l
    JOIN accounts a ON a.id = l.teacher_id
    JOIN teacher_profiles t ON t.account_id = a.id
    WHERE l.public_id = ${publicId} AND l.status = 'published' AND l.expires_at > ${now}
      AND a.status = 'active' AND t.approval_status = 'approved'
    ${lock ? sql`FOR SHARE OF l, a, t` : sql``}`;
  return row;
}

export interface ConnectChild {
  id: string;
  name: string;
  grade: number;
  curriculum: string | null;
  /** The child's subjects that this teacher lists. */
  subjects: string[];
}

export interface ConnectForm {
  publicId: string;
  teacherName: string;
  subjects: string[];
  /** Usual times in the teacher's zone (the page shows them in the parent's zone). */
  usualTimes: UsualTime[];
  teacherZone: string;
  prices: ListingPrice[];
  children: ConnectChild[];
}

/** What the connect page offers a signed-in parent, or null when the listing is not public now. */
export async function connectForm(
  sql: Db,
  parentId: string,
  publicId: string,
  now: Date = new Date(),
): Promise<ConnectForm | null> {
  const live = await liveListing(sql, publicId, now);
  if (!live || !UUID.test(parentId)) return null;
  const kids = await sql<
    Array<{ id: string; name: string; grade: number; curriculum: string | null; subjects: string[] }>
  >`
    SELECT a.id, a.display_name AS name, p.grade, p.curriculum, p.subjects
    FROM guardian_links g JOIN accounts a ON a.id = g.student_id JOIN student_profiles p ON p.account_id = a.id
    WHERE g.parent_id = ${parentId} AND g.status = 'active' AND a.status = 'active'
    ORDER BY a.display_name`;
  const listed = live.published.subjects;
  return {
    publicId,
    teacherName: live.published.name,
    subjects: listed,
    usualTimes: live.published.usualTimes,
    teacherZone: live.published.timeZone,
    prices: live.published.prices,
    children: kids.map((k) => ({
      id: k.id,
      name: k.name,
      grade: Number(k.grade),
      curriculum: k.curriculum,
      subjects: listed.filter((s) => k.subjects.includes(s)),
    })),
  };
}

// ------------------------------------------------------------------ sending

export interface EnquiryInput {
  publicId: string;
  childId: string | null;
  /** Used only without a child account (P-4). */
  grade: number | null;
  curriculum: string | null;
  subjects: string[];
  /** Indexes into the listing's usual times. */
  times: number[];
  /** Index into the listing's prices, or null. */
  priceIndex: number | null;
  message: string;
}

export type EnquiryProblem = 'child' | 'grade' | 'curriculum' | 'subjects' | 'times' | 'price' | 'message';

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not_allowed' | 'gone' | 'limit_pending' | 'limit_daily' }
  | { ok: false; reason: 'duplicate'; existingId: string }
  | { ok: false; reason: 'invalid'; problems: EnquiryProblem[] };

/** Marks waiting enquiries older than 14 days as expired (E-4). Safe to call on every page. */
export async function expireEnquiries(sql: Db, now: Date = new Date()): Promise<void> {
  await sql`UPDATE teacher_enquiries SET status = 'expired' WHERE status = 'pending' AND expires_at <= ${now}`;
}

export async function sendEnquiry(
  sql: Sql,
  parentId: string,
  input: EnquiryInput,
  baseUrl: string,
  now: Date = new Date(),
): Promise<SendResult> {
  if (!UUID.test(parentId)) return { ok: false, reason: 'not_allowed' };
  const limits = enquiryLimits();
  return sql.begin(async (tx): Promise<SendResult> => {
    // One parent at a time: limits and duplicates are checked under this lock.
    const [parent] = await tx<Array<{ display_name: string }>>`
      SELECT display_name FROM accounts WHERE id = ${parentId} AND role = 'parent' AND status = 'active' FOR UPDATE`;
    if (!parent) return { ok: false, reason: 'not_allowed' };
    const live = await liveListing(tx, input.publicId, now, true);
    if (!live) return { ok: false, reason: 'gone' };
    const listed = live.published.subjects;

    const problems: EnquiryProblem[] = [];
    let grade: number;
    let curriculum: string | null;
    let allowedSubjects = listed;
    if (input.childId) {
      const [child] = UUID.test(input.childId)
        ? await tx<Array<{ grade: number; curriculum: string | null; subjects: string[] }>>`
            SELECT p.grade, p.curriculum, p.subjects
            FROM guardian_links g JOIN student_profiles p ON p.account_id = g.student_id
            JOIN accounts a ON a.id = g.student_id
            WHERE g.parent_id = ${parentId} AND g.student_id = ${input.childId} AND g.status = 'active'
              AND a.status = 'active'`
        : [];
      if (!child) return { ok: false, reason: 'invalid', problems: ['child'] };
      grade = Number(child.grade);
      curriculum =
        child.curriculum && (CURRICULA as readonly string[]).includes(child.curriculum) ? child.curriculum : null;
      allowedSubjects = listed.filter((s) => child.subjects.includes(s));
    } else {
      grade = input.grade ?? 0;
      curriculum = input.curriculum;
      if (!(Number.isInteger(grade) && grade >= 1 && grade <= 12)) problems.push('grade');
      if (curriculum !== null && !(CURRICULA as readonly string[]).includes(curriculum)) problems.push('curriculum');
    }
    const subjects = SUBJECT_IDS.filter((s) => input.subjects.includes(s));
    if (subjects.length === 0 || input.subjects.some((s) => !allowedSubjects.includes(s))) problems.push('subjects');
    const usual = live.published.usualTimes;
    if (input.times.length > 14 || input.times.some((i) => !Number.isInteger(i) || i < 0 || i >= usual.length))
      problems.push('times');
    const prices = live.published.prices;
    if (
      input.priceIndex !== null &&
      !(Number.isInteger(input.priceIndex) && input.priceIndex >= 0 && input.priceIndex < prices.length)
    )
      problems.push('price');
    const message = cleanText(input.message, MESSAGE_MAX);
    if (message === null) problems.push('message');
    if (problems.length) return { ok: false, reason: 'invalid', problems };

    await expireEnquiries(tx, now);
    const [counts] = await tx<Array<{ pending: number; today: number }>>`
      SELECT (SELECT count(*)::int FROM teacher_enquiries WHERE parent_id = ${parentId} AND status = 'pending') AS pending,
             (SELECT count(*)::int FROM rate_events WHERE account_id = ${parentId} AND kind = 'enquiry_new'
                AND occurred_at > ${new Date(now.getTime() - DAY)}) AS today`;
    const [dup] = await tx<Array<{ id: string }>>`
      SELECT id FROM teacher_enquiries
      WHERE parent_id = ${parentId} AND teacher_id = ${live.teacher_id} AND status IN ('pending', 'accepted')
        AND (${input.childId ? tx`child_id = ${input.childId} OR ` : tx``}
             (stated_grade = ${grade} AND stated_curriculum IS NOT DISTINCT FROM ${curriculum}))
      LIMIT 1`;
    if (dup) return { ok: false, reason: 'duplicate', existingId: dup.id };
    if ((counts?.pending ?? 0) >= limits.pendingPerParent) return { ok: false, reason: 'limit_pending' };
    if ((counts?.today ?? 0) >= limits.newPerDay) return { ok: false, reason: 'limit_daily' };

    const price = input.priceIndex === null ? null : prices[input.priceIndex]!;
    const times = [...new Set(input.times)].sort((a, b) => a - b).map((i) => describeUsualTime(usual[i]!));
    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO teacher_enquiries (parent_id, teacher_id, listing_id, child_id, stated_grade, stated_curriculum,
                                     subjects, preferred_times, asking_price, message, sent_at, expires_at)
      VALUES (${parentId}, ${live.teacher_id}, ${live.listing_id}, ${input.childId}, ${grade}, ${curriculum},
              ${subjects}, ${times}, ${price ? tx.json(price as unknown as Parameters<typeof tx.json>[0]) : null},
              ${message || null}, ${now}, ${new Date(now.getTime() + ENQUIRY_DAYS * DAY)})
      RETURNING id`;
    await tx`INSERT INTO rate_events (account_id, kind, occurred_at) VALUES (${parentId}, 'enquiry_new', ${now})`;
    await tx`DELETE FROM pending_connects WHERE account_id = ${parentId}`;
    const [teacher] = await tx<Array<{ email: string; display_name: string }>>`
      SELECT email, display_name FROM accounts WHERE id = ${live.teacher_id}`;
    await queueEmail(tx, {
      to: teacher!.email,
      template: 'enquiry_received',
      payload: {
        name: teacher!.display_name,
        parentFirstName: firstName(parent.display_name),
        subjects: subjectNames(subjects),
        grade: `Grade ${grade}`,
        link: `${baseUrl}/teacher/enquiries`,
      },
      dedupeKey: `enquiry_received:${row!.id}`,
    });
    await writeAudit(
      tx,
      {
        type: 'ENQUIRY_SENT',
        outcome: 'success',
        actorId: parentId,
        subjectId: live.teacher_id,
        details: { enquiry: row!.id },
      },
      now,
    );
    return { ok: true, id: row!.id };
  });
}

// ------------------------------------------------------------------ answering and withdrawing

export type AnswerResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'note' };

/** The teacher accepts or declines a waiting enquiry addressed to them. */
export async function answerEnquiry(
  sql: Sql,
  teacherId: string,
  enquiryId: string,
  decision: 'accept' | 'decline',
  note: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<AnswerResult> {
  if (!UUID.test(teacherId) || !UUID.test(enquiryId)) return { ok: false, reason: 'not_found' };
  const text = cleanText(note, NOTE_MAX);
  if (text === null) return { ok: false, reason: 'note' };
  return sql.begin(async (tx): Promise<AnswerResult> => {
    // Answerable only while the teacher is approved and active (L-4).
    const [teacher] = await tx<Array<{ display_name: string }>>`
      SELECT a.display_name FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
      WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'active' AND t.approval_status = 'approved'`;
    if (!teacher) return { ok: false, reason: 'not_allowed' };
    const [e] = await tx<Array<{ parent_id: string; expires_at: Date }>>`
      SELECT parent_id, expires_at FROM teacher_enquiries
      WHERE id = ${enquiryId} AND teacher_id = ${teacherId} AND status = 'pending' FOR UPDATE`;
    if (!e || e.expires_at <= now) return { ok: false, reason: 'not_found' };
    await tx`UPDATE teacher_enquiries SET status = ${decision === 'accept' ? 'accepted' : 'declined'},
               teacher_note = ${text || null}, answered_at = ${now}
             WHERE id = ${enquiryId}`;
    const [parent] = await tx<Array<{ email: string; display_name: string }>>`
      SELECT email, display_name FROM accounts WHERE id = ${e.parent_id}`;
    await queueEmail(tx, {
      to: parent!.email,
      template: decision === 'accept' ? 'enquiry_accepted' : 'enquiry_declined',
      payload: {
        name: firstName(parent!.display_name),
        teacher: teacher.display_name,
        link: `${baseUrl}/parent/enquiries`,
      },
      dedupeKey: `enquiry_answer:${enquiryId}`,
    });
    await writeAudit(
      tx,
      {
        type: decision === 'accept' ? 'ENQUIRY_ACCEPTED' : 'ENQUIRY_DECLINED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: e.parent_id,
        details: { enquiry: enquiryId },
      },
      now,
    );
    return { ok: true };
  });
}

/** The parent withdraws a waiting enquiry of their own. */
export async function withdrawEnquiry(
  sql: Sql,
  parentId: string,
  enquiryId: string,
  now: Date = new Date(),
): Promise<AnswerResult> {
  if (!UUID.test(parentId) || !UUID.test(enquiryId)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<AnswerResult> => {
    const rows = await tx`UPDATE teacher_enquiries SET status = 'withdrawn'
                          WHERE id = ${enquiryId} AND parent_id = ${parentId} AND status = 'pending' AND expires_at > ${now}
                          RETURNING teacher_id`;
    if (rows.length === 0) return { ok: false, reason: 'not_found' };
    await writeAudit(
      tx,
      { type: 'ENQUIRY_WITHDRAWN', outcome: 'success', actorId: parentId, details: { enquiry: enquiryId } },
      now,
    );
    return { ok: true };
  });
}

// ------------------------------------------------------------------ lists

export type EnquiryStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

export interface ParentEnquiry {
  id: string;
  status: EnquiryStatus;
  teacherId: string;
  teacherName: string;
  /** The parent's own child, or null for "a child I haven't added yet". */
  childName: string | null;
  childId: string | null;
  grade: number;
  curriculum: string | null;
  subjects: string[];
  times: string[];
  askingPrice: string | null;
  message: string | null;
  teacherNote: string | null;
  sentAt: Date;
  expiresAt: Date;
  answeredAt: Date | null;
}

export async function listParentEnquiries(sql: Db, parentId: string, now: Date = new Date()): Promise<ParentEnquiry[]> {
  if (!UUID.test(parentId)) return [];
  await expireEnquiries(sql, now);
  const rows = await sql<
    Array<{
      id: string;
      status: EnquiryStatus;
      teacher_id: string;
      teacher_name: string;
      child_name: string | null;
      child_id: string | null;
      stated_grade: number;
      stated_curriculum: string | null;
      subjects: string[];
      preferred_times: string[];
      asking_price: ListingPrice | null;
      message: string | null;
      teacher_note: string | null;
      sent_at: Date;
      expires_at: Date;
      answered_at: Date | null;
    }>
  >`SELECT e.id, e.status, e.teacher_id, t.display_name AS teacher_name,
           CASE WHEN g.student_id IS NOT NULL THEN c.display_name END AS child_name,
           CASE WHEN g.student_id IS NOT NULL THEN e.child_id END AS child_id,
           e.stated_grade, e.stated_curriculum, e.subjects, e.preferred_times, e.asking_price, e.message,
           e.teacher_note, e.sent_at, e.expires_at, e.answered_at
    FROM teacher_enquiries e
    JOIN accounts t ON t.id = e.teacher_id
    LEFT JOIN accounts c ON c.id = e.child_id
    LEFT JOIN guardian_links g ON g.parent_id = e.parent_id AND g.student_id = e.child_id AND g.status = 'active'
    WHERE e.parent_id = ${parentId}
    ORDER BY (e.status = 'pending') DESC, (e.status = 'accepted') DESC, e.sent_at DESC
    LIMIT 100`;
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name,
    childName: r.child_name,
    childId: r.child_id,
    grade: Number(r.stated_grade),
    curriculum: r.stated_curriculum,
    subjects: r.subjects,
    times: r.preferred_times,
    askingPrice: r.asking_price ? describePrice(r.asking_price) : null,
    message: r.message,
    teacherNote: r.teacher_note,
    sentAt: r.sent_at,
    expiresAt: r.expires_at,
    answeredAt: r.answered_at,
  }));
}

export interface TeacherEnquiry {
  id: string;
  status: EnquiryStatus;
  /** First name only (OC-77 M-3). Never the child's name. */
  parentFirstName: string;
  grade: number;
  curriculum: string | null;
  subjects: string[];
  times: string[];
  askingPrice: string | null;
  message: string | null;
  teacherNote: string | null;
  sentAt: Date;
  expiresAt: Date;
  answeredAt: Date | null;
}

/** Enquiries addressed to this teacher only. No child id, name or data is selected at all. */
export async function listTeacherEnquiries(
  sql: Db,
  teacherId: string,
  now: Date = new Date(),
): Promise<TeacherEnquiry[]> {
  if (!UUID.test(teacherId)) return [];
  await expireEnquiries(sql, now);
  const rows = await sql<
    Array<{
      id: string;
      status: EnquiryStatus;
      parent_name: string;
      stated_grade: number;
      stated_curriculum: string | null;
      subjects: string[];
      preferred_times: string[];
      asking_price: ListingPrice | null;
      message: string | null;
      teacher_note: string | null;
      sent_at: Date;
      expires_at: Date;
      answered_at: Date | null;
    }>
  >`SELECT e.id, e.status, p.display_name AS parent_name, e.stated_grade, e.stated_curriculum, e.subjects,
           e.preferred_times, e.asking_price, e.message, e.teacher_note, e.sent_at, e.expires_at, e.answered_at
    FROM teacher_enquiries e JOIN accounts p ON p.id = e.parent_id
    WHERE e.teacher_id = ${teacherId}
    ORDER BY (e.status = 'pending') DESC, e.sent_at DESC
    LIMIT 200`;
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    parentFirstName: firstName(r.parent_name),
    grade: Number(r.stated_grade),
    curriculum: r.stated_curriculum,
    subjects: r.subjects,
    times: r.preferred_times,
    askingPrice: r.asking_price ? describePrice(r.asking_price) : null,
    message: r.message,
    teacherNote: r.teacher_note,
    sentAt: r.sent_at,
    expiresAt: r.expires_at,
    answeredAt: r.answered_at,
  }));
}

/** True when this parent has an accepted enquiry with this teacher (opens linking, OC-77(2)). */
export async function hasAcceptedEnquiry(sql: Db, parentId: string, teacherId: string): Promise<boolean> {
  if (!UUID.test(parentId) || !UUID.test(teacherId)) return false;
  const [row] = await sql`SELECT 1 FROM teacher_enquiries
                          WHERE parent_id = ${parentId} AND teacher_id = ${teacherId} AND status = 'accepted'`;
  return !!row;
}
