import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { cleanPublicFilters, countPublicListings } from '@/server/publicListings';
import { realAuthEnabled } from '@/server/realAuth';

export const dynamic = 'force-dynamic';

/**
 * OC-105 (board SF2): how many published teachers match the choices staged in the phone filter
 * sheet, for "Show N teachers". Public data only (the same rules as /teachers); just a number.
 */
export async function GET(request: Request): Promise<Response> {
  const q = Object.fromEntries(new URL(request.url).searchParams);
  if (isDemoMode() || !realAuthEnabled()) return Response.json({ count: 0 });
  try {
    const count = await countPublicListings(db(), cleanPublicFilters(q));
    return Response.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
}
