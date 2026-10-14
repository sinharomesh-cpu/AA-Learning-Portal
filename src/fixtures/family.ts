import { localDayAt, relativeDayLabel } from '@/lib/localTime';
import { formatClockTime } from '@/lib/time';
import { findPersona } from './personas';
import type { Lesson } from './schedule';
import { lessonsForParent } from './schedule';
import type { SubjectId } from './subjects';
import { SUBJECTS } from './subjects';

/**
 * Parent views (P19 family home, M-07 children list) built from the shared synthetic data.
 * Every function takes the parent id from the session and returns only that parent's own
 * linked children (FR-002.2). Nothing here is persisted.
 */

export const DEMO_SCHOOL = 'Sample Primary School';
export const DEMO_CURRICULUM = 'Sample curriculum A';

export interface ParentLesson extends Lesson {
  childName: string;
  dayLabel: string;
  timeLabel: string;
}

export interface ChildSummary {
  id: string;
  name: string;
  initial: string;
  grade: number;
  school: string;
  curriculum: string;
  timeZone: string;
  subjects: string[];
  lessons: ParentLesson[];
}

export interface FamilyResource {
  title: string;
  source: 'parent' | 'teacher';
  sourceLabel: string;
  childName: string;
  subject: string;
  chapter?: string;
}

/** Lessons from the start of the parent's current local day onward. */
export function parentLessons(parentId: string, now: Date = new Date()): ParentLesson[] {
  const parent = findPersona(parentId);
  if (!parent || parent.role !== 'parent') return [];
  const tz = parent.timeZone;
  const startOfToday = Date.parse(localDayAt(0, 0, 0, tz, now));
  return lessonsForParent(parentId, now)
    .filter((l) => Date.parse(l.endIso) > startOfToday)
    .map((l) => ({
      ...l,
      childName: findPersona(l.studentId)?.displayName ?? '',
      dayLabel: relativeDayLabel(l.startIso, tz, now),
      timeLabel: formatClockTime(l.startIso, { timeZone: tz }),
    }));
}

export function childrenOf(parentId: string, now: Date = new Date()): ChildSummary[] {
  const parent = findPersona(parentId);
  if (!parent || parent.role !== 'parent') return [];
  const lessons = parentLessons(parentId, now);
  return (parent.childIds ?? [])
    .map((id) => findPersona(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c && c.role === 'student'))
    .map((c) => ({
      id: c.id,
      name: c.displayName,
      initial: c.initial,
      grade: c.grade ?? 0,
      school: DEMO_SCHOOL,
      curriculum: DEMO_CURRICULUM,
      timeZone: c.timeZone,
      subjects: (c.subjects ?? []).map((s: SubjectId) => SUBJECTS[s].name),
      lessons: lessons.filter((l) => l.studentId === c.id),
    }));
}

/** True only when the child is linked to this parent. Used before any child page renders. */
export function parentOwnsChild(parentId: string, childId: string): boolean {
  const parent = findPersona(parentId);
  return Boolean(parent && parent.role === 'parent' && (parent.childIds ?? []).includes(childId));
}

/** True only when the lesson belongs to one of this parent's children. */
export function parentOwnsLesson(parentId: string, lessonId: string, now: Date = new Date()): boolean {
  return lessonsForParent(parentId, now).some((l) => l.id === lessonId);
}

const RESOURCES: Array<Omit<FamilyResource, 'childName'> & { childId: string }> = [
  {
    title: 'Maths practice book (sample)',
    source: 'parent',
    sourceLabel: 'From you',
    childId: 'demo-student-kiran',
    subject: 'Maths',
    chapter: 'Chapter 6',
  },
  {
    title: 'Fractions practice sheet (sample)',
    source: 'teacher',
    sourceLabel: 'From Teacher B. Iyer',
    childId: 'demo-student-kiran',
    subject: 'Maths',
  },
  {
    title: 'English reader (sample)',
    source: 'parent',
    sourceLabel: 'From you',
    childId: 'demo-student-meera',
    subject: 'English',
  },
];

/** Resources assigned to this parent's own children only. */
export function familyResources(parentId: string): FamilyResource[] {
  return RESOURCES.filter((r) => parentOwnsChild(parentId, r.childId)).map(({ childId, ...r }) => ({
    ...r,
    childName: findPersona(childId)?.displayName ?? '',
  }));
}

export interface NotificationSummary {
  email: { on: boolean; address: string };
  whatsapp: { enabled: boolean };
}

export function notificationSummary(parentId: string): NotificationSummary | null {
  const parent = findPersona(parentId);
  if (!parent || parent.role !== 'parent' || !parent.email) return null;
  return { email: { on: true, address: parent.email }, whatsapp: { enabled: false } };
}
