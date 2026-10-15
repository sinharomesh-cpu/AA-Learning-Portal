import type { Role } from '@/lib/roles';
import type { SubjectId } from './subjects';

/**
 * Synthetic demo people only (OC-04, G1-04 §4). Names, addresses and identifiers are
 * fictional; email addresses use the reserved example.com domain.
 */
export interface Persona {
  id: string;
  role: Role;
  displayName: string;
  /** Initial shown on the account button. */
  initial: string;
  timeZone: string;
  email?: string;
  grade?: number;
  subjects?: SubjectId[];
  childIds?: string[];
  /** Real accounts only: 'pending_approval' for a teacher waiting for approval (OC-38). */
  status?: 'active' | 'pending_approval';
}

export const PERSONAS: readonly Persona[] = [
  {
    id: 'demo-parent',
    role: 'parent',
    displayName: 'Demo Parent',
    initial: 'D',
    timeZone: 'Asia/Kolkata',
    email: 'parent@example.com',
    childIds: ['demo-student-kiran', 'demo-student-meera'],
  },
  {
    id: 'demo-student-kiran',
    role: 'student',
    displayName: 'Kiran',
    initial: 'K',
    timeZone: 'Asia/Kolkata',
    grade: 5,
    // IT is not enabled by the parent for Kiran (as on the approved boards).
    subjects: ['maths', 'science', 'sst', 'english', 'hindi'],
  },
  {
    id: 'demo-student-meera',
    role: 'student',
    displayName: 'Meera',
    initial: 'M',
    timeZone: 'Asia/Kolkata',
    grade: 4,
    subjects: ['maths', 'science', 'english', 'hindi', 'it'],
  },
  {
    id: 'demo-teacher-rao',
    role: 'teacher',
    displayName: 'Teacher A. Rao',
    initial: 'R',
    // A different zone from the family, to exercise FR-019.
    timeZone: 'Asia/Singapore',
    email: 'teacher.a@example.com',
  },
  {
    id: 'demo-admin',
    role: 'superadmin',
    displayName: 'Demo Admin',
    initial: 'A',
    timeZone: 'Asia/Kolkata',
    email: 'admin@example.com',
  },
];

export function findPersona(id: string | undefined | null): Persona | undefined {
  if (!id) return undefined;
  return PERSONAS.find((p) => p.id === id);
}

export function personasWithRole(roles: readonly Role[]): Persona[] {
  return PERSONAS.filter((p) => roles.includes(p.role));
}
