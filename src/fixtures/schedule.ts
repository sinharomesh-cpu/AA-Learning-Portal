import { localDayAt } from '@/lib/localTime';
import { clockNow } from '@/lib/clock';
import { addMinutes } from '@/lib/time';
import { findPersona } from './personas';
import type { SubjectId } from './subjects';
import { SUBJECTS } from './subjects';

/**
 * The single synthetic family schedule (Phase 1). The student, parent and teacher views all
 * read from here, so one lesson looks the same to everyone, each in their own time zone (FR-019).
 *
 * Owner-approved rules reflected: human lessons ≤ 40 min (OC-06); AI lessons 15 min (OC-89),
 * one at a time per child (OC-22). Lesson times are set in the family's zone (Asia/Kolkata).
 */
export type LessonStatus = 'confirmed' | 'booked' | 'proposed';

export interface Lesson {
  id: string;
  studentId: string;
  kind: 'ai' | 'human';
  subjectId: SubjectId;
  subject: string;
  startIso: string;
  endIso: string;
  durationMinutes: number;
  /** confirmed = human lesson with a confirmed teacher; booked = AI lesson; proposed = teacher-proposed, waiting for the parent (D-08 pending). */
  status: LessonStatus;
  teacherId?: string;
  teacherName?: string;
  chapter?: string;
  topic?: string;
}

const FAMILY_TZ = 'Asia/Kolkata';

interface Seed {
  id: string;
  studentId: string;
  kind: 'ai' | 'human';
  subjectId: SubjectId;
  day: number;
  hour: number;
  minute: number;
  minutes: number;
  status: LessonStatus;
  teacherId?: string;
  chapter?: string;
  topic?: string;
}

const SEEDS: Seed[] = [
  {
    id: 'l-k1',
    studentId: 'demo-student-kiran',
    kind: 'human',
    subjectId: 'science',
    day: 0,
    hour: 16,
    minute: 30,
    minutes: 40,
    status: 'confirmed',
    teacherId: 'demo-teacher-rao',
  },
  {
    id: 'l-k2',
    studentId: 'demo-student-kiran',
    kind: 'ai',
    subjectId: 'maths',
    day: 0,
    hour: 17,
    minute: 15,
    minutes: 15,
    status: 'booked',
    chapter: 'Chapter 6 (sample)',
    topic: 'fractions',
  },
  {
    id: 'l-m1',
    studentId: 'demo-student-meera',
    kind: 'ai',
    subjectId: 'english',
    day: 0,
    hour: 16,
    minute: 0,
    minutes: 15,
    status: 'booked',
    topic: 'reading',
  },
  {
    id: 'l-m2',
    studentId: 'demo-student-meera',
    kind: 'human',
    subjectId: 'science',
    day: 2,
    hour: 16,
    minute: 30,
    minutes: 40,
    status: 'proposed',
    teacherId: 'demo-teacher-rao',
  },
  {
    id: 'l-m3',
    studentId: 'demo-student-meera',
    kind: 'ai',
    subjectId: 'english',
    day: 3,
    hour: 10,
    minute: 0,
    minutes: 15,
    status: 'booked',
  },
];

/** All synthetic lessons, earliest first, relative to `now` so the demo always looks current. */
export function allLessons(now: Date = clockNow()): Lesson[] {
  return SEEDS.map((s) => {
    const startIso = localDayAt(s.day, s.hour, s.minute, FAMILY_TZ, now);
    return {
      id: s.id,
      studentId: s.studentId,
      kind: s.kind,
      subjectId: s.subjectId,
      subject: SUBJECTS[s.subjectId].name,
      startIso,
      endIso: addMinutes(startIso, s.minutes),
      durationMinutes: s.minutes,
      status: s.status,
      teacherId: s.teacherId,
      teacherName: s.teacherId ? findPersona(s.teacherId)?.displayName : undefined,
      chapter: s.chapter,
      topic: s.topic,
    };
  }).sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
}

/** One student's lessons only (the id always comes from the session). */
export function lessonsForStudent(studentId: string, now: Date = clockNow()): Lesson[] {
  return allLessons(now).filter((l) => l.studentId === studentId);
}

/** Lessons of the parent's own linked children only (FR-002.2). */
export function lessonsForParent(parentId: string, now: Date = clockNow()): Lesson[] {
  const parent = findPersona(parentId);
  if (!parent || parent.role !== 'parent') return [];
  const children = new Set(parent.childIds ?? []);
  return allLessons(now).filter((l) => children.has(l.studentId));
}

/** Human lessons where this teacher is the teacher (no other teacher's calendar). */
export function lessonsForTeacher(teacherId: string, now: Date = clockNow()): Lesson[] {
  const teacher = findPersona(teacherId);
  if (!teacher || teacher.role !== 'teacher') return [];
  return allLessons(now).filter((l) => l.kind === 'human' && l.teacherId === teacherId);
}
