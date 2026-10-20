import 'server-only';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { modelLabel, type NegotiationKind, type NegotiationModel, OFFERS_MAX } from '@/lib/rateNegotiation';
import type { Db } from '../db/client';
import { notify } from './notify';

/**
 * The CR-16 §3 events: who is told what. Each function is called by the business code inside the
 * transaction that makes the change, and reads what it needs from the records it is given.
 *
 * Recipients (assumption 1; N-1; D-5; D-6):
 * - exactly the people listed in §3, never the person who acted, never a Super Admin or Admin;
 * - an account that is not active gets nothing (as the existing emails); a teacher gets
 *   marketplace and student notifications only while approved, and approval-status / profile
 *   notifications while approved or awaiting approval — never once not approved (Q-2);
 * - a parent is told about a child only while still that child's active guardian (AC-20).
 * Content (§3): a teacher's notification never contains a child's name or id — grade, curriculum
 * and the parent's first name only (FR-040.9, CR-12 B); a student's never contains prices,
 * enquiries, rate proposals or parent details (D-7); no free-text messages, emails or phones.
 */

const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';
const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;
const subjectList = (xs: string[]) => xs.map(subjectName).join(', ');
const gradeText = (grade: number, curriculum: string | null) =>
  `Grade ${Number(grade)}${curriculum ? ` (${curriculum})` : ''}`;

type Audience = 'marketplace' | 'profile' | 'learning';

/** May this account receive a notification of this kind now? (D-5, D-6, Q-2.) */
async function mayReceive(tx: Db, accountId: string | null, audience: Audience): Promise<boolean> {
  if (!accountId) return false;
  const [a] = await tx<Array<{ role: string; status: string; approval: string | null }>>`
    SELECT a.role, a.status, t.approval_status AS approval
    FROM accounts a LEFT JOIN teacher_profiles t ON t.account_id = a.id WHERE a.id = ${accountId}`;
  if (!a) return false;
  if (a.role === 'parent' || a.role === 'student') return a.status === 'active';
  if (a.role !== 'teacher') return false;
  if (audience === 'profile') {
    return (a.status === 'active' || a.status === 'pending_approval') && a.approval !== 'rejected';
  }
  // Approved (the account turns active in the same transaction as the approval, decideTeacher).
  return (a.status === 'active' || a.status === 'pending_approval') && a.approval === 'approved';
}

/** Is this parent still an active guardian of this child? */
async function guardianOf(tx: Db, parentId: string | null, childId: string): Promise<boolean> {
  if (!parentId) return false;
  const [g] = await tx`SELECT 1 FROM guardian_links WHERE parent_id = ${parentId} AND student_id = ${childId}
                       AND status = 'active'`;
  return !!g;
}

// ------------------------------------------------------------------ enquiries (E-1 to E-4)

interface EnquiryFacts {
  id: string;
  teacher_id: string;
  parent_id: string;
  stated_grade: number;
  stated_curriculum: string | null;
  subjects: string[];
  teacher_name: string;
  parent_name: string;
}

async function enquiry(tx: Db, id: string): Promise<EnquiryFacts | undefined> {
  const [e] = await tx<EnquiryFacts[]>`
    SELECT e.id, e.teacher_id, e.parent_id, e.stated_grade, e.stated_curriculum, e.subjects,
           t.display_name AS teacher_name, p.display_name AS parent_name
    FROM teacher_enquiries e JOIN accounts t ON t.id = e.teacher_id JOIN accounts p ON p.id = e.parent_id
    WHERE e.id = ${id}`;
  return e;
}

/** Enquiry sent → the teacher (action). */
export async function enquiryReceived(tx: Db, enquiryId: string, now: Date): Promise<void> {
  const e = await enquiry(tx, enquiryId);
  if (!e || !(await mayReceive(tx, e.teacher_id, 'marketplace'))) return;
  await notify(tx, {
    recipientId: e.teacher_id,
    kind: 'action',
    type: 'enquiry_received',
    title: `New enquiry from ${firstName(e.parent_name)}`,
    body: `${gradeText(e.stated_grade, e.stated_curriculum)} · ${subjectList(e.subjects)}`,
    href: '/teacher/enquiries',
    entityType: 'enquiry',
    entityId: e.id,
    dedupeKey: `enquiry_received:${e.id}:${e.teacher_id}`,
    now,
  });
}

