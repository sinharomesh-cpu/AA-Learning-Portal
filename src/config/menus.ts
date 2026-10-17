import type { MenuItem } from '@/components/shell/AdultShell';

/** Super Admin menu (OC-21, board 66). Integration Health is deferred and absent (OC-19). */
export const ADMIN_MENU: MenuItem[] = [
  { href: '/admin', label: 'Home', exact: true },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/approvals', label: 'Teacher approvals' },
  { href: '/admin/admins', label: 'Admins' },
  { href: '/admin/audit-log', label: 'Audit log' },
  { href: '/admin/security', label: 'Security' },
];

const PERMISSION_PAGE: Record<string, string> = {
  '/admin/accounts': 'accounts',
  '/admin/approvals': 'teacher_approvals',
  '/admin/audit-log': 'audit_log',
};

/** The menu for one admin: the Super Admin sees everything; an Admin only their ticked areas. */
export function adminMenuFor(role: 'superadmin' | 'admin', permissions: readonly string[] = []): MenuItem[] {
  if (role === 'superadmin') return ADMIN_MENU;
  return ADMIN_MENU.filter((item) => {
    if (item.href === '/admin/admins') return false;
    const needed = PERMISSION_PAGE[item.href];
    return !needed || permissions.includes(needed);
  });
}

/** Parent menu from the approved P19 board (OC-33). */
export const PARENT_MENU: MenuItem[] = [
  { href: '/parent', label: 'Family home', exact: true },
  { href: '/parent/children', label: 'Children' },
  // Board 57 (approved): the new Teachers item (OC-36, OC-41).
  { href: '/parent/teachers', label: 'Teachers' },
  { href: '/parent/book-ai', label: 'Schedule AI class' },
  { href: '/parent/book-teacher', label: 'Book human teacher' },
  { href: '/parent/calendar', label: 'Family calendar' },
  { href: '/parent/content', label: 'Content repository' },
  { href: '/parent/history', label: 'Session history' },
  { href: '/parent/notifications', label: 'Notifications' },
  { href: '/parent/settings', label: 'Settings' },
];

/** Teacher menu from the approved P21 board (OC-33). */
export const TEACHER_MENU: MenuItem[] = [
  { href: '/teacher', label: 'Dashboard', exact: true },
  { href: '/teacher/schedule', label: 'My schedule' },
  { href: '/teacher/availability', label: 'Availability' },
  { href: '/teacher/students', label: 'Students' },
  // Board D5 (approved, OC-82): the teacher's public listing (PR-D2).
  { href: '/teacher/listing', label: 'Looking for students' },
  { href: '/teacher/resources', label: 'Learning resources' },
  { href: '/teacher/profile', label: 'Profile' },
];

/**
 * M-20 (board 33): while waiting for approval a teacher can open only their status and profile;
 * the other pages show greyed out until approval (OC-38).
 */
export const TEACHER_PENDING_MENU: MenuItem[] = [
  { href: '/teacher/status', label: 'Account status' },
  { href: '/teacher/profile', label: 'Profile' },
  ...TEACHER_MENU.filter((item) => item.href !== '/teacher/profile').map((item) => ({ ...item, disabled: true })),
];
