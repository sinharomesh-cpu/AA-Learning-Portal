import { localDayAt } from '@/lib/localTime';
import { clockNow } from '@/lib/clock';
import { formatDayLabel } from '@/lib/time';
import { findPersona } from './personas';
import type { SubjectId } from './subjects';

/**
 * Synthetic learning history (M-16, FR-016). A history entry records what actually happened
 * in a session, which can differ from what was booked (FR-016.1): the English lesson below
 * was booked for 15 minutes and stopped after 12 because the connection dropped.
 * How real summaries are produced and kept is still undecided (D-24).
 */
export interface HistoryEntry {
  id: string;
  kind: 'ai' | 'human';
  subject: SubjectId;
  title: string;
  whenLabel: string;
  minutes: number;
  text: string;
}

interface Seed {
  id: string;
  kind: 'ai' | 'human';
  subject: SubjectId;
  title: string;
  daysAgo: number;
  minutes: number;
  text: string;
}

const SEEDS: Record<string, Seed[]> = {
  'demo-student-kiran': [
    {
      id: 'h-k1',
      kind: 'ai',
      subject: 'maths',
      title: 'Maths — Chapter 6',
      daysAgo: 1,
      minutes: 30,
      text: 'You practised adding fractions. You used two hints. Next time: mixed numbers.',
    },
    {
      id: 'h-k2',
      kind: 'human',
      subject: 'science',
      title: 'Science with Teacher A. Rao',
      daysAgo: 5,
      minutes: 40,
      text: 'You met your teacher on Zoom.',
    },
    {
      id: 'h-k3',
      kind: 'ai',
      subject: 'english',
      title: 'English — Chapter 2',
      daysAgo: 7,
      minutes: 12,
      text: 'You read the first passage aloud. The lesson stopped early because the connection dropped.',
    },
  ],
  'demo-student-meera': [
    {
      id: 'h-m1',
      kind: 'ai',
      subject: 'english',
      title: 'English — Chapter 2',
      daysAgo: 2,
      minutes: 15,
      text: 'You read a short story and answered three questions about it.',
    },
  ],
};

/** Returns the history of exactly one student, newest first. The id comes from the session only. */
export function getStudentHistory(studentId: string, now: Date = clockNow()): HistoryEntry[] | null {
  const persona = findPersona(studentId);
  if (!persona || persona.role !== 'student') return null;
  const tz = persona.timeZone;
  return (SEEDS[studentId] ?? [])
    .slice()
    .sort((a, b) => a.daysAgo - b.daysAgo)
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      subject: s.subject,
      title: s.title,
      minutes: s.minutes,
      text: s.text,
      whenLabel:
        s.daysAgo === 1 ? 'Yesterday' : formatDayLabel(localDayAt(-s.daysAgo, 12, 0, tz, now), { timeZone: tz }),
    }));
}