/** Enquiry accepted / declined → the parent (update). */
export async function enquiryAnswered(
  tx: Db,
  enquiryId: string,
  decision: 'accept' | 'decline',
  now: Date,
): Promise<void> {
  const e = await enquiry(tx, enquiryId);
  if (!e || !(await mayReceive(tx, e.parent_id, 'marketplace'))) return;
  await notify(tx, {
    recipientId: e.parent_id,
    kind: 'update',
    type: decision === 'accept' ? 'enquiry_accepted' : 'enquiry_declined',
    title: `${e.teacher_name} ${decision === 'accept' ? 'accepted' : 'declined'} your enquiry`,
    body: 'Open My enquiries to see their reply.',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: e.id,
    dedupeKey: `enquiry_answer:${e.id}:${e.parent_id}`,
    now,
  });
}

/** Enquiry withdrawn by the parent → the teacher (update). */
export async function enquiryWithdrawn(tx: Db, enquiryId: string, now: Date): Promise<void> {
  const e = await enquiry(tx, enquiryId);
  if (!e || !(await mayReceive(tx, e.teacher_id, 'marketplace'))) return;
  await notify(tx, {
    recipientId: e.teacher_id,
    kind: 'update',
    type: 'enquiry_withdrawn',
    title: `${firstName(e.parent_name)} withdrew their enquiry`,
    body: `${gradeText(e.stated_grade, e.stated_curriculum)} · ${subjectList(e.subjects)}`,
    href: '/teacher/enquiries',
    entityType: 'enquiry',
    entityId: e.id,
    dedupeKey: `enquiry_withdrawn:${e.id}:${e.teacher_id}`,
    now,
  });
}

/**
 * Enquiry expired → the other side: the parent, who was waiting for the teacher's answer
 * (§3 example "Your enquiry to Teacher B expired"). The teacher, who did not answer, is not told.
 */
export async function enquiryExpired(tx: Db, enquiryId: string, now: Date): Promise<void> {
  const e = await enquiry(tx, enquiryId);
  if (!e || !(await mayReceive(tx, e.parent_id, 'marketplace'))) return;
  await notify(tx, {
    recipientId: e.parent_id,
    kind: 'update',
    type: 'enquiry_expired',
    title: `Your enquiry to ${e.teacher_name} expired`,
    body: 'It was not answered within 14 days.',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: e.id,
    dedupeKey: `enquiry_expired:${e.id}:${e.parent_id}`,
    now,
  });
}

// ------------------------------------------------------------------ link requests (CR-12, FR-038)

interface LinkFacts {
  id: string;
  teacher_id: string;
  student_id: string;
  parent_id: string;
  subjects: string[];
  grade: number;
  curriculum: string | null;
  teacher_name: string;
  parent_name: string;
  child_name: string;
}

async function link(tx: Db, id: string): Promise<LinkFacts | undefined> {
  const [l] = await tx<LinkFacts[]>`
    SELECT l.id, l.teacher_id, l.student_id, l.created_by_parent_id AS parent_id, l.subjects, sp.grade, sp.curriculum,
           t.display_name AS teacher_name, p.display_name AS parent_name, c.display_name AS child_name
    FROM teacher_student_links l
    JOIN accounts t ON t.id = l.teacher_id JOIN accounts p ON p.id = l.created_by_parent_id
    JOIN accounts c ON c.id = l.student_id JOIN student_profiles sp ON sp.account_id = l.student_id
    WHERE l.id = ${id}`;
  return l;
}

/**
 * Link request reached the teacher (on sending to an approved teacher, or on the teacher's
 * approval for requests held until then) → the teacher (action). Never the child's name or id.
 */
export async function linkRequestReceived(tx: Db, linkId: string, now: Date): Promise<void> {
  const l = await link(tx, linkId);
  if (!l || !(await mayReceive(tx, l.teacher_id, 'marketplace'))) return;
  await notify(tx, {
    recipientId: l.teacher_id,
    kind: 'action',
    type: 'link_request_received',
    title: `${firstName(l.parent_name)} asked you to teach a Grade ${Number(l.grade)} child`,
    body: `${l.curriculum ? `${l.curriculum} · ` : ''}${subjectList(l.subjects)}`,
    href: '/teacher/students',
    entityType: 'link_request',
    entityId: l.id,
    dedupeKey: `link_request:${l.id}:${l.teacher_id}`,
    now,
  });
}

