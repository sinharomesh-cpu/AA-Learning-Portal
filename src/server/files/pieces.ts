import 'server-only';
import type { Db, Sql } from '@/server/db/client';
import { storageStatus } from './limits';
import { FILE_MAX_BYTES } from './prepare';
import { type AttachStep, type FilePurpose, mayReadFile, type StoreResult, storeFile } from './store';

/**
 * Large files on the free host (CR-07 H-2a). The free Vercel plan accepts at most 4.5 MB per
 * request in each direction, so files up to the approved 20 MB travel in pieces of at most 3 MB.
 * Uploads are staged in `upload_parts` and joined on the server; downloads are read back piece
 * by piece. No paid upload service is used (OC-91).
 */

export const PIECE_BYTES = 3 * 1024 * 1024;
export const MAX_PIECES = Math.ceil(FILE_MAX_BYTES / PIECE_BYTES); // 7
/** Unfinished uploads are removed after this long. */
const STALE_MS = 2 * 60 * 60 * 1000;
/** At most this much waiting in pieces per account (a few uploads at once). */
const STAGED_BYTES_PER_OWNER = 2 * FILE_MAX_BYTES;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PieceResult =
  | { ok: true; received: number; total: number; complete: boolean }
  | { ok: false; reason: 'not_allowed' | 'invalid' | 'too_big' | 'busy' | 'storage_full' };

/** Who may send pieces: active parents and approved teachers (the only uploaders, K-10). */
async function mayStage(sql: Db, ownerId: string): Promise<boolean> {
  const [row] = await sql<Array<{ ok: boolean }>>`
    SELECT (a.status = 'active' AND (a.role = 'parent' OR (a.role = 'teacher' AND t.approval_status = 'approved'))) AS ok
    FROM accounts a LEFT JOIN teacher_profiles t ON t.account_id = a.id WHERE a.id = ${ownerId}`;
  return row?.ok === true;
}

export interface Piece {
  uploadId: string;
  part: number;
  total: number;
  fileName: string;
  bytes: Uint8Array;
}

