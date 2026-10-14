/**
 * Synthetic Super Admin data (OC-21): Parent and Teacher accounts only. Children appear
 * only as a count under their parent; no child names or learning content.
 */
export type AccountStatus = 'Active' | 'Pending approval' | 'Deactivated' | 'Suspended';

export interface AccountRow {
  name: string;
  detail: string;
  email: string;
  role: 'Parent' | 'Teacher';
  status: AccountStatus;
  created: string;
  lastSignIn: string;
}

export const ACCOUNTS: readonly AccountRow[] = [
  {
    name: 'Demo Parent',
    detail: '2 children',
    email: 'parent@example.com',
    role: 'Parent',
    status: 'Active',
    created: '1 Oct 2026',
    lastSignIn: 'Today',
  },
  {
    name: 'Teacher A. Rao',
    detail: 'Science · Grades 4–5',
    email: 'teacher.a@example.com',
    role: 'Teacher',
    status: 'Active',
    created: '2 Oct 2026',
    lastSignIn: 'Yesterday',
  },
  {
    name: 'Teacher B. Iyer',
    detail: 'Maths · Grades 3–5',
    email: 'teacher.b@example.com',
    role: 'Teacher',
    status: 'Active',
    created: '2 Oct 2026',
    lastSignIn: '12 Oct',
  },
  {
    name: 'Teacher E. Nair',
    detail: 'English',
    email: 'teacher.e@example.com',
    role: 'Teacher',
    status: 'Pending approval',
    created: '13 Oct 2026',
    lastSignIn: '13 Oct',
  },
  {
    name: 'Sample Parent Two',
    detail: '1 child',
    email: 'parent2@example.com',
    role: 'Parent',
    status: 'Deactivated',
    created: '3 Oct 2026',
    lastSignIn: '9 Oct',
  },
  {
    name: 'Teacher F. Khan',
    detail: 'IT',
    email: 'teacher.f@example.com',
    role: 'Teacher',
    status: 'Suspended',
    created: '4 Oct 2026',
    lastSignIn: '8 Oct',
  },
];

export function adminCounts(rows: readonly AccountRow[] = ACCOUNTS) {
  return {
    activeParents: rows.filter((r) => r.role === 'Parent' && r.status === 'Active').length,
    activeTeachers: rows.filter((r) => r.role === 'Teacher' && r.status === 'Active').length,
    teachersAwaitingApproval: rows.filter((r) => r.role === 'Teacher' && r.status === 'Pending approval').length,
  };
}

export const RECENT_ADMIN_ACTIONS = [
  { action: 'Approved teacher', subject: 'Teacher C. Das', when: 'Today, 9:12 am' },
  { action: 'Deactivated parent account', subject: 'p•••@example.com', when: 'Yesterday, 4:40 pm' },
  { action: 'Edited teacher', subject: 'Teacher B. Iyer (email)', when: '12 Oct, 11:05 am' },
] as const;
