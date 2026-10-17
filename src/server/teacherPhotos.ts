import 'server-only';
import sharp from 'sharp';
import { mayAct } from './admin';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';

/**
 * Optional teacher photos (PR-D1b; OC-84, OC-85).
 *
 * - Stored in AA Pro's own database; every upload is re-encoded on the server to a 400 × 400
 *   WebP. Re-encoding drops all metadata (camera, date, location) and anything that is not a
 *   picture.
 * - A new photo waits for the AA Pro team. Families and visitors never see a photo that is not
 *   approved; until then (or without a photo) the teacher's initial is shown. Public display
 *   also needs the teacher's listing consent (PR-D2).
 * - Only the teacher changes their own photo; only an approver (Super Admin, or an Admin with
 *   "teacher approvals") decides. The teacher always comes from the session.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Largest file the server accepts (the browser shrinks photos before sending). */
export const PHOTO_MAX_BYTES = 900 * 1024;
export const PHOTO_SIZE = 400;
const MIN_SIDE = 200;
const NOTE_MAX = 500;

export type PhotoProblem = 'empty' | 'too_big' | 'type' | 'unreadable' | 'too_small';

/** JPEG, PNG or WebP, judged by the file's first bytes rather than its name or stated type. */
export function imageKind(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === 'RIFF' &&
    String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!) === 'WEBP'
  )
    return 'webp';
  return null;
}

/** Checks and re-encodes an upload: square 400 × 400 WebP, no metadata. */
export async function processPhoto(
  bytes: Uint8Array,
): Promise<{ ok: true; image: Buffer } | { ok: false; problem: PhotoProblem }> {
  if (bytes.length === 0) return { ok: false, problem: 'empty' };
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, problem: 'too_big' };
  if (!imageKind(bytes)) return { ok: false, problem: 'type' };
  try {
    // limitInputPixels stops "decompression bombs"; animated images use their first frame.
    const input = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error', animated: false });
    const meta = await input.metadata();
    if (!meta.width || !meta.height) return { ok: false, problem: 'unreadable' };
    if (Math.min(meta.width, meta.height) < MIN_SIDE) return { ok: false, problem: 'too_small' };
    const image = await input
      .rotate() // honour the camera's orientation, then forget it
      .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer();
    return { ok: true, image };
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
}

async function teacherMayEdit(sql: Db, teacherId: string): Promise<boolean> {
  const [row] = await sql<Array<{ ok: boolean }>>`
    SELECT ((a.status = 'active' AND t.approval_status = 'approved')
            OR (a.status = 'pending_approval' AND t.approval_status NOT IN ('approved', 'rejected'))) AS ok
    FROM accounts a JOIN teacher_profiles t ON t.account_id = a.id
    WHERE a.id = ${teacherId} AND a.role = 'teacher'`;
  return row?.ok === true;
}

export type UploadResult = { ok: true } | { ok: false; reason: 'not_allowed' } | { ok: false; reason: PhotoProblem };

/** The teacher uploads a new photo; it replaces any photo still waiting and waits for review. */
export async function uploadTeacherPhoto(
  sql: Sql,
  teacherId: string,
  bytes: Uint8Array,
  now: Date = new Date(),
): Promise<UploadResult> {
  if (!UUID.test(teacherId) || !(await teacherMayEdit(sql, teacherId))) return { ok: false, reason: 'not_allowed' };
  const processed = await processPhoto(bytes);
  if (!processed.ok) return { ok: false, reason: processed.problem };
  return sql.begin(async (tx): Promise<UploadResult> => {
    // Lock the teacher so two uploads at once cannot both become "the" waiting photo.
    await tx`SELECT id FROM accounts WHERE id = ${teacherId} FOR UPDATE`;
    if (!(await teacherMayEdit(tx, teacherId))) return { ok: false, reason: 'not_allowed' };
    await tx`DELETE FROM teacher_photos WHERE teacher_id = ${teacherId} AND status IN ('pending', 'declined')`;
    await tx`INSERT INTO teacher_photos (teacher_id, status, image, uploaded_at)
             VALUES (${teacherId}, 'pending', ${processed.image}, ${now})`;
    await writeAudit(
      tx,
      { type: 'TEACHER_PHOTO_UPLOADED', outcome: 'success', actorId: teacherId, subjectId: teacherId },
      now,
    );
    return { ok: true };
  });
}

/** The teacher removes their photos (approved and waiting); the initial is shown again. */
export async function removeTeacherPhoto(
  sql: Sql,
  teacherId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'not_allowed' }> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  return sql.begin(async (tx) => {
    const [t] = await tx`SELECT 1 FROM accounts WHERE id = ${teacherId} AND role = 'teacher'`;
    if (!t) return { ok: false as const, reason: 'not_allowed' as const };
    await tx`DELETE FROM teacher_photos WHERE teacher_id = ${teacherId}`;
    await writeAudit(
      tx,
      { type: 'TEACHER_PHOTO_REMOVED', outcome: 'success', actorId: teacherId, subjectId: teacherId },
      now,
    );
    return { ok: true as const };
  });
}

export interface OwnPhotoState {
  approvedId: string | null;
  pending: { id: string; uploadedAt: Date } | null;
  declined: { note: string | null; decidedAt: Date } | null;
}