/** Keeps one piece of an upload. Sending the same piece again (a retry) replaces it. */
export async function stagePiece(sql: Sql, ownerId: string, p: Piece, now: Date = new Date()): Promise<PieceResult> {
  if (!UUID.test(ownerId) || !(await mayStage(sql, ownerId))) return { ok: false, reason: 'not_allowed' };
  const name = p.fileName.trim();
  if (
    !UUID.test(p.uploadId) ||
    !Number.isInteger(p.part) ||
    !Number.isInteger(p.total) ||
    p.total < 1 ||
    p.part < 0 ||
    p.part >= p.total ||
    name.length < 1 ||
    name.length > 200 ||
    p.bytes.length < 1
  ) {
    return { ok: false, reason: 'invalid' };
  }
  if (p.total > MAX_PIECES || p.bytes.length > PIECE_BYTES) return { ok: false, reason: 'too_big' };
  // Every piece but the last is full size, so the total size is known early.
  if (p.part < p.total - 1 && p.bytes.length !== PIECE_BYTES) return { ok: false, reason: 'invalid' };

  return sql.begin(async (tx): Promise<PieceResult> => {
    await tx`SELECT id FROM accounts WHERE id = ${ownerId} FOR UPDATE`;
    await tx`DELETE FROM upload_parts WHERE owner_id = ${ownerId} AND created_at < ${new Date(now.getTime() - STALE_MS)}`;
    const status = await storageStatus(tx);
    if (status.level === 'stopped') return { ok: false, reason: 'storage_full' };
    const existing = await tx<Array<{ owner_id: string; total: number; file_name: string }>>`
      SELECT owner_id, total, file_name FROM upload_parts WHERE upload_id = ${p.uploadId} LIMIT 1`;
    const first = existing[0];
    if (first && (first.owner_id !== ownerId || first.total !== p.total || first.file_name !== name)) {
      return { ok: false, reason: 'invalid' };
    }
    const [staged] = await tx<Array<{ n: string }>>`
      SELECT coalesce(sum(octet_length(bytes)), 0)::bigint AS n FROM upload_parts
      WHERE owner_id = ${ownerId} AND NOT (upload_id = ${p.uploadId} AND part = ${p.part})`;
    if (Number(staged!.n) + p.bytes.length > STAGED_BYTES_PER_OWNER) return { ok: false, reason: 'busy' };
    await tx`
      INSERT INTO upload_parts (upload_id, owner_id, part, total, bytes, file_name, created_at)
      VALUES (${p.uploadId}, ${ownerId}, ${p.part}, ${p.total}, ${Buffer.from(p.bytes)}, ${name}, ${now})
      ON CONFLICT (upload_id, part) DO UPDATE SET bytes = EXCLUDED.bytes, created_at = EXCLUDED.created_at`;
    const [count] = await tx<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM upload_parts WHERE upload_id = ${p.uploadId}`;
    return { ok: true, received: count!.n, total: p.total, complete: count!.n === p.total };
  });
}

/** Joins a complete upload's pieces, or null if it is missing, incomplete or someone else's. */
async function joinPieces(
  sql: Db,
  ownerId: string,
  uploadId: string,
): Promise<{ bytes: Buffer; fileName: string } | null> {
  if (!UUID.test(ownerId) || !UUID.test(uploadId)) return null;
  const rows = await sql<Array<{ part: number; total: number; bytes: Buffer; file_name: string }>>`
    SELECT part, total, bytes, file_name FROM upload_parts
    WHERE upload_id = ${uploadId} AND owner_id = ${ownerId} ORDER BY part`;
  if (rows.length === 0 || rows.length !== rows[0]!.total || rows.some((r, i) => r.part !== i)) return null;
  return { bytes: Buffer.concat(rows.map((r) => r.bytes)), fileName: rows[0]!.file_name };
}

/**
 * Saves an upload that arrived in pieces, exactly as `storeFile` would (all the checks and
 * limits). The pieces are removed afterwards whatever the outcome; they never count as quota.
 */
export async function storeUploadedFile(
  sql: Sql,
  ownerId: string,
  purpose: FilePurpose,
  uploadId: string,
  now: Date = new Date(),
  attach?: AttachStep,
): Promise<StoreResult | { ok: false; reason: 'upload_missing' }> {
  const joined = await joinPieces(sql, ownerId, uploadId);
  if (!joined) return { ok: false, reason: 'upload_missing' };
  try {
    return await storeFile(sql, ownerId, purpose, joined.bytes, joined.fileName, now, attach);
  } finally {
    await sql`DELETE FROM upload_parts WHERE upload_id = ${uploadId} AND owner_id = ${ownerId}`;
  }
}

/** Removes every unfinished upload older than two hours (also done on each new piece). */
export async function removeStaleUploads(sql: Db, now: Date = new Date()): Promise<number> {
  const rows = await sql`DELETE FROM upload_parts WHERE created_at < ${new Date(now.getTime() - STALE_MS)} RETURNING 1`;
  return rows.length;
}

export interface FileOutline {
  mediaType: string;
  fileName: string;
  byteSize: number;
  pieces: number;
}

/** What a viewer needs to fetch a file in pieces; null if they may not read it. */
export async function fileOutline(sql: Db, viewerId: string, fileId: string): Promise<FileOutline | null> {
  const meta = await mayReadFile(sql, viewerId, fileId);
  if (!meta) return null;
  return {
    mediaType: meta.mediaType,
    fileName: meta.fileName,
    byteSize: meta.byteSize,
    pieces: Math.max(1, Math.ceil(meta.byteSize / PIECE_BYTES)),
  };
}

/** One piece of a file for a viewer allowed to read it, read straight from the database. */
export async function readFilePiece(sql: Db, viewerId: string, fileId: string, piece: number): Promise<Buffer | null> {
  const meta = await mayReadFile(sql, viewerId, fileId);
  if (!meta || !Number.isInteger(piece) || piece < 0 || piece * PIECE_BYTES >= meta.byteSize) return null;
  const [row] = await sql<Array<{ chunk: Buffer | null }>>`
    SELECT substring(body FROM ${piece * PIECE_BYTES + 1} FOR ${PIECE_BYTES}) AS chunk
    FROM stored_files WHERE id = ${fileId} AND storage = 'database' AND deleted_at IS NULL`;
  return row?.chunk ?? null;
}
