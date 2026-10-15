/** The signed-in roles (FR-002.1, OC-06; Admins per OC-50). The external invitee never signs in. */
export const ROLES = ['student', 'parent', 'teacher', 'admin', 'superadmin'] as const;
export type Role = (typeof ROLES)[number];

/** Home of each role's own shell (R-01: no role switcher). */
export const ROLE_HOME: Record<Role, string> = {
  student: '/student',
  parent: '/parent',
  teacher: '/teacher',
  admin: '/admin',
  superadmin: '/admin',
};

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  parent: 'Parent',
  teacher: 'Teacher',
  admin: 'Admin',
  superadmin: 'Super Admin',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
