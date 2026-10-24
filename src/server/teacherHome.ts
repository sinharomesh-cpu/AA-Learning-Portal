import 'server-only';
import { getTeacherDashboard, TEACHER_SLOT_MINUTES, type TeacherLesson } from '@/fixtures/teacher';
import { SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { localDayAt, relativeDayLabel } from '@/lib/localTime';
import { buildWeek, nextSevenDays, type WeekDay } from '@/lib/teacherWeek';

export type { WeekDay } from '@/lib/teacherWeek';
import { formatMinute, sortUsualTimes } from '@/lib/usualTimes';
import type { Persona } from '@/fixtures/personas';
import { teacherHomeLessons } from './lessonViews';
import { db } from './db/client';
import { isDemoMode } from './demo';
import { listTeacherEnquiries } from './teacherEnquiries';
import { listLinkedStudents, listLinkRequests } from './teacherLinks';
import { getTeacherRateSettings, teacherWaitingCount } from './rateNegotiations';
import { PRICE_MODEL_LABEL } from '@/lib/listing';
import { packageNeedsDetails } from './pricingModel';
import { getOwnListing, type ListingStatus } from './teacherListings';
import { ownPhotoState } from './teacherPhotos';
import { getTeacherProfile } from './teacherProfile';
import { getUsualTimes } from './teacherUsualTimes';
import { getOwnVerification, type OwnVerification } from './teacherVerification';

/**
 * Teacher dashboard data (S21 / P21). One view for both modes:
 * - demo mode: the synthetic fixtures (lessons, linked students, shared files);
 * - real accounts: the teacher's own profile, approved photo, usual weekly times, listing and
 *   enquiries. Lessons, linked students and sharing arrive with scheduling and resources
 *   (Phases 3 and 4), so real accounts show honest empty states for those.
 * The teacher id always comes from the session; nothing here takes an id from the page.
 */

export interface WeekRow {
  dayOffset: number;
  dayLabel: string;
  from: string;
  to: string;
  /** Second line under the time. */
  detail: string;
  chip: { text: string; kind: 'success' | 'warning' | 'neutral' | 'human' };
}

export interface HomeStudent {
  id: string;
  name: string;
  grade: number;
  subject: string;
  completed: number;
  nextLesson: string | null;
  lastShared: string | null;
}

export interface TeacherHome {
  mode: 'demo' | 'real';
  name: string;
  initial: string;
  timeZone: string;
  photoId: string | null;
  subjectIds: SubjectId[];
  grades: number[];
  curricula: string[];
  experienceYears: number | null;
  lessons: TeacherLesson[];
  /** CR-17 PR 2 (real accounts): lesson requests waiting for this teacher's answer. */
  lessonRequests?: number;
  week: WeekDay[];
  weekRows: WeekRow[];
  /** A sentence under the availability list. */
  weekNote: string;
  students: HomeStudent[];
  /** CR-12 TR3: requests from parents waiting for this teacher's answer. */
  linkRequests: number;
  /** CR-13 RN4: the rate negotiation panel (real accounts only). */
  rates: { on: boolean; openPrices: string[]; waiting: number } | null;
  /** OC-107 (2): the teacher's learning package needs details before parents can see it. */
  packageNeedsDetails?: boolean;
  /** CR-15 §5.1: the "AA Pro Verified" status panel (real accounts only). */
  verification?: OwnVerification | null;
  shared: Array<{ title: string; studentName: string; subject: string }>;
  /** The masthead's "This week" panel. */
  summary: Array<{ label: string; value: string; href?: string }>;
}

const initialOf = (name: string) =>
  [...name.replace(/^(Teacher|Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s+/i, '').trim()][0]?.toUpperCase() ?? '?';

const sortSubjects = (ids: string[]) => SUBJECT_IDS.filter((s) => ids.includes(s));

function demoHome(viewer: Persona, now: Date): TeacherHome | null {
  const data = getTeacherDashboard(viewer.id, now);
  if (!data) return null;
  const days = nextSevenDays(data.timeZone, now);
  const counts = new Map<number, { open: number; taken: number }>();
  for (const a of data.availability) counts.set(a.dayOffset, { open: a.open, taken: a.booked + a.waiting });
  const weekRows: WeekRow[] = data.availability.map((a) => {
    const parts = [];
    if (a.booked) parts.push(`${a.booked} booked`);
    if (a.waiting) parts.push(`${a.waiting} waiting`);
    parts.push(`${a.open} open`);
    const detail = parts.join(' · ');
    const chip: WeekRow['chip'] =
      a.open === 0
        ? { text: 'Booked out', kind: 'warning' }
        : a.booked || a.waiting
          ? { text: 'Partly booked', kind: 'warning' }
          : { text: 'Open', kind: 'success' };
    return { dayOffset: a.dayOffset, dayLabel: a.dayLabel, from: a.from, to: a.to, detail, chip };
  });
  const totalSlots = data.availability.reduce((n, a) => n + a.open + a.booked + a.waiting, 0);
  const booked = data.availability.reduce((n, a) => n + a.booked, 0);
  const weekEnd = Date.parse(localDayAt(7, 0, 0, data.timeZone, now));
  const lessonsThisWeek = data.lessons.filter((l) => Date.parse(l.startIso) < weekEnd).length;
  return {
    mode: 'demo',
    name: data.name,
    initial: viewer.initial,
    timeZone: data.timeZone,
    photoId: null,
    subjectIds: data.subjectIds,
    grades: data.gradeList,
    curricula: [],
    experienceYears: null,
    lessons: data.lessons,
    week: buildWeek(days, counts),
    weekRows,
    weekNote: `Slots are ${TEACHER_SLOT_MINUTES} minutes. Families see these times in their own time zone.`,
    linkRequests: 0,
    rates: null,
    students: data.students.map((s) => {
      const next = data.lessons.find((l) => l.studentId === s.id);
      const shared = data.shared.find((r) => r.studentName === s.name);
      return {
        ...s,
        nextLesson: next ? `${next.dayLabel} ${next.timeLabel}` : null,
        lastShared: shared?.title ?? null,
      };
    }),
    shared: data.shared,
    summary: [
      { label: 'Lessons in the next 7 days', value: String(lessonsThisWeek), href: '/teacher/schedule' },
      { label: 'Times booked', value: `${booked} of ${totalSlots}`, href: '/teacher/availability' },
    ],
  };
}

const LISTING_WORDS: Record<ListingStatus, string> = {
  none: 'Not started',
  draft: 'Draft',
  published: 'Shown to families',
  paused: 'Paused',
  withdrawn: 'Withdrawn',
  expired: 'Ended',
};

/**
 * The teacher's roster for real accounts (CR-17 PR 2, owner decision B4): exactly the children
 * with an ACTIVE link to this teacher (the existing rule, as on My students: listLinkedStudents).
 * A waiting link request or a lesson request never adds a child. Next lesson from the confirmed
 * lessons; lessons completed = lessons the teacher recorded as taught; last file shared.
 */
async function realStudents(
  sql: ReturnType<typeof db>,
  teacherId: string,
  lessons: TeacherLesson[],
): Promise<HomeStudent[]> {
  const linked = await listLinkedStudents(sql, teacherId);
  if (linked.length === 0) return [];
  const ids = linked.map((s) => s.id);
  const [taught, shared] = await Promise.all([
    sql<Array<{ id: string; n: number }>>`
      SELECT student_id AS id, count(*)::int AS n FROM lessons
      WHERE teacher_id = ${teacherId} AND outcome = 'taught' AND student_id = ANY(${ids}) GROUP BY student_id`,
    sql<Array<{ id: string; title: string }>>`
      SELECT DISTINCT ON (s.student_id) s.student_id AS id, r.title
      FROM resource_shares s JOIN teacher_resources r ON r.id = s.resource_id
      WHERE r.teacher_id = ${teacherId} AND r.archived_at IS NULL AND s.unshared_at IS NULL
        AND s.student_id = ANY(${ids})
      ORDER BY s.student_id, s.shared_at DESC`,
  ]);
  return linked.map((s) => {
    const next = lessons.find((l) => l.studentId === s.id);
    return {
      id: s.id,
      name: s.name,
      grade: s.grade,
      subject: s.subjects.map((x) => SUBJECTS[x as SubjectId]?.name ?? x).join(', '),
      completed: taught.find((t) => t.id === s.id)?.n ?? 0,
      nextLesson: next ? `${next.dayLabel} ${next.timeLabel}` : null,
      lastShared: shared.find((r) => r.id === s.id)?.title ?? null,
    };
  });
}

async function realHome(viewer: Persona, now: Date): Promise<TeacherHome | null> {
  const sql = db();
  const profile = await getTeacherProfile(sql, viewer.id);
  if (!profile || profile.approvalStatus !== 'approved') return null;
  const [photo, times, listing, enquiries, requests, rateSettings, rateWaiting, recent, pkg, verification] =
    await Promise.all([
      ownPhotoState(sql, viewer.id),
      getUsualTimes(sql, viewer.id),
      getOwnListing(sql, viewer.id, now),
      listTeacherEnquiries(sql, viewer.id, now),
      listLinkRequests(sql, viewer.id, now),
      getTeacherRateSettings(sql, viewer.id),
      teacherWaitingCount(sql, viewer.id, now),
      // CR-07 H-2b: the three newest shared resources (board HW1 "Recently shared").
      sql<Array<{ title: string; names: string | null; subject: string }>>`
      SELECT r.title, r.subject,
        (SELECT string_agg(a.display_name, ', ' ORDER BY a.display_name) FROM resource_shares s
           JOIN accounts a ON a.id = s.student_id WHERE s.resource_id = r.id AND s.unshared_at IS NULL) AS names
      FROM teacher_resources r WHERE r.teacher_id = ${viewer.id} AND r.archived_at IS NULL
      ORDER BY r.created_at DESC LIMIT 3`,
      packageNeedsDetails(sql, viewer.id),
      getOwnVerification(sql, viewer.id, now),
    ]);
  const tz = profile.timeZone;
  const booked = await teacherHomeLessons(viewer.id, tz, now);
  const students = await realStudents(sql, viewer.id, booked.lessons);
  const days = nextSevenDays(tz, now);
  const counts = new Map<number, { open: number; taken: number }>();
  const weekRows: WeekRow[] = [];
  for (const d of days) {
    for (const t of sortUsualTimes(times).filter((x) => x.weekday === d.weekday)) {
      const c = counts.get(d.offset) ?? { open: 0, taken: 0 };
      c.open += 1;
      counts.set(d.offset, c);
      weekRows.push({
        dayOffset: d.offset,
        dayLabel: relativeDayLabel(d.iso, tz, now),
        from: formatMinute(t.start),
        to: formatMinute(t.end),
        detail: 'Shown on your listing as usually free',
        chip: { text: 'Usually free', kind: 'human' },
      });
    }
  }
  const waiting = enquiries.filter((e) => e.status === 'pending').length;
  const listingValue = listing
    ? listing.status === 'published' && listing.expiresAt
      ? `${LISTING_WORDS.published} until ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(listing.expiresAt)}`
      : LISTING_WORDS[listing.status]
    : LISTING_WORDS.none;
  return {
    mode: 'real',
    name: profile.name,
    initial: initialOf(profile.name),
    timeZone: tz,
    photoId: photo.approvedId,
    subjectIds: sortSubjects(profile.subjects),
    grades: [...profile.grades].sort((a, b) => a - b),
    curricula: profile.curricula,
    experienceYears: profile.experienceYears,
    lessons: booked.lessons,
    lessonRequests: booked.requests,
    week: buildWeek(days, counts),
    weekRows,
    weekNote:
      'These are your usual weekly times. Linked families can request lessons inside them; you accept or decline each request in My schedule.',
    students,
    linkRequests: requests.length,
    packageNeedsDetails: pkg,
    verification,
    rates: {
      on: rateSettings.on,
      openPrices: rateSettings.models.map((m) => PRICE_MODEL_LABEL[m]),
      waiting: rateWaiting,
    },
    shared: recent.map((r) => ({
      title: r.title,
      studentName: r.names ?? 'no one right now',
      subject: SUBJECTS[r.subject as SubjectId]?.name ?? r.subject,
    })),
    summary: [
      { label: 'Your listing', value: listingValue, href: '/teacher/listing' },
      { label: 'Enquiries waiting', value: String(waiting), href: '/teacher/enquiries' },
      { label: 'Usual times a week', value: String(times.length), href: '/teacher/availability' },
    ],
  };
}

/** The signed-in teacher's dashboard, or null when they may not have one. */
export async function getTeacherHome(viewer: Persona, now: Date): Promise<TeacherHome | null> {
  if (viewer.role !== 'teacher') return null;
  return isDemoMode() ? demoHome(viewer, now) : realHome(viewer, now);
}
