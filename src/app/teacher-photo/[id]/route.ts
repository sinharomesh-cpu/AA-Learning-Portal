import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getViewer } from '@/server/session';
import { readPhoto } from '@/server/teacherPhotos';

/**
 * A teacher photo (PR-D1b). Only the teacher themselves or an approver can open one; anyone
 * else, including signed-out visitors, gets "not found". Nothing is cached by browsers or
 * shared caches, so a removed or replaced photo stops showing at once.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (isDemoMode()) return notFound();
  const viewer = await getViewer();
  if (!viewer || viewer.mfaPending) return notFound();
  const { id } = await params;
  const image = await readPhoto(db(), id, viewer.id);
  if (!image) return notFound();
  return new Response(new Uint8Array(image), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
    },
  });
}
