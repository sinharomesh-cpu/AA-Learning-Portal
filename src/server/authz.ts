import 'server-only';
import { redirect } from 'next/navigation';
import type { Persona } from '@/fixtures/personas';
import type { Role } from '@/lib/roles';
import { getViewer } from './session';

export type Access = { allowed: true; viewer: Persona } | { allowed: false; viewer: Persona };

/**
 * Server-side role check (FR-002). Every page in a role's area calls this before loading
 * any data, because a layout check alone does not stop a page from rendering.
 * - No session: redirect to sign-in.
 * - Wrong role: the caller renders the viewer's own access-denied state and loads no data.
 */
export async function requireRole(role: Role): Promise<Access> {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  // A teacher waiting for approval sees only their status page (OC-38, M-21).
  if (viewer.role === 'teacher' && viewer.status === 'pending_approval') redirect('/teacher/status');
  // A Super Admin opens nothing until the security-code step is passed (M-26, OC-50).
  if (viewer.mfaPending) redirect('/security-check');
  return viewer.role === role ? { allowed: true, viewer } : { allowed: false, viewer };
}

/**
 * The admin area (WP2-5b). The Super Admin may open everything; an Admin only what the Super
 * Admin ticked for them (board 66); "superadmin" pages (Admins) are the Super Admin's alone.
 * The server functions in admin.ts check the same rules again against the database.
 */
export async function requireAdmin(
  permission?: 'accounts' | 'teacher_approvals' | 'audit_log' | 'superadmin',
): Promise<Access> {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.mfaPending) redirect('/security-check');
  if (viewer.role === 'superadmin') return { allowed: true, viewer };
  if (viewer.role !== 'admin' || permission === 'superadmin') return { allowed: false, viewer };
  return !permission || (viewer.permissions ?? []).includes(permission)
    ? { allowed: true, viewer }
    : { allowed: false, viewer };
}