async function tellParentOfLink(
  tx: Db,
  l: LinkFacts,
  type: 'link_request_accepted' | 'link_request_declined' | 'link_request_expired',
  title: string,
  key: string,
  now: Date,
) {
  if (!(await mayReceive(tx, l.parent_id, 'marketplace')) || !(await guardianOf(tx, l.parent_id, l.student_id))) return;
  await notify(tx, {
    recipientId: l.parent_id,
    kind: 'update',
    type,
    title,
    body: 'Open My teachers to see the details.',
    href: '/parent/teachers',
    entityType: 'link_request',
    entityId: l.id,
    dedupeKey: `${key}:${l.id}:${l.parent_id}`,
    now,
  });
}

/** Link request accepted / declined by the teacher → the parent who asked (update). */
export async function linkRequestAnswered(
  tx: Db,
  linkId: string,
  decision: 'accept' | 'decline',
  now: Date,
): Promise<void> {
  const l = await link(tx, linkId);
  if (!l) return;
  const word = decision === 'accept' ? 'accepted' : 'declined';
  await tellParentOfLink(
    tx,
    l,
    decision === 'accept' ? 'link_request_accepted' : 'link_request_declined',
    `${l.teacher_name} ${word} your link request for ${l.child_name}`,
    'link_request_answered',
    now,
  );
}

/** Link request expired → the parent who asked (update). */
export async function linkRequestExpired(tx: Db, linkId: string, now: Date): Promise<void> {
  const l = await link(tx, linkId);
  if (!l) return;
  await tellParentOfLink(
    tx,
    l,
    'link_request_expired',
    `Your link request to ${l.teacher_name} for ${l.child_name} expired`,
    'link_request_expired',
    now,
  );
}

// ------------------------------------------------------------------ rate proposals (CR-13, CR-15)

interface RateFacts {
  id: string;
  teacher_id: string;
  parent_id: string;
  model: NegotiationModel;
  kind: NegotiationKind;
  subject: string;
  grade: number;
  curriculum: string | null;
  teacher_name: string;
  parent_name: string;
}

async function rate(tx: Db, id: string): Promise<RateFacts | undefined> {
  const [r] = await tx<RateFacts[]>`
    SELECT r.id, r.teacher_id, r.parent_id, r.model, r.kind, r.subject, r.grade, r.curriculum,
           t.display_name AS teacher_name, p.display_name AS parent_name
    FROM rate_negotiations r JOIN accounts t ON t.id = r.teacher_id JOIN accounts p ON p.id = r.parent_id
    WHERE r.id = ${id}`;
  return r;
}

type Side = 'parent' | 'teacher';
const ratesHref = (side: Side) => (side === 'teacher' ? '/teacher/enquiries/rates' : '/parent/enquiries/rates');
/** No child name, ever (FR-040.9): the basis, subject and grade. */
const rateBody = (r: RateFacts) =>
  `${modelLabel(r.model)} · ${subjectName(r.subject)} · ${gradeText(r.grade, r.curriculum)}`;
const recipientOf = (r: RateFacts, side: Side) => (side === 'teacher' ? r.teacher_id : r.parent_id);
const nameFor = (r: RateFacts, side: Side) => (side === 'teacher' ? r.teacher_name : firstName(r.parent_name));

/**
 * A rate proposal (offer 1, by the parent) or a counter-offer (offer n) → the side that must
 * answer it (action). The offer number is kept so the label can tell this offer from later ones.
 */
export async function rateOffer(tx: Db, id: string, seq: number, to: Side, now: Date): Promise<void> {
  const r = await rate(tx, id);
  const recipient = r ? recipientOf(r, to) : null;
  if (!r || !recipient || !(await mayReceive(tx, recipient, 'marketplace'))) return;
  const from = to === 'teacher' ? 'parent' : 'teacher';
  const first =
    r.kind === 'package'
      ? 'New package price proposal'
      : r.kind === 'hourly'
        ? 'New hourly rate proposal'
        : 'New price proposal';
  await notify(tx, {
    recipientId: recipient,
    kind: 'action',
    type: seq === 1 ? 'rate_proposal_received' : 'rate_counter_offer',
    title: seq === 1 ? first : `${nameFor(r, from)} made a counter-offer (offer ${seq} of ${OFFERS_MAX})`,
    body: seq === 1 ? `From ${firstName(r.parent_name)} · ${rateBody(r)}` : rateBody(r),
    href: ratesHref(to),
    entityType: 'rate_proposal',
    entityId: r.id,
    offerSeq: seq,
    dedupeKey: `rate_offer:${r.id}:${seq}:${recipient}`,
    now,
  });
}

