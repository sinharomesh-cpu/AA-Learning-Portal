import 'server-only';
import { createHash } from 'node:crypto';
import { writeAudit } from '@/server/auth/audit';
import type { Db, Sql, Tx } from '@/server/db/client';
import { getStorageSettings, MB, noteStorageLevel, ownUsage, STORAGE_LOCK, storageStatus } from './limits';
import { type FileProblem, prepareFile, type StoredMediaType } from './prepare';

/**
 * The private file store (CR-07 H-1). One place that saves, reads and removes files for
 * teacher resources (H-2) and handwritten homework pages (H-4).
 *
 * - For the test environment the bytes live in AA Pro's own database (OC-87 Q-9, OC-91). An
 *   object store chosen later with the owner's budget approval plugs in behind `FileBodies`.
 * - Who may read a file is decided only by `mayReadFile`. Anything not allowed looks exactly
 *   like a missing file. Admins and the Super Admin never read children's files (OC-90 Q-8).
 * - The audit trail records uploads, removals and refused reads, never file contents or names.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 24 * 60 * 60 * 1000;

export type FilePurpose = 'teacher_resource' | 'submission_page';

/** Where file bytes live. Only the database is used until a paid store is approved (OC-91). */
interface FileBodies {
  read(sql: Db, id: string): Promise<Buffer | null>;
}
const databaseBodies: FileBodies = {
  async read(sql, id) {
    const [row] = await sql<Array<{ body: Buffer | null }>>`
      SELECT body FROM stored_files WHERE id = ${id} AND storage = 'database' AND deleted_at IS NULL`;
    return row?.body ?? null;
  },
};

const OWNER_ROLE: Record<FilePurpose, 'teacher' | 'parent'> = {
  teacher_resource: 'teacher',
  submission_page: 'parent',
};

/** Only active accounts store files; a teacher must also be approved. */
async function mayUpload(sql: Db, ownerId: string, purpose: FilePurpose): Promise<boolean> {
  const [row] = await sql<Array<{ ok: boolean }>>`
    SELECT (a.role = ${OWNER_ROLE[purpose]} AND a.status = 'active'
            AND (a.role <> 'teacher' OR t.approval_status = 'approved')) AS ok
    FROM accounts a LEFT JOIN teacher_profiles t ON t.account_id = a.id
    WHERE a.id = ${ownerId}`;
  return row?.ok === true;
}

export type StoreResult =
  | { ok: true; fileId: string; mediaType: StoredMediaType; byteSize: number; fileName: string }
  | { ok: false; reason: 'not_allowed' | FileProblem }
  /** Today's uploads are used up (OC-96); the next one is allowed at `nextUploadAt`. */
  | { ok: false; reason: 'daily_limit'; limit: number; nextUploadAt: Date | null }
  /** This file would take the account past its storage (OC-96). */
  | { ok: false; reason: 'space_full'; usedBytes: number; limitBytes: number }
  /** The environment is at the stop level of the free allowance; nothing is upgraded (OC-91, OC-96). */
  | { ok: false; reason: 'storage_full' }
  /** The caller's own step (for example "share with these students") refused; nothing was saved. */
  | { ok: false; reason: 'refused'; detail: string };

/**
 * A step the caller runs in the same transaction as the save, such as creating the resource
 * that uses the file. If it refuses, nothing is saved and no quota is used.
 */
export type AttachStep = (tx: Tx, fileId: string) => Promise<{ ok: true } | { ok: false; detail: string }>;

class AttachRefused extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
}

/**
 * Checks, converts and saves one upload for its owner. The caller (H-2, H-4) links the returned
 * file to a resource or homework page in the same request.
 */
export async function storeFile(
  sql: Sql,
  ownerId: string,
  purpose: FilePurpose,
  bytes: Uint8Array,
  originalName: string | null,
  now: Date = new Date(),
  attach?: AttachStep,
): Promise<StoreResult> {
  if (!UUID.test(ownerId) || !(purpose in OWNER_ROLE) || !(await mayUpload(sql, ownerId, purpose))) {
    return { ok: false, reason: 'not_allowed' };
  }
  const prepared = await prepareFile(bytes, originalName);
  if (!prepared.ok) return { ok: false, reason: prepared.problem };
  const { body, mediaType, fileName } = prepared;
  try {
    return await saveChecked(sql, ownerId, purpose, body, mediaType, fileName, now, attach);
  } catch (e) {
    if (e instanceof AttachRefused) return { ok: false, reason: 'refused', detail: e.detail };
    throw e;
  }
}

