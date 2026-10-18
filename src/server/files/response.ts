import type { FileMeta } from './store';

/** The one "not found" answer for every refused or missing file: same status, body and headers. */
export function notFoundResponse(): Response {
  return new Response('Not found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** RFC 6266 file name: a plain ASCII fallback plus the UTF-8 name. */
function disposition(kind: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** A stored file for an allowed viewer. Pictures may not run anything; nothing is cached. */
export function fileResponse(meta: FileMeta, body: Buffer, download: boolean): Response {
  const headers: Record<string, string> = {
    'Content-Type': meta.mediaType,
    'Content-Length': String(body.length),
    'Cache-Control': 'private, no-store',
    'Content-Disposition': disposition(download ? 'attachment' : 'inline', meta.fileName),
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  };
  if (meta.mediaType !== 'application/pdf') headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
  return new Response(new Uint8Array(body), { headers });
}
