import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FILE_BYTES_PER_OWNER,
  FILE_UPLOADS_PER_DAY,
  mayReadFile,
  readFileForViewer,
  removeFile,
  storeFile,
} from '@/server/files/store';
import { createAdult, createChild, testDb, uniq } from './helpers';

/** CR-07 H-1: the private file store (T-F1, T-F3, T-F4, T-F6 and the database checks). */
const sql = testDb();
afterAll(() => sql.end());

const T0 = new Date('2026-10-20T10:00:00Z');
const heic = readFileSync(fileURLToPath(new URL('../fixtures/files/synthetic-blue.heic', import.meta.url)));
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

async function approvedTeacher(status = 'approved') {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${`t-${uniq()}@example.com`}, 'Teacher Test', 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', ${status}, ${['maths']}, ${[5]}, ${owner}, now())`;
  return row!.id;
}

async function admin() {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name) VALUES ('admin', 'active', ${`a-${uniq()}@example.com`}, 'Admin')
    RETURNING id`;
  return row!.id;
}

async function stored(owner: string, purpose: 'teacher_resource' | 'submission_page' = 'teacher_resource') {
  const r = await storeFile(sql, owner, purpose, pdf, 'Worksheet.pdf', T0);
  if (!r.ok) throw new Error(r.reason);
  return r.fileId;
}

describe('storing', () => {
  it('a teacher stores a resource file; a parent stores a homework page', async () => {
    const teacher = await approvedTeacher();
    const r = await storeFile(sql, teacher, 'teacher_resource', pdf, 'Fractions.pdf', T0);
    expect(r).toMatchObject({
      ok: true,
      mediaType: 'application/pdf',
      byteSize: pdf.length,
      fileName: 'Fractions.pdf',
    });
    const parent = await createAdult(sql, 'parent');
    const p = await storeFile(sql, parent, 'submission_page', heic, 'IMG_0042.HEIC', T0);
    expect(p).toMatchObject({ ok: true, mediaType: 'image/jpeg', fileName: 'IMG_0042.jpg' });
  });

  it('only the right, active account may store each kind of file', async () => {
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    const teacher = await approvedTeacher();
    const pending = await approvedTeacher('submitted');
    const suspended = await createAdult(sql, 'parent', 'suspended');
    for (const [owner, purpose] of [
      [parent, 'teacher_resource'],
      [teacher, 'submission_page'],
      [child, 'submission_page'], // students never upload (CR-07 K-10)
      [pending, 'teacher_resource'],
      [suspended, 'submission_page'],
      [await admin(), 'teacher_resource'],
      [randomUUID(), 'teacher_resource'],
      ['not-a-uuid', 'teacher_resource'],
    ] as const) {
      expect(await storeFile(sql, owner, purpose, pdf, 'x.pdf', T0)).toEqual({ ok: false, reason: 'not_allowed' });
    }
  });

  it('refuses a mislabelled file and passes on the upload problem', async () => {
    const teacher = await approvedTeacher();
    expect(
      await storeFile(sql, teacher, 'teacher_resource', Buffer.from('<svg onload=alert(1)>'), 'a.png', T0),
    ).toEqual({
      ok: false,
      reason: 'type',
    });
  });

  it('records the upload in the audit trail without the file name or contents', async () => {
    const teacher = await approvedTeacher();
    const id = await stored(teacher);
    const [e] = await sql<Array<{ details: Record<string, unknown> }>>`
      SELECT details FROM audit_events WHERE actor_id = ${teacher} AND event_type = 'FILE_STORED'`;
    expect(e!.details).toEqual({
      fileId: id,
      purpose: 'teacher_resource',
      mediaType: 'application/pdf',
      byteSize: pdf.length,
    });
  });
});

describe('limits that protect the free test database', () => {
  it('at most the daily number of uploads per account', async () => {
    const teacher = await approvedTeacher();
    await sql`INSERT INTO rate_events (account_id, kind, occurred_at)
              SELECT ${teacher}, 'file_upload', ${new Date(T0.getTime() - 60_000)}
              FROM generate_series(1, ${FILE_UPLOADS_PER_DAY})`;
    expect(await storeFile(sql, teacher, 'teacher_resource', pdf, 'x.pdf', T0)).toEqual({
      ok: false,
      reason: 'daily_limit',
    });
    // A day later it is allowed again.
    expect(
      (await storeFile(sql, teacher, 'teacher_resource', pdf, 'x.pdf', new Date(T0.getTime() + 86_400_000))).ok,
    ).toBe(true);
  });

  it('at most the stored space per account', async () => {
    const teacher = await approvedTeacher();
    // Fill the allowance with records of the largest size (kept elsewhere, so no bytes are needed).
    const max = 20 * 1024 * 1024;
    await sql`INSERT INTO stored_files (owner_id, purpose, media_type, byte_size, sha256, file_name, storage, object_key)
              SELECT ${teacher}, 'teacher_resource', 'application/pdf', ${max}, ${Buffer.alloc(32)}, 'big.pdf', 'object', 'test-' || g
              FROM generate_series(1, ${Math.floor(FILE_BYTES_PER_OWNER / max)}) g`;
    expect(await storeFile(sql, teacher, 'teacher_resource', pdf, 'x.pdf', T0)).toEqual({
      ok: false,
      reason: 'space_full',
    });
  });

  it('two uploads at the same moment both respect the limit', async () => {
    const teacher = await approvedTeacher();
    await sql`INSERT INTO rate_events (account_id, kind, occurred_at)
              SELECT ${teacher}, 'file_upload', ${T0} FROM generate_series(1, ${FILE_UPLOADS_PER_DAY - 1})`;
    const results = await Promise.all(
      [1, 2, 3].map(() => storeFile(sql, teacher, 'teacher_resource', pdf, 'x.pdf', T0)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe('who can read a file (T-F1, T-F3)', () => {
  it('the owner can read their own file', async () => {
    const teacher = await approvedTeacher();
    const id = await stored(teacher);
    const file = await readFileForViewer(sql, teacher, id, T0);
    expect(file?.body.equals(pdf)).toBe(true);
    expect(file?.meta).toMatchObject({ id, mediaType: 'application/pdf', fileName: 'Worksheet.pdf' });
  });

  it('everyone else, including the Super Admin and Admins, gets nothing, and it is recorded', async () => {
    const teacher = await approvedTeacher();
    const id = await stored(teacher);
    const parent = await createAdult(sql, 'parent');
    const others = [
      await approvedTeacher(),
      parent,
      await createChild(sql, parent),
      await admin(),
      await createAdult(sql, 'superadmin'),
    ];
    for (const viewer of others) {
      expect(await mayReadFile(sql, viewer, id)).toBeNull();
      expect(await readFileForViewer(sql, viewer, id, T0)).toBeNull();
    }
    const [n] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'FILE_READ_REFUSED' AND details->>'fileId' = ${id}`;
    expect(n!.n).toBe(others.length);
  });

  it('a missing id, a bad id and a refused id all look the same', async () => {
    const teacher = await approvedTeacher();
    const other = await approvedTeacher();
    const id = await stored(teacher);
    expect(await readFileForViewer(sql, other, id, T0)).toBeNull();
    expect(await readFileForViewer(sql, other, randomUUID(), T0)).toBeNull();
    expect(await readFileForViewer(sql, other, 'abc', T0)).toBeNull();
  });

  it('a suspended owner cannot read their file', async () => {
    const parent = await createAdult(sql, 'parent');
    const id = await stored(parent, 'submission_page');
    await sql`UPDATE accounts SET status = 'suspended' WHERE id = ${parent}`;
    expect(await mayReadFile(sql, parent, id)).toBeNull();
  });
});