async function saveChecked(
  sql: Sql,
  ownerId: string,
  purpose: FilePurpose,
  body: Buffer,
  mediaType: StoredMediaType,
  fileName: string,
  now: Date,
  attach: AttachStep | undefined,
): Promise<StoreResult> {
  const sha256 = createHash('sha256').update(body).digest();
  return sql.begin(async (tx): Promise<StoreResult> => {
    // One upload at a time across the environment, so no two uploads can both squeeze past a
    // limit. Every check below reads the current settings (OC-96).
    await tx`SELECT pg_advisory_xact_lock(${STORAGE_LOCK})`;
    if (!(await mayUpload(tx, ownerId, purpose))) return { ok: false, reason: 'not_allowed' };
    const settings = await getStorageSettings(tx);
    const status = await storageStatus(tx, settings);
    if (status.databaseBytes + body.length >= status.stopBytes) {
      await noteStorageLevel(tx, 'stopped', now);
      return { ok: false, reason: 'storage_full' };
    }
    const usage = await ownUsage(tx, ownerId, now, settings);
    if (usage.uploadsToday >= usage.uploadsPerDay) {
      return { ok: false, reason: 'daily_limit', limit: usage.uploadsPerDay, nextUploadAt: usage.nextUploadAt };
    }
    if (usage.usedBytes + body.length > settings.file_mb_per_account * MB) {
      return { ok: false, reason: 'space_full', usedBytes: usage.usedBytes, limitBytes: usage.limitBytes };
    }

    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO stored_files (owner_id, purpose, media_type, byte_size, sha256, file_name, storage, body, created_at)
      VALUES (${ownerId}, ${purpose}, ${mediaType}, ${body.length}, ${sha256}, ${fileName}, 'database', ${body}, ${now})
      RETURNING id`;
    await tx`INSERT INTO rate_events (account_id, kind, occurred_at) VALUES (${ownerId}, 'file_upload', ${now})`;
    await tx`DELETE FROM rate_events WHERE account_id = ${ownerId} AND kind = 'file_upload'
             AND occurred_at < ${new Date(now.getTime() - 2 * DAY)}`;
    await writeAudit(
      tx,
      {
        type: 'FILE_STORED',
        outcome: 'success',
        actorId: ownerId,
        subjectId: ownerId,
        details: { fileId: row!.id, purpose, mediaType, byteSize: body.length },
      },
      now,
    );
    if (attach) {
      const linked = await attach(tx, row!.id);
      // Throwing rolls back the file, the upload count and the audit entry together.
      if (!linked.ok) throw new AttachRefused(linked.detail);
    }
    // Only a saved file counts towards today's uploads: refused or failed uploads never reach
    // this point, and a failure below rolls the whole transaction back.
    if (status.databaseBytes + body.length >= status.warnBytes) await noteStorageLevel(tx, 'warning', now);
    return { ok: true, fileId: row!.id, mediaType, byteSize: body.length, fileName };
  });
}

export interface FileMeta {
  id: string;
  ownerId: string;
  purpose: FilePurpose;
  mediaType: StoredMediaType;
  byteSize: number;
  fileName: string;
}

/**
 * One reason a viewer may read a file. H-1 has only "the owner"; H-2 adds "shared with me or my
 * child" and H-4 adds "a homework page on my child's or my own assignment".
 */
type AccessRule = (sql: Db, viewer: { id: string; role: string }, file: FileMeta) => Promise<boolean>;

const ACCESS_RULES: AccessRule[] = [async (_sql, viewer, file) => viewer.id === file.ownerId];

/** The file's details if this viewer may read it, otherwise null (the same as "not found"). */
export async function mayReadFile(sql: Db, viewerId: string, fileId: string): Promise<FileMeta | null> {
  if (!UUID.test(viewerId) || !UUID.test(fileId)) return null;
  const [viewer] = await sql<Array<{ id: string; role: string }>>`
    SELECT id, role FROM accounts WHERE id = ${viewerId} AND status = 'active'`;
  // Admins and the Super Admin never read children's or teachers' files, with no override (OC-90 Q-8).
  if (!viewer || viewer.role === 'admin' || viewer.role === 'superadmin') return null;
  const [row] = await sql<
    Array<{
      id: string;
      owner_id: string;
      purpose: FilePurpose;
      media_type: StoredMediaType;
      byte_size: number;
      file_name: string;
    }>
  >`SELECT id, owner_id, purpose, media_type, byte_size, file_name
    FROM stored_files WHERE id = ${fileId} AND deleted_at IS NULL`;
  if (!row) return null;
  const file: FileMeta = {
    id: row.id,
    ownerId: row.owner_id,
    purpose: row.purpose,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    fileName: row.file_name,
  };
  for (const rule of ACCESS_RULES) if (await rule(sql, viewer, file)) return file;
  return null;
}

/** Records a refused read of an existing file by a real account (never the file's contents). */
export async function noteRefusedRead(
  sql: Db,
  viewerId: string,
  fileId: string,
  now: Date = new Date(),
): Promise<void> {
  if (!UUID.test(viewerId) || !UUID.test(fileId)) return;
  const [exists] = await sql`SELECT 1 FROM stored_files WHERE id = ${fileId}`;
  const [actor] = await sql`SELECT 1 FROM accounts WHERE id = ${viewerId}`;
  if (exists && actor) {
    await writeAudit(
      sql,
      { type: 'FILE_READ_REFUSED', outcome: 'denied', actorId: viewerId, details: { fileId } },
      now,
    );
  }
}

/** Reads a file for a viewer. A refusal is recorded in the audit trail and looks like "not found". */
export async function readFileForViewer(
  sql: Db,
  viewerId: string,
  fileId: string,
  now: Date = new Date(),
): Promise<{ meta: FileMeta; body: Buffer } | null> {
  const meta = await mayReadFile(sql, viewerId, fileId);
  if (!meta) {
    await noteRefusedRead(sql, viewerId, fileId, now);
    return null;
  }
  const body = await databaseBodies.read(sql, fileId);
  return body ? { meta, body } : null;
}

/** The owner removes a file: the bytes go at once; the row stays so history can say it was removed. */
export async function removeFile(sql: Sql, ownerId: string, fileId: string, now: Date = new Date()): Promise<boolean> {
  if (!UUID.test(ownerId) || !UUID.test(fileId)) return false;
  return sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE stored_files SET deleted_at = ${now}, body = NULL, object_key = NULL
      WHERE id = ${fileId} AND owner_id = ${ownerId} AND deleted_at IS NULL
      RETURNING id`;
    if (rows.length === 0) return false;
    await writeAudit(
      tx,
      { type: 'FILE_REMOVED', outcome: 'success', actorId: ownerId, subjectId: ownerId, details: { fileId } },
      now,
    );
    return true;
  });
}
