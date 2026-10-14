import { addMinutes } from '@/lib/time';
import { todayAt } from '@/lib/localTime';
import type { SubjectId } from './subjects';
import { findPersona } from './personas';

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

function session(
  kind: 'ai' | 'human',
  subject: string,
  startIso: string,
  minutes: number,
  extra = {},
): DashboardSession {
  return { kind, subject, startIso, endIso: addMinutes(startIso, minutes), durationMinutes: minutes, ...extra };
}

/**
 * Returns the dashboard for exactly one student. The id always comes from the signed-in
 * session, never from the URL, so one child can never load another child's data.
 */
export function getStudentDashboard(studentId: string, now: Date = new Date()): StudentDashboard | null {
  const persona = findPersona(studentId);
  if (!persona || persona.role !== 'student') return null;
  const tz = persona.timeZone;
  const today: DashboardSession[] =
    persona.id === 'demo-student-kiran'
      ? [
          // Human meetings are at most 40 minutes (OC-06); AI lessons are 15 or 30 (OC-22).
          session('human', 'Science', todayAt(16, 30, tz, now), 40, { teacherName: 'Teacher A. Rao' }),
          session('ai', 'Maths', todayAt(17, 15, tz, now), 30, { topic: 'fractions' }),
        ]
      : [session('ai', 'English', todayAt(16, 0, tz, now), 15, { topic: 'reading' })];
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
