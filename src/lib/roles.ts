/** The four signed-in roles (FR-002.1, OC-06). The external invitee never signs in. */
export const ROLES = ['student', 'parent', 'teacher', 'superadmin'] as const;
export type Role = (typeof ROLES)[number];

/** Home of each role's own shell (R-01: no role switcher). */
export const ROLE_HOME: Record<Role, string> = {
  student: '/student',
  parent: '/parent',
  teacher: '/teacher',
  superadmin: '/admin',
};

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  parent: 'Parent',
  teacher: 'Teacher',
  superadmin: 'Super Admin',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
