import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { fileResponse, notFoundResponse } from '@/server/files/response';
import { readFileForViewer } from '@/server/files/store';
import { getViewer } from '@/server/session';

/**
 * A private file (CR-07 H-1): a teacher resource or a homework page. Only a viewer allowed by
 * `mayReadFile` gets it; everyone else, including Admins and the Super Admin (OC-90 Q-8), gets
 * the same "not found". `?download=1` asks the browser to save it; any allowed viewer may
 * download (OC-90 Q-3). Nothing is cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoMode()) return notFoundResponse();
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer || viewer.mfaPending) return notFoundResponse();
  const file = await readFileForViewer(db(), viewer.id, id);
  if (!file) return notFoundResponse();
  const download = new URL(request.url).searchParams.get('download') === '1';
  return fileResponse(file.meta, file.body, download);
}
