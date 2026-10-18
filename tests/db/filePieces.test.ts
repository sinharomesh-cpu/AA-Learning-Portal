import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STORAGE_SETTINGS } from '@/server/files/limits';
import {
  fileOutline,
  MAX_PIECES,
  PIECE_BYTES,
  readFilePiece,
  removeStaleUploads,
  stagePiece,
  storeUploadedFile,
} from '@/server/files/pieces';
import { storeFile } from '@/server/files/store';
import { createAdult, createChild, testDb } from './helpers';

/** CR-07 H-2a: files up to 20 MB travel in 3 MB pieces (the free host's 4.5 MB request limit). */
const sql = testDb();
afterAll(() => sql.end());
afterEach(async () => {
  for (const [key, value] of Object.entries(DEFAULT_STORAGE_SETTINGS)) {
    await sql`UPDATE platform_settings SET value = ${value} WHERE key = ${key}`;
  }
});

const T0 = new Date('2026-10-22T10:00:00Z');

/** A synthetic PDF of a given size: header, filler, end marker. */
function bigPdf(size: number): Buffer {
  const head = Buffer.from('%PDF-1.4\n', 'latin1');
  const tail = Buffer.from('\n%%EOF\n', 'latin1');
  const body = Buffer.alloc(size - head.length - tail.length, 0x41);
  return Buffer.concat([head, body, tail]);
}

/** Sends a file in pieces as the browser does. */
async function send(owner: string, file: Buffer, name = 'Big worksheet.pdf', uploadId = randomUUID()) {
  const total = Math.ceil(file.length / PIECE_BYTES);
  let last;
  for (let i = 0; i < total; i += 1) {
    last = await stagePiece(
      sql,
      owner,
      { uploadId, part: i, total, fileName: name, bytes: file.subarray(i * PIECE_BYTES, (i + 1) * PIECE_BYTES) },
      T0,
    );
  }
  return { uploadId, last };
}

