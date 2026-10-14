import { localDayAt, relativeDayLabel } from '@/lib/localTime';
import { clockNow } from '@/lib/clock';
import { formatClockTime } from '@/lib/time';
import { findPersona } from './personas';
import type { Lesson } from './schedule';
import { lessonsForTeacher } from './schedule';

/**
 * Teacher view (P21) built from the shared synthetic data. The teacher id always comes from
 * the session; a teacher sees only their own lessons and linked students (FR-002.2).
 * How teachers are linked to students is still undecided (D-09); links here are fixtures.
 */

const TEACHING: Record<string, { subjects: string; grades: string }> = {
  'demo-teacher-rao': { subjects: 'Science', grades: 'Grades 4–5' },
};

const LINKED_STUDENTS: Record<string, Array<{ id: string; subject: string; completed: number }>> = {
  'demo-teacher-rao': [
    { id: 'demo-student-kiran', subject: 'Science', completed: 3 },
    { id: 'demo-student-meera', subject: 'Science', completed: 1 },
  ],
};

const SHARED: Record<string, Array<{ title: string; studentId: string; subject: string }>> = {
  'demo-teacher-rao': [
    { title: 'Plants and cells notes (sample)', studentId: 'demo-student-kiran', subject: 'Science' },
  ],
};

/** Weekly availability windows in the teacher's own zone; day offsets keep the demo current. */
const AVAILABILITY: Record<string, Array<{ day: number; from: [number, number]; to: [number, number] }>> = {
  'demo-teacher-rao': [
    { day: 0, from: [19, 0], to: [21, 0] },
    { day: 2, from: [19, 0], to: [21, 0] },
    { day: 5, from: [19, 0], to: [21, 0] },
  ],
};

/** Human lessons are 40 minutes at most (OC-06); availability is offered in 40-minute slots. */
export const TEACHER_SLOT_MINUTES = 40;

export interface TeacherLesson extends Lesson {
  studentName: string;
  studentGrade: number;
  dayLabel: string;
  timeLabel: string;
  endLabel: string;
}

export interface AvailabilityDay {
  dayLabel: string;
  from: string;
  to: string;
  booked: number;
  waiting: number;
  open: number;
}

export interface TeacherDashboard {
  teacherId: string;
  name: string;
  timeZone: string;
  subjects: string;
  grades: string;
  lessons: TeacherLesson[];
  availability: AvailabilityDay[];
  students: Array<{ id: string; name: string; grade: number; subject: string; completed: number }>;
  shared: Array<{ title: string; studentName: string; subject: string }>;
}

export function teacherLinkedTo(teacherId: string, studentId: string): boolean {
  return (LINKED_STUDENTS[teacherId] ?? []).some((s) => s.id === studentId);
}

export function getTeacherDashboard(teacherId: string, now: Date = clockNow()): TeacherDashboard | null {
  const teacher = findPersona(teacherId);
  if (!teacher || teacher.role !== 'teacher') return null;
  const tz = teacher.timeZone;
  const startOfToday = Date.parse(localDayAt(0, 0, 0, tz, now));
  const all = lessonsForTeacher(teacherId, now);
  const lessons: TeacherLesson[] = all
    .filter((l) => Date.parse(l.endIso) > startOfToday)
    .map((l) => {
      const student = findPersona(l.studentId);
      return {
        ...l,
        studentName: student?.displayName ?? '',
        studentGrade: student?.grade ?? 0,
        dayLabel: relativeDayLabel(l.startIso, tz, now),
        timeLabel: formatClockTime(l.startIso, { timeZone: tz }),
        endLabel: formatClockTime(l.endIso, { timeZone: tz }),
      };
    });

  const availability: AvailabilityDay[] = (AVAILABILITY[teacherId] ?? []).map((w) => {
    const start = localDayAt(w.day, w.from[0], w.from[1], tz, now);
    const end = localDayAt(w.day, w.to[0], w.to[1], tz, now);
    const slots: string[] = [];
    for (
      let t = Date.parse(start);
      t + TEACHER_SLOT_MINUTES * 60_000 <= Date.parse(end);
      t += TEACHER_SLOT_MINUTES * 60_000
    ) {
      slots.push(new Date(t).toISOString());
    }
    const at = (iso: string) => all.find((l) => l.startIso === iso);
    const booked = slots.filter((s) => at(s)?.status === 'confirmed').length;
    const waiting = slots.filter((s) => at(s)?.status === 'proposed').length;
    return {
      dayLabel: relativeDayLabel(start, tz, now),
      from: formatClockTime(start, { timeZone: tz }),
      to: formatClockTime(end, { timeZone: tz }),
      booked,
      waiting,
      open: slots.length - booked - waiting,
    };
  });

  return {
    teacherId,
    name: teacher.displayName,
    timeZone: tz,
    subjects: TEACHING[teacherId]?.subjects ?? '',
    grades: TEACHING[teacherId]?.grades ?? '',
    lessons,
    availability,
    students: (LINKED_STUDENTS[teacherId] ?? []).map((s) => {
      const p = findPersona(s.id);
      return { id: s.id, name: p?.displayName ?? '', grade: p?.grade ?? 0, subject: s.subject, completed: s.completed };
    }),
    shared: (SHARED[teacherId] ?? []).map((r) => ({
      title: r.title,
      studentName: findPersona(r.studentId)?.displayName ?? '',
      subject: r.subject,
    })),
  };
}