describe('removing', () => {
  it('only the owner removes; the bytes go at once and the file can no longer be read', async () => {
    const teacher = await approvedTeacher();
    const id = await stored(teacher);
    expect(await removeFile(sql, await approvedTeacher(), id, T0)).toBe(false);
    expect(await removeFile(sql, teacher, id, T0)).toBe(true);
    expect(await removeFile(sql, teacher, id, T0)).toBe(false);
    expect(await readFileForViewer(sql, teacher, id, T0)).toBeNull();
    const [row] = await sql<Array<{ body: Buffer | null; deleted_at: Date | null }>>`
      SELECT body, deleted_at FROM stored_files WHERE id = ${id}`;
    expect(row).toEqual({ body: null, deleted_at: T0 });
  });
});

describe('database checks (second line of defence)', () => {
  const insert = (
    owner: string,
    purpose: string,
    extra: { media?: string; size?: number; body?: Buffer | null; name?: string } = {},
  ) =>
    sql`INSERT INTO stored_files (owner_id, purpose, media_type, byte_size, sha256, file_name, body)
        VALUES (${owner}, ${purpose}, ${extra.media ?? 'application/pdf'}, ${extra.size ?? 3},
                ${Buffer.alloc(32)}, ${extra.name ?? 'a.pdf'}, ${extra.body === undefined ? Buffer.from('abc') : extra.body})`;

  it('owners must have the right role for the purpose', async () => {
    const parent = await createAdult(sql, 'parent');
    const teacher = await approvedTeacher();
    await expect(insert(parent, 'teacher_resource')).rejects.toThrow(/is not a teacher/);
    await expect(insert(teacher, 'submission_page')).rejects.toThrow(/is not a parent/);
  });

  it('only the four stored types, a size that matches the bytes, and safe names', async () => {
    const teacher = await approvedTeacher();
    await expect(insert(teacher, 'teacher_resource', { media: 'image/heic' })).rejects.toThrow(/media_type/);
    await expect(insert(teacher, 'teacher_resource', { media: 'text/html' })).rejects.toThrow(/media_type/);
    await expect(insert(teacher, 'teacher_resource', { size: 4 })).rejects.toThrow(/stored_files_location/);
    await expect(insert(teacher, 'teacher_resource', { body: null })).rejects.toThrow(/stored_files_location/);
    await expect(insert(teacher, 'teacher_resource', { name: '../etc/passwd' })).rejects.toThrow(/file_name/);
    await expect(insert(teacher, 'teacher_resource', { size: 20 * 1024 * 1024 + 1, body: null })).rejects.toThrow(
      /byte_size/,
    );
  });

  it('a removed file keeps no bytes', async () => {
    const teacher = await approvedTeacher();
    const id = await stored(teacher);
    await expect(sql`UPDATE stored_files SET deleted_at = now() WHERE id = ${id}`).rejects.toThrow(
      /stored_files_deleted_empty/,
    );
  });

  it('converted pictures are what is stored (a test HEIC is kept as JPEG)', async () => {
    const parent = await createAdult(sql, 'parent');
    const r = await storeFile(sql, parent, 'submission_page', heic, 'p.heic', T0);
    if (!r.ok) throw new Error(r.reason);
    const [row] = await sql<
      Array<{ media_type: string; body: Buffer }>
    >`SELECT media_type, body FROM stored_files WHERE id = ${r.fileId}`;
    expect(row!.media_type).toBe('image/jpeg');
    expect((await sharp(row!.body).metadata()).format).toBe('jpeg');
  });
});
