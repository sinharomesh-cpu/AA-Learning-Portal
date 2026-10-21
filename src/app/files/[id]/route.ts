import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { fileOutline, readFilePiece } from '@/server/files/pieces';
import { fileResponse, notFoundResponse } from '@/server/files/response';
import { noteRefusedRead, readFileForViewer } from '@/server/files/store';
import { getViewer } from '@/server/session';

/**
 * A private file (CR-07 H-1, H-2a): a teacher resource or a homework page. Only a viewer allowed
 * by `mayReadFile` gets it; everyone else, including Admins and the Super Admin (OC-90 Q-8), gets
 * the same "not found". Nothing is cached.
 *
 * - `?outline=1`: size and number of pieces, for the file viewer.
 * - `?piece=n`: one piece of at most 3 MB. The free host returns at most 4.5 MB per request, so
 *   the viewer fetches large files piece by piece and joins them in the browser.
 * - no parameter: the whole file (fine for files under 4.5 MB, and locally); `?download=1` asks
 *   the browser to save it. Any allowed viewer may download (OC-90 Q-3), except books: only
 *   their parent owner (OC-41(5)); others read books in the book viewer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoMode()) return notFoundResponse();
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer || viewer.mfaPending) return notFoundResponse();
  const search = new URL(request.url).searchParams;
  const sql = db();

  if (search.get('outline') === '1') {
    const outline = await fileOutline(sql, viewer.id, id);
    if (!outline) {
      await noteRefusedRead(sql, viewer.id, id);
      return notFoundResponse();
    }
    return Response.json(outline, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  }

  const pieceParam = search.get('piece');
  if (pieceParam !== null) {
    const piece = /^\d{1,2}$/.test(pieceParam) ? Number(pieceParam) : -1;
    const bytes = await readFilePiece(sql, viewer.id, id, piece);
    if (!bytes) return notFoundResponse();
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  const file = await readFileForViewer(sql, viewer.id, id);
  if (!file) return notFoundResponse();
  // Books (CR-17 PR B1, OC-41(5)): only the parent who uploaded it gets the file itself or a
  // download. Children and linked teachers read it page by page in AA Pro's book viewer.
  if (file.meta.purpose === 'book' && file.meta.ownerId !== viewer.id) return notFoundResponse();
  return fileResponse(file.meta, file.body, search.get('download') === '1');
}
