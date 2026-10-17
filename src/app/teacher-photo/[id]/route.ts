import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { readPublicPhoto } from '@/server/publicListings';
import { getViewer } from '@/server/session';
import { readPhoto } from '@/server/teacherPhotos';

/**
 * A teacher photo (PR-D1b, PR-D3). Anyone may open an approved photo the teacher agreed to show
 * on a listing that is public now. Otherwise only the teacher themselves or an approver can
 * open it; everyone else gets "not found". Nothing is cached, so a removed or replaced photo
 * stops showing at once.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (isDemoMode()) return notFound();
  const { id } = await params;
  let image = await readPublicPhoto(db(), id);
  if (!image) {
    const viewer = await getViewer();
    if (!viewer || viewer.mfaPending) return notFound();
    image = await readPhoto(db(), id, viewer.id);
  }
  if (!image) return notFound();
  return new Response(new Uint8Array(image), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'X-Robots-Tag': 'noindex',
    },
  });
}