/** The side whose turn it was accepted or declined → the other side (update). */
export async function rateAnswered(
  tx: Db,
  id: string,
  by: Side,
  answer: 'accept' | 'decline',
  now: Date,
): Promise<void> {
  const r = await rate(tx, id);
  if (!r) return;
  const to: Side = by === 'parent' ? 'teacher' : 'parent';
  const recipient = recipientOf(r, to);
  if (!(await mayReceive(tx, recipient, 'marketplace'))) return;
  await notify(tx, {
    recipientId: recipient,
    kind: 'update',
    type: answer === 'accept' ? 'rate_proposal_accepted' : 'rate_proposal_declined',
    title: `${nameFor(r, by)} ${answer === 'accept' ? 'accepted' : 'declined'} your offer`,
    body: rateBody(r),
    href: ratesHref(to),
    entityType: 'rate_proposal',
    entityId: r.id,
    dedupeKey: `rate_answer:${r.id}:${recipient}`,
    now,
  });
}

/** The parent withdrew → the teacher (update). */
export async function rateWithdrawn(tx: Db, id: string, now: Date): Promise<void> {
  const r = await rate(tx, id);
  if (!r || !(await mayReceive(tx, r.teacher_id, 'marketplace'))) return;
  await notify(tx, {
    recipientId: r.teacher_id,
    kind: 'update',
    type: 'rate_proposal_withdrawn',
    title: `${firstName(r.parent_name)} withdrew their price proposal`,
    body: rateBody(r),
    href: ratesHref('teacher'),
    entityType: 'rate_proposal',
    entityId: r.id,
    dedupeKey: `rate_withdrawn:${r.id}:${r.teacher_id}`,
    now,
  });
}

/** A rate proposal expired → both sides (update). */
export async function rateExpired(tx: Db, id: string, now: Date): Promise<void> {
  const r = await rate(tx, id);
  if (!r) return;
  for (const side of ['parent', 'teacher'] as const) {
    const recipient = recipientOf(r, side);
    if (!(await mayReceive(tx, recipient, 'marketplace'))) continue;
    await notify(tx, {
      recipientId: recipient,
      kind: 'update',
      type: 'rate_proposal_expired',
      title:
        side === 'parent'
          ? `Your price proposal to ${r.teacher_name} expired`
          : `A price proposal from ${firstName(r.parent_name)} expired`,
      body: rateBody(r),
      href: ratesHref(side),
      entityType: 'rate_proposal',
      entityId: r.id,
      dedupeKey: `rate_expired:${r.id}:${recipient}`,
      now,
    });
  }
}

// ------------------------------------------------------------------ worksheets (CR-07, N-8)

/**
 * A teacher shared a resource with one child → that student, and separately each active parent
 * with an active guardian link to that child (AC-21). Each notification names only that child's
 * own item (AC-22). The student's wording has no prices, enquiries or parent details (D-7).
 */
export async function resourceShared(tx: Db, shareId: string, now: Date): Promise<void> {
  const [s] = await tx<
    Array<{ id: string; student_id: string; title: string; subject: string; teacher: string; child: string }>
  >`
    SELECT s.id, s.student_id, r.title, r.subject, t.display_name AS teacher, c.display_name AS child
    FROM resource_shares s JOIN teacher_resources r ON r.id = s.resource_id
    JOIN accounts t ON t.id = r.teacher_id JOIN accounts c ON c.id = s.student_id
    WHERE s.id = ${shareId}`;
  if (!s) return;
  if (await mayReceive(tx, s.student_id, 'learning')) {
    await notify(tx, {
      recipientId: s.student_id,
      kind: 'update',
      type: 'worksheet_shared',
      title: `New worksheet from ${s.teacher}: ${s.title}`,
      body: `${subjectName(s.subject)} · Open My homework to see it.`,
      href: '/student/homework',
      entityType: 'resource_share',
      entityId: s.id,
      dedupeKey: `worksheet_shared:${s.id}:${s.student_id}`,
      now,
    });
  }
  const parents = await tx<Array<{ id: string }>>`
    SELECT g.parent_id AS id FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
    WHERE g.student_id = ${s.student_id} AND g.status = 'active' AND p.role = 'parent' AND p.status = 'active'
    ORDER BY g.parent_id`;
  for (const p of parents) {
    await notify(tx, {
      recipientId: p.id,
      kind: 'update',
      type: 'worksheet_shared',
      title: `New worksheet for ${s.child}: ${s.title}`,
      body: `From ${s.teacher} · ${subjectName(s.subject)}`,
      href: '/parent/homework',
      entityType: 'resource_share',
      entityId: s.id,
      dedupeKey: `worksheet_shared:${s.id}:${p.id}`,
      now,
    });
  }
}

