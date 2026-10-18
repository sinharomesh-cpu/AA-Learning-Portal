import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { PIECE_BYTES, stagePiece } from '@/server/files/pieces';
import { getViewer } from '@/server/session';

/**
 * One piece of an upload (CR-07 H-2a). The browser splits a file into pieces of at most 3 MB,
 * because the free host accepts at most 4.5 MB per request. The pieces are joined and checked
 * when the form that uses the upload is sent; nothing is saved as a file here.
 *
 * Only same-site requests from a signed-in parent or approved teacher are accepted: the
 * `X-AA-Upload` header cannot be sent by another site without the browser asking first, and the
 * Origin must be this site.
 */
const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (isDemoMode()) return reply(404, { ok: false, reason: 'not_allowed' });
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (request.headers.get('x-aa-upload') !== '1' || !origin || !host || new URL(origin).host !== host) {
    return reply(403, { ok: false, reason: 'not_allowed' });
  }
  const viewer = await getViewer();
  if (!viewer || viewer.mfaPending || (viewer.role !== 'parent' && viewer.role !== 'teacher')) {
    return reply(403, { ok: false, reason: 'not_allowed' });
  }
  const length = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(length) || length > PIECE_BYTES) return reply(413, { ok: false, reason: 'too_big' });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > PIECE_BYTES) return reply(413, { ok: false, reason: 'too_big' });

  const r = await stagePiece(db(), viewer.id, {
    uploadId: url.searchParams.get('upload') ?? '',
    part: Number(url.searchParams.get('piece')),
    total: Number(url.searchParams.get('of')),
    fileName: url.searchParams.get('name') ?? '',
    bytes,
  });
  if (r.ok) return reply(200, r);
  return reply(r.reason === 'not_allowed' ? 403 : r.reason === 'too_big' ? 413 : 400, r);
}
