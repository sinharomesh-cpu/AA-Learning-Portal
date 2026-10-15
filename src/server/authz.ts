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
  return viewer.role === role ? { allowed: true, viewer } : { allowed: false, viewer };
}
