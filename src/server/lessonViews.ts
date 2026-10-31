import 'server-only';
import type { ParentLesson } from '@/fixtures/family';
import type { DashboardSession } from '@/fixtures/student';
import { SUBJECTS } from '@/fixtures/subjects';
import type { TeacherLesson } from '@/fixtures/teacher';
import { formatLessonTime } from '@/lib/lessonDisplay';
import { relativeDayLabel } from '@/lib/localTime';
import { formatClockTime } from '@/lib/time';
import { db } from './db/client';
import { type LessonItem, lessonsForParent, lessonsForStudent, lessonsForTeacher } from './lessons';

/**
 * Real lessons (CR-17 PR 2) in the shapes the existing dashboards already render, so the
 * dashboards keep their approved design. Demo mode never calls these: it keeps its fixtures.
 */

const dayLabel = (at: Date, tz: string, now: Date) => {
  const label = relativeDayLabel(at.toISOString(), tz, now);
  return label;
};

function base(l: LessonItem) {
  return {
    id: l.id,
    studentId: l.childId,
    kind: 'human' as const,
    subjectId: l.subject,
    subject: SUBJECTS[l.subject].name,
    startIso: l.startsAt.toISOString(),
    endIso: l.endsAt.toISOString(),
    durationMinutes: l.minutes,
    // TL-3: a teacher's open proposal shows as proposed (the parent reviews it on its booking page).
    status:
      l.status === 'confirmed'
        ? ('confirmed' as const)
        : l.status === 'proposed'
          ? ('proposed' as const)
          : ('requested' as const),
    teacherId: l.teacherId,
    teacherName: l.teacherName,
  };
}

/**
 * Open requests, open teacher proposals (TL-3) and confirmed lessons that haven't ended, for a
 * parent's home (soonest first).
 */
export async function parentHomeLessons(parentId: string, tz: string, now: Date): Promise<ParentLesson[]> {
  const items = await lessonsForParent(db(), parentId, now);
  return items
    .filter((l) => (l.status === 'confirmed' || l.status === 'requested' || l.status === 'proposed') && l.endsAt > now)
    .map((l) => ({
      ...base(l),
      childName: l.childName,
      dayLabel: dayLabel(l.startsAt, tz, now),
      timeLabel: formatClockTime(l.startsAt.toISOString(), { timeZone: tz }),
    }));
}

/**
 * Confirmed lessons that haven't ended, the number of requests waiting, and (TL-3) the teacher's
 * open proposals still waiting for a parent, for a teacher's home.
 */
export async function teacherHomeLessons(
  teacherId: string,
  tz: string,
  now: Date,
): Promise<{ lessons: TeacherLesson[]; requests: number; proposals: number }> {
  const items = await lessonsForTeacher(db(), teacherId, now);
  return {
    requests: items.filter((l) => l.canAnswer).length,
    proposals: items.filter((l) => l.status === 'proposed').length,
    lessons: items
      .filter((l) => l.status === 'confirmed' && l.endsAt > now)
      .map((l) => ({
        ...base(l),
        studentName: l.childName,
        studentGrade: l.grade ?? 0,
        dayLabel: dayLabel(l.startsAt, tz, now),
        timeLabel: formatClockTime(l.startsAt.toISOString(), { timeZone: tz }),
        endLabel: formatClockTime(l.endsAt.toISOString(), { timeZone: tz }),
      })),
  };
}

/** The child's confirmed teacher lessons today (their time zone), for the child's home. */
export async function studentTodayLessons(studentId: string, tz: string, now: Date): Promise<DashboardSession[]> {
  const items = await lessonsForStudent(db(), studentId, now);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  return items
    .filter((l) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(l.startsAt) === today)
    .map((l) => ({
      kind: 'human' as const,
      subject: SUBJECTS[l.subject].name,
      startIso: l.startsAt.toISOString(),
      endIso: l.endsAt.toISOString(),
      durationMinutes: l.minutes,
      teacherName: l.teacherName,
      lessonId: l.id,
      joinReady: l.meeting.allowed && l.meeting.added,
    }));
}

export { formatLessonTime };
