'use client';

import { FILE_MAX_BYTES, pieceRanges, uploadProblemText } from '@/lib/filePieces';

export type SendResult = { ok: true; uploadId: string } | { ok: false; message: string };

/**
 * Sends one file to /files/upload in pieces of at most 3 MB (CR-07 H-2a: the free host accepts
 * at most 4.5 MB per request). The server joins and checks it when the form that uses it is sent.
 */
export async function sendInPieces(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<SendResult> {
  if (file.size === 0) return { ok: false, message: 'This file is empty. Please choose another file.' };
  if (file.size > FILE_MAX_BYTES) return { ok: false, message: 'This file is too large. Files can be up to 20 MB.' };
  const uploadId = crypto.randomUUID();
  const ranges = pieceRanges(file.size);
  for (let i = 0; i < ranges.length; i += 1) {
    const [start, end] = ranges[i]!;
    const params = new URLSearchParams({
      upload: uploadId,
      piece: String(i),
      of: String(ranges.length),
      name: file.name,
    });
    let res: Response | null = null;
    // One retry for a dropped connection or a server hiccup; the server replaces a repeated piece.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        res = await fetch(`/files/upload?${params}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-AA-Upload': '1' },
          body: file.slice(start, end),
        });
      } catch {
        res = null;
      }
      if (res && res.status < 500) break;
    }
    if (!res?.ok) {
      const reason = res ? (((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? '') : '';
      return { ok: false, message: uploadProblemText(reason) };
    }
    onProgress?.(i + 1, ranges.length);
  }
  return { ok: true, uploadId };
}

/** Reads a private file back piece by piece (as the file viewer does); kept in memory only. */
export async function fetchInPieces(fileId: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const outline = await fetch(`/files/${fileId}?outline=1`, { cache: 'no-store', signal });
  if (!outline.ok) throw new Error('outline');
  const { pieces } = (await outline.json()) as { pieces: number };
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let i = 0; i < pieces; i += 1) {
    const res = await fetch(`/files/${fileId}?piece=${i}`, { cache: 'no-store', signal });
    if (!res.ok) throw new Error('piece');
    const part = new Uint8Array(await res.arrayBuffer());
    parts.push(part);
    size += part.length;
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    joined.set(p, at);
    at += p.length;
  }
  return joined.buffer;
}