describe('sending a file in pieces', () => {
  it('a 15 MB PDF arrives in 5 pieces, is saved, and reads back identically piece by piece', async () => {
    const parent = await createAdult(sql, 'parent');
    const file = bigPdf(15 * 1024 * 1024);
    const { uploadId, last } = await send(parent, file);
    expect(last).toEqual({ ok: true, received: 5, total: 5, complete: true });
    const stored = await storeUploadedFile(sql, parent, 'submission_page', uploadId, T0);
    if (!stored.ok) throw new Error(stored.reason);
    expect(stored).toMatchObject({
      mediaType: 'application/pdf',
      byteSize: file.length,
      fileName: 'Big worksheet.pdf',
    });

    const outline = await fileOutline(sql, parent, stored.fileId);
    expect(outline).toEqual({
      mediaType: 'application/pdf',
      fileName: 'Big worksheet.pdf',
      byteSize: file.length,
      pieces: 5,
    });
    const back: Buffer[] = [];
    for (let i = 0; i < outline!.pieces; i += 1) back.push((await readFilePiece(sql, parent, stored.fileId, i))!);
    expect(back.every((b) => b.length <= PIECE_BYTES)).toBe(true);
    expect(Buffer.concat(back).equals(file)).toBe(true);
    expect(await readFilePiece(sql, parent, stored.fileId, 5)).toBeNull();
    // The pieces are gone once the file is saved.
    const [left] = await sql<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM upload_parts WHERE upload_id = ${uploadId}`;
    expect(left!.n).toBe(0);
  });

  it('nobody else can read the pieces or the outline', async () => {
    const parent = await createAdult(sql, 'parent');
    const { uploadId } = await send(parent, bigPdf(4 * 1024 * 1024));
    const stored = await storeUploadedFile(sql, parent, 'submission_page', uploadId, T0);
    if (!stored.ok) throw new Error(stored.reason);
    const other = await createAdult(sql, 'parent');
    expect(await fileOutline(sql, other, stored.fileId)).toBeNull();
    expect(await readFilePiece(sql, other, stored.fileId, 0)).toBeNull();
    expect(await readFilePiece(sql, await createAdult(sql, 'superadmin'), stored.fileId, 0)).toBeNull();
  });

  it('a repeated piece (a retry) replaces the first copy', async () => {
    const parent = await createAdult(sql, 'parent');
    const uploadId = randomUUID();
    const piece = { uploadId, part: 0, total: 1, fileName: 'a.pdf', bytes: bigPdf(1000) };
    expect(await stagePiece(sql, parent, piece, T0)).toMatchObject({ ok: true, complete: true });
    expect(await stagePiece(sql, parent, piece, T0)).toMatchObject({ ok: true, received: 1, complete: true });
  });

  it('an incomplete upload, or someone else’s, cannot be saved', async () => {
    const parent = await createAdult(sql, 'parent');
    const file = bigPdf(7 * 1024 * 1024);
    const uploadId = randomUUID();
    await stagePiece(
      sql,
      parent,
      { uploadId, part: 0, total: 3, fileName: 'a.pdf', bytes: file.subarray(0, PIECE_BYTES) },
      T0,
    );
    expect(await storeUploadedFile(sql, parent, 'submission_page', uploadId, T0)).toEqual({
      ok: false,
      reason: 'upload_missing',
    });
    const done = await send(parent, file);
    const other = await createAdult(sql, 'parent');
    expect(await storeUploadedFile(sql, other, 'submission_page', done.uploadId, T0)).toEqual({
      ok: false,
      reason: 'upload_missing',
    });
    // Another account cannot add pieces to it either.
    expect(
      await stagePiece(
        sql,
        other,
        {
          uploadId: done.uploadId,
          part: 0,
          total: 3,
          fileName: 'Big worksheet.pdf',
          bytes: file.subarray(0, PIECE_BYTES),
        },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses bad pieces, too many pieces and over-size pieces', async () => {
    const parent = await createAdult(sql, 'parent');
    const id = randomUUID();
    const small = Buffer.from('x');
    for (const bad of [
      { uploadId: 'nope', part: 0, total: 1, fileName: 'a.pdf', bytes: small },
      { uploadId: id, part: 1, total: 1, fileName: 'a.pdf', bytes: small },
      { uploadId: id, part: 0, total: 2, fileName: 'a.pdf', bytes: small }, // not the last, but not full
      { uploadId: id, part: 0, total: 1, fileName: '', bytes: small },
    ]) {
      expect(await stagePiece(sql, parent, bad, T0)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(
      await stagePiece(
        sql,
        parent,
        { uploadId: id, part: 0, total: MAX_PIECES + 1, fileName: 'a.pdf', bytes: small },
        T0,
      ),
    ).toEqual({
      ok: false,
      reason: 'too_big',
    });
    expect(
      await stagePiece(
        sql,
        parent,
        { uploadId: id, part: 0, total: 1, fileName: 'a.pdf', bytes: Buffer.alloc(PIECE_BYTES + 1) },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'too_big' });
  });

  it('only parents and approved teachers may send pieces', async () => {
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    const pendingTeacher = await createAdult(sql, 'teacher');
    for (const who of [child, pendingTeacher, await createAdult(sql, 'superadmin'), randomUUID()]) {
      expect(
        await stagePiece(
          sql,
          who,
          { uploadId: randomUUID(), part: 0, total: 1, fileName: 'a.pdf', bytes: Buffer.from('x') },
          T0,
        ),
      ).toEqual({ ok: false, reason: 'not_allowed' });
    }
  });

  it('unfinished uploads are removed after two hours and never count as quota', async () => {
    const parent = await createAdult(sql, 'parent');
    const id = randomUUID();
    await stagePiece(
      sql,
      parent,
      { uploadId: id, part: 0, total: 2, fileName: 'a.pdf', bytes: Buffer.alloc(PIECE_BYTES, 1) },
      T0,
    );
    const [before] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM rate_events WHERE account_id = ${parent} AND kind = 'file_upload'`;
    expect(before!.n).toBe(0);
    expect(await removeStaleUploads(sql, new Date(T0.getTime() + 2 * 60 * 60 * 1000 + 1))).toBeGreaterThanOrEqual(1);
    const [left] = await sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM upload_parts WHERE upload_id = ${id}`;
    expect(left!.n).toBe(0);
  });

  it('a refused upload removes its pieces and uses no quota', async () => {
    const parent = await createAdult(sql, 'parent');
    const { uploadId } = await send(parent, Buffer.from('<html>not a pdf</html>'), 'fake.pdf');
    expect(await storeUploadedFile(sql, parent, 'submission_page', uploadId, T0)).toEqual({
      ok: false,
      reason: 'type',
    });
    const [left] = await sql<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM upload_parts WHERE upload_id = ${uploadId}`;
    expect(left!.n).toBe(0);
    const [count] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM rate_events WHERE account_id = ${parent} AND kind = 'file_upload'`;
    expect(count!.n).toBe(0);
  });

  it('no pieces are accepted once uploads are stopped (OC-96)', async () => {
    await sql`UPDATE platform_settings SET value = 1 WHERE key = 'database_allowance_mb'`;
    const parent = await createAdult(sql, 'parent');
    expect(
      await stagePiece(
        sql,
        parent,
        { uploadId: randomUUID(), part: 0, total: 1, fileName: 'a.pdf', bytes: Buffer.from('x') },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'storage_full' });
  });
});

describe('the caller’s step runs with the save', () => {
  const pdf = bigPdf(2000);

  it('if the step refuses, nothing is saved and no quota is used', async () => {
    const parent = await createAdult(sql, 'parent');
    const r = await storeFile(sql, parent, 'submission_page', pdf, 'a.pdf', T0, async () => ({
      ok: false,
      detail: 'not_linked',
    }));
    expect(r).toEqual({ ok: false, reason: 'refused', detail: 'not_linked' });
    const [files] = await sql<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM stored_files WHERE owner_id = ${parent}`;
    const [uses] = await sql<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM rate_events WHERE account_id = ${parent}`;
    expect([files!.n, uses!.n]).toEqual([0, 0]);
  });

  it('if the step succeeds, it sees the new file in the same transaction', async () => {
    const parent = await createAdult(sql, 'parent');
    let seen = '';
    const r = await storeFile(sql, parent, 'submission_page', pdf, 'a.pdf', T0, async (tx, fileId) => {
      const [row] = await tx<Array<{ id: string }>>`SELECT id FROM stored_files WHERE id = ${fileId}`;
      seen = row!.id;
      return { ok: true };
    });
    expect(r.ok && r.fileId).toBe(seen);
  });
});
