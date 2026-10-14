import type { MenuItem } from '@/components/shell/AdultShell';

/** Super Admin v1 menu (OC-21). Integration Health is deferred and absent (OC-19). */
export const ADMIN_MENU: MenuItem[] = [
  { href: '/admin', label: 'Home', exact: true },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/approvals', label: 'Teacher approvals' },
  { href: '/admin/audit-log', label: 'Audit log' },
];

/** Parent and Teacher menus grow once their dashboards are designed and approved (OC-26). */
export const PARENT_MENU: MenuItem[] = [{ href: '/parent', label: 'Home', exact: true }];
export const TEACHER_MENU: MenuItem[] = [{ href: '/teacher', label: 'Home', exact: true }];
