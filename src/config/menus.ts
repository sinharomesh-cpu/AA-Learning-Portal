import type { MenuItem } from '@/components/shell/AdultShell';

/** Super Admin v1 menu (OC-21). Integration Health is deferred and absent (OC-19). */
export const ADMIN_MENU: MenuItem[] = [
  { href: '/admin', label: 'Home', exact: true },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/approvals', label: 'Teacher approvals' },
  { href: '/admin/audit-log', label: 'Audit log' },
  { href: '/admin/security', label: 'Security' },
];

/** Parent menu from the approved P19 board (OC-33). */
export const PARENT_MENU: MenuItem[] = [
  { href: '/parent', label: 'Family home', exact: true },
  { href: '/parent/children', label: 'Children' },
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
  { href: '/teacher/resources', label: 'Learning resources' },
  { href: '/teacher/profile', label: 'Profile' },
];
