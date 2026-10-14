import { isSameLocalDay } from '@/lib/time';
import { clockNow } from '@/lib/clock';
import type { SubjectId } from './subjects';
import { findPersona } from './personas';
import { lessonsForStudent } from './schedule';

/** Synthetic student dashboard data. Book and resource titles are generic samples. */
export interface DashboardSession {
  kind: 'ai' | 'human';
  subject: string;
  startIso: string;
  endIso: string;
  durationMinutes: number;
  teacherName?: string;
  topic?: string;
}

export interface StudentDashboard {
  studentId: string;
  firstName: string;
  timeZone: string;
  subjects: Array<{ id: SubjectId; detail: string }>;
  today: DashboardSession[];
  newResources: Array<{ title: string; source: string }>;
  lessonsFinishedThisWeek: number;
}

const BOOKS: Record<SubjectId, string> = {
  maths: 'Maths practice book (sample)',
  science: 'Science notes (sample)',
  sst: 'No book assigned yet',
  english: 'English reader (sample)',
  hindi: 'Hindi worksheet (sample)',
  it: 'IT activity sheet (sample)',
};

/**
 * Returns the dashboard for exactly one student. The id always comes from the signed-in
 * session, never from the URL, so one child can never load another child's data.
 */
export function getStudentDashboard(studentId: string, now: Date = clockNow()): StudentDashboard | null {
  const persona = findPersona(studentId);
  if (!persona || persona.role !== 'student') return null;
  const tz = persona.timeZone;
  // Today's lessons come from the shared family schedule (fixtures/schedule.ts).
  const today: DashboardSession[] = lessonsForStudent(persona.id, now)
    .filter((l) => isSameLocalDay(l.startIso, now.toISOString(), tz))
    .map((l) => ({
      kind: l.kind,
      subject: l.subject,
      startIso: l.startIso,
      endIso: l.endIso,
      durationMinutes: l.durationMinutes,
      teacherName: l.teacherName,
      topic: l.topic,
    }));
  return {
    studentId: persona.id,
    firstName: persona.displayName,
    timeZone: tz,
    subjects: (persona.subjects ?? []).map((id) => ({ id, detail: BOOKS[id] })),
    today,
    newResources:
      persona.id === 'demo-student-kiran'
        ? [
            { title: 'Fractions practice sheet (sample)', source: 'Shared by Teacher B. Iyer · Maths' },
            { title: 'Maths practice book (sample)', source: 'From your parent · Chapter 6' },
          ]
        : [{ title: 'English reader (sample)', source: 'From your parent' }],
    lessonsFinishedThisWeek: persona.id === 'demo-student-kiran' ? 3 : 1,
  };
}
