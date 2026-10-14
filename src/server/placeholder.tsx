import 'server-only';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import type { Role } from '@/lib/roles';
import { requireRole } from './authz';

const HOME: Record<Exclude<Role, 'student'>, { href: string; label: string }> = {
  parent: { href: '/parent', label: 'Go to family home' },
  teacher: { href: '/teacher', label: 'Go to my dashboard' },
  superadmin: { href: '/admin', label: 'Go to admin home' },
};

/**
 * A menu page that a later phase delivers. It still enforces the role on the server, so the
 * placeholder never leaks another role's area (FR-002).
 */
export function rolePlaceholder(role: Exclude<Role, 'student'>, title: string, body: string) {
  return async function PlaceholderPage() {
    const access = await requireRole(role);
    if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
    return <NotReadyYet title={title} body={body} homeHref={HOME[role].href} homeLabel={HOME[role].label} />;
  };
}
