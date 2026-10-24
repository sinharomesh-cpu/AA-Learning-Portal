import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { notFoundResponse } from '@/server/files/response';
import { joinTarget } from '@/server/meetingLinks';
import { getViewer } from '@/server/session';

/**
 * Join Class (CR-17 PR 3, OC-44, D3A-1). The teacher's own Zoom link is never in any page: this
 * address checks, on the server and at the moment of the click, that the viewer is the lesson's
 * teacher, an active parent of the child or the child; that the lesson is confirmed and inside
 * its window (10 minutes before the start until the end, database clock); that a parent allows
 * the teacher's meeting links; and that a link was added. Only then does it send the browser on
 * to Zoom. Anyone else gets the same "not found" as an unknown lesson. Nothing is cached.
 */
const HOME: Record<'parent' | 'teacher' | 'student', string> = {
  parent: '/parent/calendar',
  teacher: '/teacher/schedule',
  student: '/student/schedule',
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoMode()) return notFoundResponse();
  const viewer = await getViewer();
  if (!viewer || viewer.mfaPending) return notFoundResponse();
  if (viewer.role !== 'parent' && viewer.role !== 'teacher' && viewer.role !== 'student') return notFoundResponse();
  const { id } = await params;
  const r = await joinTarget(db(), { id: viewer.id, role: viewer.role }, id);
  // The site-wide headers already send at most the origin to other sites (strict-origin-when-cross-
  // origin), and the Join Class link itself has rel="noreferrer".
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
  if (r.ok) return new Response(null, { status: 303, headers: { ...headers, Location: r.url } });
  if (r.reason === 'not_found') return notFoundResponse();
  const back = new URL(`${HOME[viewer.role]}?join=${r.reason}`, request.url);
  return new Response(null, { status: 303, headers: { ...headers, Location: back.pathname + back.search } });
}