// ------------------------------------------------------------------ listing and package (L-2, CR-15)

/** Listing ends in 7 days → its teacher (reminder), once per listing period (§7.3). */
export async function listingReminder(
  tx: Db,
  listing: { id: string; teacherId: string; expiresAt: Date; endsOn: string },
  now: Date,
): Promise<void> {
  if (!(await mayReceive(tx, listing.teacherId, 'marketplace'))) return;
  await notify(tx, {
    recipientId: listing.teacherId,
    kind: 'reminder',
    type: 'listing_reminder',
    title: `Your listing ends on ${listing.endsOn}`,
    body: 'Renew it to keep showing it to parents.',
    href: '/teacher/listing',
    entityType: 'listing',
    entityId: listing.id,
    dedupeKey: `listing_reminder:${listing.id}:${listing.expiresAt.toISOString()}:${listing.teacherId}`,
    now,
  });
}

/** A converted package needs details (CR-15 A5) → its teacher (action). */
export async function packageNeedsDetails(tx: Db, packageId: string, teacherId: string, now: Date): Promise<void> {
  if (!(await mayReceive(tx, teacherId, 'marketplace'))) return;
  await notify(tx, {
    recipientId: teacherId,
    kind: 'action',
    type: 'package_needs_details',
    title: 'Finish your learning package',
    body: 'Add the missing details so parents can see it.',
    href: '/teacher/listing',
    entityType: 'learning_package',
    entityId: packageId,
    dedupeKey: `package_needs_details:${packageId}:${teacherId}`,
    now,
  });
}

// ------------------------------------------------------------------ approval and profile (Q-2, Q-3)

/**
 * Teacher approved / changes requested (decideTeacher) → the teacher (update). The submission
 * being decided identifies the event. "Not approved" creates no notification (Q-2).
 */
export async function teacherDecision(
  tx: Db,
  teacherId: string,
  decision: 'approved' | 'changes_requested',
  submittedAt: Date | null,
  now: Date,
): Promise<void> {
  if (!(await mayReceive(tx, teacherId, 'profile'))) return;
  const approved = decision === 'approved';
  await notify(tx, {
    recipientId: teacherId,
    kind: 'update',
    type: approved ? 'teacher_approved' : 'teacher_changes_requested',
    title: approved ? 'Your profile was approved' : 'Please update your profile',
    body: approved
      ? 'Welcome to AA Pro. Every teacher page is open to you now.'
      : 'AA Pro asked for changes. Your status page shows what to update.',
    href: approved ? '/teacher' : '/teacher/status',
    entityType: 'teacher_profile',
    entityId: teacherId,
    dedupeKey: `teacher_decision:${teacherId}:${submittedAt ? submittedAt.toISOString() : 'none'}:${decision}`,
    now,
  });
}

/** Profile change approved / declined (decideProfileChange, OC-73) → the teacher (update). */
export async function profileChangeDecision(
  tx: Db,
  teacherId: string,
  decision: 'approved' | 'declined',
  changeSubmittedAt: Date,
  now: Date,
): Promise<void> {
  if (!(await mayReceive(tx, teacherId, 'profile'))) return;
  await notify(tx, {
    recipientId: teacherId,
    kind: 'update',
    type: decision === 'approved' ? 'profile_change_approved' : 'profile_change_declined',
    title: decision === 'approved' ? 'Your profile change was approved' : 'Your profile change was not accepted',
    body: 'Your profile page shows the note.',
    href: '/teacher/profile',
    entityType: 'teacher_profile',
    entityId: teacherId,
    dedupeKey: `profile_change:${teacherId}:${changeSubmittedAt.toISOString()}:${decision}`,
    now,
  });
}
