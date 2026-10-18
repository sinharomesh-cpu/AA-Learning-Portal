import type { MenuItem } from '@/components/shell/AdultShell';

/** Super Admin menu (OC-21, board 66). Integration Health is deferred and absent (OC-19). */
export const ADMIN_MENU: MenuItem[] = [
  { href: '/admin', label: 'Home', icon: 'dashboard', exact: true },
  { href: '/admin/accounts', label: 'Accounts', icon: 'manage_accounts' },
  { href: '/admin/approvals', label: 'Teacher approvals', icon: 'how_to_reg' },
  { href: '/admin/admins', label: 'Admins', icon: 'admin_panel_settings' },
  { href: '/admin/audit-log', label: 'Audit log', icon: 'receipt_long' },
  { href: '/admin/storage', label: 'Storage', icon: 'cloud_upload' },
  { href: '/admin/rate-proposals', label: 'Rate proposals', icon: 'forum' },
  { href: '/admin/security', label: 'Security', icon: 'security' },
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
    // Admins, the storage limits (OC-96) and the rate proposal limits (CR-13) are the Super Admin's alone.
    if (['/admin/admins', '/admin/storage', '/admin/rate-proposals'].includes(item.href)) return false;
    const needed = PERMISSION_PAGE[item.href];
    return !needed || permissions.includes(needed);
  });
}

/** Parent menu from the approved P19 board (OC-33). */
export const PARENT_MENU: MenuItem[] = [
  { href: '/parent', label: 'Family home', icon: 'family_restroom', exact: true },
  { href: '/parent/children', label: 'Children', icon: 'supervisor_account' },
  // Board 57 (approved): the new Teachers item (OC-36, OC-41).
  { href: '/parent/teachers', label: 'Teachers', icon: 'co_present' },
  // Board D4 (approved, OC-82): enquiries sent from public listings (PR-D4a).
  { href: '/parent/enquiries', label: 'My enquiries', icon: 'forum' },
  { href: '/parent/book-ai', label: 'Schedule AI class', icon: 'smart_toy' },
  { href: '/parent/book-teacher', label: 'Book human teacher', icon: 'person_search' },
  { href: '/parent/calendar', label: 'Family calendar', icon: 'calendar_month' },
  { href: '/parent/content', label: 'Content repository', icon: 'folder_shared' },
  // Board HW8 (approved, OC-95): homework and resources teachers shared with the children.
  { href: '/parent/homework', label: 'Homework', icon: 'description' },
  { href: '/parent/history', label: 'Session history', icon: 'history_edu' },
  { href: '/parent/notifications', label: 'Notifications', icon: 'notifications' },
  { href: '/parent/settings', label: 'Settings', icon: 'settings' },
];

/** Teacher menu from the approved P21 board (OC-33). */
export const TEACHER_MENU: MenuItem[] = [
  { href: '/teacher', label: 'Dashboard', icon: 'dashboard', exact: true },
  { href: '/teacher/schedule', label: 'My schedule', icon: 'event_available' },
  { href: '/teacher/availability', label: 'Availability', icon: 'calendar_view_week' },
  { href: '/teacher/students', label: 'Students', icon: 'groups' },
  // Board D5 (approved, OC-82): the teacher's public listing (PR-D2).
  { href: '/teacher/listing', label: 'Looking for students', icon: 'person_search' },
  // Board D6 (approved, OC-82): enquiries from parents (PR-D4a).
  { href: '/teacher/enquiries', label: 'Enquiries', icon: 'forum' },
  { href: '/teacher/resources', label: 'Learning resources', icon: 'library_books' },
  { href: '/teacher/profile', label: 'Profile', icon: 'account_circle' },
];

/**
 * M-20 (board 33): while waiting for approval a teacher can open only their status and profile;
 * the other pages show greyed out until approval (OC-38).
 */
export const TEACHER_PENDING_MENU: MenuItem[] = [
  { href: '/teacher/status', label: 'Account status', icon: 'hourglass_top' },
  { href: '/teacher/profile', label: 'Profile', icon: 'account_circle' },
  ...TEACHER_MENU.filter((item) => item.href !== '/teacher/profile').map((item) => ({ ...item, disabled: true })),
];