/** What the teacher sees about their own photo. */
export async function ownPhotoState(sql: Db, teacherId: string): Promise<OwnPhotoState> {
  const state: OwnPhotoState = { approvedId: null, pending: null, declined: null };
  if (!UUID.test(teacherId)) return state;
  const rows = await sql<
    Array<{ id: string; status: string; uploaded_at: Date; decision_note: string | null; decided_at: Date | null }>
  >`SELECT id, status, uploaded_at, decision_note, decided_at FROM teacher_photos WHERE teacher_id = ${teacherId}`;
  for (const r of rows) {
    if (r.status === 'approved') state.approvedId = r.id;
    if (r.status === 'pending') state.pending = { id: r.id, uploadedAt: r.uploaded_at };
    if (r.status === 'declined' && r.decided_at) state.declined = { note: r.decision_note, decidedAt: r.decided_at };
  }
  return state;
}

export interface PendingPhoto {
  id: string;
  teacherId: string;
  name: string;
  uploadedAt: Date;
  /** The teacher's current approved photo, if any (shown for comparison). */
  approvedId: string | null;
}

/** Photos waiting for the AA Pro team, oldest first. Null when the actor may not decide. */
export async function listPendingPhotos(sql: Db, actorId: string): Promise<PendingPhoto[] | null> {
  if (!(await mayAct(sql, actorId, 'teacher_approvals'))) return null;
  const rows = await sql<
    Array<{ id: string; teacher_id: string; name: string; uploaded_at: Date; approved_id: string | null }>
  >`SELECT p.id, p.teacher_id, a.display_name AS name, p.uploaded_at,
           (SELECT q.id FROM teacher_photos q WHERE q.teacher_id = p.teacher_id AND q.status = 'approved') AS approved_id
    FROM teacher_photos p JOIN accounts a ON a.id = p.teacher_id
    WHERE p.status = 'pending' AND a.status IN ('active', 'pending_approval')
    ORDER BY p.uploaded_at, p.id`;
  return rows.map((r) => ({
    id: r.id,
    teacherId: r.teacher_id,
    name: r.name,
    uploadedAt: r.uploaded_at,
    approvedId: r.approved_id,
  }));
}

export type PhotoDecisionResult =
  { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'note_required' | 'note_too_long' };

/**
 * Approve: the photo replaces the teacher's approved one. Decline: the picture is deleted and
 * only the note is kept for the teacher (a note is required, so they know what to change).
 */
export async function decidePhoto(
  sql: Sql,
  actorId: string,
  photoId: string,
  decision: 'approve' | 'decline',
  note: string,
  now: Date = new Date(),
): Promise<PhotoDecisionResult> {
  if (!UUID.test(photoId)) return { ok: false, reason: 'not_found' };
  if (!(await mayAct(sql, actorId, 'teacher_approvals'))) return { ok: false, reason: 'not_allowed' };
  const text = note.normalize('NFC').trim();
  if (decision === 'decline' && text.length < 3) return { ok: false, reason: 'note_required' };
  if ([...text].length > NOTE_MAX) return { ok: false, reason: 'note_too_long' };
  return sql.begin(async (tx): Promise<PhotoDecisionResult> => {
    const [photo] = await tx<Array<{ teacher_id: string }>>`
      SELECT teacher_id FROM teacher_photos WHERE id = ${photoId} AND status = 'pending' FOR UPDATE`;
    if (!photo) return { ok: false, reason: 'not_found' };
    if (decision === 'approve') {
      await tx`DELETE FROM teacher_photos WHERE teacher_id = ${photo.teacher_id} AND status = 'approved'`;
      await tx`DELETE FROM teacher_photos WHERE teacher_id = ${photo.teacher_id} AND status = 'declined'`;
      await tx`UPDATE teacher_photos SET status = 'approved', decided_by = ${actorId}, decided_at = ${now},
                 decision_note = ${text || null}
               WHERE id = ${photoId}`;
    } else {
      await tx`DELETE FROM teacher_photos WHERE teacher_id = ${photo.teacher_id} AND status = 'declined'`;
      await tx`UPDATE teacher_photos SET status = 'declined', image = NULL, decided_by = ${actorId},
                 decided_at = ${now}, decision_note = ${text}
               WHERE id = ${photoId}`;
    }
    await writeAudit(
      tx,
      {
        type: decision === 'approve' ? 'TEACHER_PHOTO_APPROVED' : 'TEACHER_PHOTO_DECLINED',
        outcome: 'success',
        actorId,
        subjectId: photo.teacher_id,
      },
      now,
    );
    return { ok: true };
  });
}

/**
 * The picture bytes, for a viewer allowed to see this photo: the teacher themselves (approved or
 * waiting), or an approver. Families and visitors get approved photos through listings (PR-D2/D3),
 * not through this function. Anything else is "not found".
 */
export async function readPhoto(sql: Db, photoId: string, viewerId: string): Promise<Buffer | null> {
  if (!UUID.test(photoId) || !UUID.test(viewerId)) return null;
  const [row] = await sql<Array<{ teacher_id: string; image: Buffer | null }>>`
    SELECT teacher_id, image FROM teacher_photos WHERE id = ${photoId} AND status IN ('pending', 'approved')`;
  if (!row?.image) return null;
  if (row.teacher_id === viewerId) return row.image;
  return (await mayAct(sql, viewerId, 'teacher_approvals')) ? row.image : null;
}
