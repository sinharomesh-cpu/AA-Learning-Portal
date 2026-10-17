import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdmin } from '@/server/admin';
import {
  decidePhoto,
  listPendingPhotos,
  ownPhotoState,
  processPhoto,
  readPhoto,
  removeTeacherPhoto,
  uploadTeacherPhoto,
} from '@/server/teacherPhotos';
import { createAdult, testDb, uniq } from './helpers';

/** PR-D1b: optional teacher photos, stored in AA Pro's database, approved before shown (OC-85). */
const sql = testDb();
const T0 = new Date('2026-10-17T08:00:00Z');

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

/** A synthetic picture (coloured blocks, no person) with camera and location metadata attached. */
async function picture(width = 640, height = 480, format: 'jpeg' | 'png' = 'jpeg') {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 200 } } }).withExif({
    IFD0: { Make: 'SampleCam', Model: 'Test 1' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '77/1 35/1 0/1' },
  });
  return new Uint8Array(await (format === 'jpeg' ? img.jpeg() : img.png()).toBuffer());
}

async function teacher(approval: 'draft' | 'approved' | 'rejected' = 'approved') {
  const approved = approval === 'approved';
  const status = approved ? 'active' : 'pending_approval';
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', ${status}, ${`photo-${uniq()}@example.com`}, 'Teacher P. Sample', 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  const decided = approval !== 'draft';
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at)
    VALUES (${row!.id}, 'self_registered', ${approval}, ${approved ? ['maths'] : []}, ${approved ? [5] : []},
            ${approved ? 'Teaches maths to primary classes.' : null}, ${decided ? owner : null}, ${decided ? T0 : null})`;
  return row!.id;
}

async function approver(permissions = ['teacher_approvals']) {
  const owner = await createAdult(sql, 'superadmin');
  const r = await createAdmin(
    sql,
    owner,
    { name: 'Photo approver', email: `approver-${uniq()}@example.com`, permissions, baseUrl: 'http://aa.test' },
    T0,
  );
  if (!r.ok) throw new Error(r.reason);
  await sql`UPDATE accounts SET status = 'active' WHERE id = ${r.adminId}`;
  return r.adminId;
}

async function rows(teacherId: string) {
  return sql<Array<{ id: string; status: string; has_image: boolean }>>`
    SELECT id, status, image IS NOT NULL AS has_image FROM teacher_photos WHERE teacher_id = ${teacherId}
    ORDER BY uploaded_at, id`;
}

async function auditTypes(subjectId: string) {
  const r = await sql<{ event_type: string }[]>`
    SELECT event_type FROM audit_events WHERE subject_id = ${subjectId} ORDER BY occurred_at, id`;
  return r.map((x) => x.event_type);
}

describe('processing an upload', () => {
  it('makes a 400 × 400 WebP and removes camera and location details', async () => {
    const r = await processPhoto(await picture());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const meta = await sharp(r.image).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 400, height: 400 });
    expect(meta.exif).toBeUndefined();
    expect(r.image.length).toBeLessThan(200_000);
  });

  it('accepts PNG too, judged by the file content', async () => {
    expect((await processPhoto(await picture(300, 300, 'png'))).ok).toBe(true);
  });

  it('refuses empty, non-image, broken, tiny and oversized files', async () => {
    expect(await processPhoto(new Uint8Array())).toEqual({ ok: false, problem: 'empty' });
    expect(await processPhoto(new TextEncoder().encode('<svg onload=alert(1)>'))).toEqual({
      ok: false,
      problem: 'type',
    });
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...randomBytes(500)]);
    expect(await processPhoto(broken)).toEqual({ ok: false, problem: 'unreadable' });
    expect(await processPhoto(await picture(120, 120))).toEqual({ ok: false, problem: 'too_small' });
    const huge = new Uint8Array(950 * 1024);
    huge.set([0xff, 0xd8, 0xff]);
    expect(await processPhoto(huge)).toEqual({ ok: false, problem: 'too_big' });
  });
});

describe('the teacher’s own photo', () => {
  it('a new photo waits for review; a second upload replaces the waiting one', async () => {
    const id = await teacher('draft');
    expect(await uploadTeacherPhoto(sql, id, await picture(), T0)).toEqual({ ok: true });
    expect(await uploadTeacherPhoto(sql, id, await picture(800, 800), T0)).toEqual({ ok: true });
    const r = await rows(id);
    expect(r.map((x) => x.status)).toEqual(['pending']);
    expect((await ownPhotoState(sql, id)).pending?.id).toBe(r[0]!.id);
    expect(await auditTypes(id)).toEqual(['TEACHER_PHOTO_UPLOADED', 'TEACHER_PHOTO_UPLOADED']);
  });

  it('a rejected teacher, a parent or an unknown id cannot upload', async () => {
    expect(await uploadTeacherPhoto(sql, await teacher('rejected'), await picture(), T0)).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await uploadTeacherPhoto(sql, await createAdult(sql, 'parent'), await picture(), T0)).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await uploadTeacherPhoto(sql, 'not-an-id', await picture(), T0)).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  it('removing deletes the approved and the waiting photo', async () => {
    const id = await teacher();
    const admin = await approver();
    await uploadTeacherPhoto(sql, id, await picture(), T0);
    await decidePhoto(sql, admin, (await rows(id))[0]!.id, 'approve', '', T0);
    await uploadTeacherPhoto(sql, id, await picture(), T0);
    expect((await rows(id)).length).toBe(2);
    expect(await removeTeacherPhoto(sql, id, T0)).toEqual({ ok: true });
    expect(await rows(id)).toEqual([]);
    expect(await auditTypes(id)).toContain('TEACHER_PHOTO_REMOVED');
  });
});

describe('the AA Pro team decides (OC-85)', () => {
  it('only approvers see the queue and decide', async () => {
    const id = await teacher();
    await uploadTeacherPhoto(sql, id, await picture(), T0);
    const photoId = (await rows(id))[0]!.id;
    expect(await listPendingPhotos(sql, await approver(['accounts']))).toBeNull();
    expect(await listPendingPhotos(sql, id)).toBeNull();
    expect(await decidePhoto(sql, await approver(['audit_log']), photoId, 'approve', '', T0)).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await decidePhoto(sql, id, photoId, 'approve', '', T0)).toEqual({ ok: false, reason: 'not_allowed' });
    const queue = await listPendingPhotos(sql, await approver());
    expect(queue?.some((p) => p.id === photoId && p.teacherId === id)).toBe(true);
  });

  it('approving replaces the previous approved photo; the old one stays visible until then', async () => {
    const id = await teacher();
    const admin = await approver();
    await uploadTeacherPhoto(sql, id, await picture(), T0);
    const first = (await rows(id))[0]!.id;
    expect(await decidePhoto(sql, admin, first, 'approve', '', T0)).toEqual({ ok: true });
    await uploadTeacherPhoto(sql, id, await picture(700, 700), T0);
    expect(await ownPhotoState(sql, id)).toMatchObject({ approvedId: first });
    const second = (await rows(id)).find((r) => r.status === 'pending')!.id;
    expect(await decidePhoto(sql, admin, second, 'approve', '', T0)).toEqual({ ok: true });
    expect((await rows(id)).map((r) => [r.id, r.status])).toEqual([[second, 'approved']]);
    // A decided photo cannot be decided again.
    expect(await decidePhoto(sql, admin, second, 'decline', 'Too late', T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await auditTypes(id)).toContain('TEACHER_PHOTO_APPROVED');
  });

  it('declining needs a note, deletes the picture and keeps only the note', async () => {
    const id = await teacher();
    const admin = await approver();
    await uploadTeacherPhoto(sql, id, await picture(), T0);
    const photoId = (await rows(id))[0]!.id;
    expect(await decidePhoto(sql, admin, photoId, 'decline', ' ', T0)).toEqual({
      ok: false,
      reason: 'note_required',
    });
    expect(await decidePhoto(sql, admin, photoId, 'decline', 'Please use a photo of you alone.', T0)).toEqual({
      ok: true,
    });
    expect(await rows(id)).toEqual([{ id: photoId, status: 'declined', has_image: false }]);
    expect((await ownPhotoState(sql, id)).declined).toMatchObject({ note: 'Please use a photo of you alone.' });
    expect(await readPhoto(sql, photoId, id)).toBeNull();
    // A new upload clears the old decline.
    await uploadTeacherPhoto(sql, id, await picture(), T0);
    expect((await rows(id)).map((r) => r.status)).toEqual(['pending']);
  });
});

describe('who can open a photo', () => {
  it('the teacher and approvers only; other teachers, parents and strangers cannot', async () => {
    const id = await teacher();
    await uploadTeacherPhoto(sql, id, await picture(), T0);
    const photoId = (await rows(id))[0]!.id;
    expect(await readPhoto(sql, photoId, id)).toBeInstanceOf(Buffer);
    expect(await readPhoto(sql, photoId, await approver())).toBeInstanceOf(Buffer);
    expect(await readPhoto(sql, photoId, await teacher())).toBeNull();
    expect(await readPhoto(sql, photoId, await createAdult(sql, 'parent'))).toBeNull();
    expect(await readPhoto(sql, photoId, await approver(['accounts']))).toBeNull();
    expect(await readPhoto(sql, 'nope', id)).toBeNull();
  });
});

describe('database rules', () => {
  it('refuses a photo for a non-teacher, a declined photo with a picture, and two waiting photos', async () => {
    const parent = await createAdult(sql, 'parent');
    await expect(
      sql`INSERT INTO teacher_photos (teacher_id, status, image) VALUES (${parent}, 'pending', ${Buffer.from([1])})`,
    ).rejects.toThrow(/is not a teacher/);
    const id = await teacher();
    await expect(
      sql`INSERT INTO teacher_photos (teacher_id, status, image, decided_at)
          VALUES (${id}, 'declined', ${Buffer.from([1])}, now())`,
    ).rejects.toThrow(/teacher_photos_image/);
    await sql`INSERT INTO teacher_photos (teacher_id, status, image) VALUES (${id}, 'pending', ${Buffer.from([1])})`;
    await expect(
      sql`INSERT INTO teacher_photos (teacher_id, status, image) VALUES (${id}, 'pending', ${Buffer.from([1])})`,
    ).rejects.toThrow(/teacher_photos_one_pending/);
  });
});
