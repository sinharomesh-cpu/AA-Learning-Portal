import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  addChapterFile,
  archiveChapter,
  checkRanges,
  createChapterBook,
  createCompleteBook,
  discardChapter,
  discardStaleChapters,
  editChapter,
  finishChapter,
  getBookForViewer,
  listBooksForStudent,
  listBooksForTeacher,
  listOwnBooks,
  noteRefusedBook,
  PHOTO_LIMIT,
  removeChapterFile,
  setBookChapters,
  setBookStatus,
  startChapter,
} from '@/server/books';
import { DEFAULT_STORAGE_SETTINGS, ownUsage } from '@/server/files/limits';
import { PIECE_BYTES, stagePiece } from '@/server/files/pieces';
import { mayReadFile, readFileForViewer } from '@/server/files/store';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-17 PR B1: parents' books (readiness pack BK-1 to BK-15, SEC-19, SEC-20; W-5; OC-41(5)).
 * Invented accounts and generated sample files only.
 */
const sql = testDb();
afterAll(() => sql.end());

const T0 = new Date();

/** A small synthetic PDF; `tag` makes its bytes (and fingerprint) unique. */
const samplePdf = (tag = uniq()) =>
  Buffer.from(
    `%PDF-1.4\n% sample ${tag}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
    'latin1',
  );

/** A synthetic page photo (plain colour, no person) with camera and location details attached. */
async function photo(shade = 120, format: 'jpeg' | 'png' | 'webp' = 'jpeg', width = 600) {
  // Random speckle makes every photo different after conversion (duplicates are found by content).
  const img = sharp({
    create: {
      width,
      height: Math.round(width * 1.33),
      channels: 3,
      background: { r: 240, g: shade, b: 90 },
      noise: { type: 'gaussian', mean: 128, sigma: 30 },
    },
  }).withExif({
    IFD0: { Make: 'SampleCam', Model: 'Test 1' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '77/1 35/1 0/1' },
  });
  return Buffer.from(await img[format]().toBuffer());
}

/** Sends a file in pieces as the browser does; returns the upload id. */
async function upload(owner: string, file: Buffer, name: string) {
  const uploadId = randomUUID();
  const total = Math.ceil(file.length / PIECE_BYTES);
  for (let i = 0; i < total; i += 1) {
    const r = await stagePiece(
      sql,
      owner,
      { uploadId, part: i, total, fileName: name, bytes: file.subarray(i * PIECE_BYTES, (i + 1) * PIECE_BYTES) },
      T0,
    );
    if (!r.ok) throw new Error(r.reason);
  }
  return uploadId;
}

async function teacher() {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${`bk-${uniq()}@example.com`}, 'Teacher B. Sample', 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  return row!.id;
}

async function family() {
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  return { parent, child };
}

async function chapterBook(parent: string, childIds: string[], title = 'Sample notes', subject = 'maths') {
  const r = await createChapterBook(sql, parent, { title, subject, childIds }, T0);
  if (!r.ok || !r.id) throw new Error(JSON.stringify(r));
  return r.id;
}

const CHAPTERS = [
  { number: 1, title: 'Plants around us', firstPage: 3, lastPage: 10, origin: 'bookmarks' },
  { number: 2, title: 'Water', firstPage: 11, lastPage: 20, origin: 'bookmarks' },
];

async function completeBook(parent: string, child: string, opts: Record<string, unknown> = {}) {
  const r = await createCompleteBook(
    sql,
    parent,
    {
      uploadId: await upload(parent, samplePdf(), 'Science sample book.pdf'),
      title: 'Science sample book',
      subject: 'science',
      childIds: [child],
      pageCount: 24,
      split: 'none',
      publish: true,
      ...opts,
    },
    T0,
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.bookId;
}

async function photoChapter(parent: string, bookId: string, number: number, shades: number[]) {
  const s = await startChapter(sql, parent, bookId, { number, title: `Chapter ${number} (sample)` }, T0);
  if (!s.ok) throw new Error(s.reason);
  const ids: string[] = [];
  for (const shade of shades) {
    const r = await addChapterFile(
      sql,
      parent,
      s.chapterId,
      await upload(parent, await photo(shade), `IMG_${shade}.jpg`),
      T0,
    );
    if (!r.ok) throw new Error(JSON.stringify(r));
    ids.push(r.fileId);
  }
  return { chapterId: s.chapterId, ids };
}

describe('a complete book (BK-1, BK-5, BK-14)', () => {
  it('"Use as it is" keeps one unchanged PDF with no chapters', async () => {
    const { parent, child } = await family();
    const file = samplePdf();
    const r = await createCompleteBook(
      sql,
      parent,
      {
        uploadId: await upload(parent, file, 'Book.pdf'),
        title: 'Sample maths book',
        subject: 'maths',
        childIds: [child],
        pageCount: 12,
        split: 'none',
        publish: false,
      },
      T0,
    );
    expect(r).toMatchObject({ ok: true });
    const [b] = await listOwnBooks(sql, parent);
    expect(b).toMatchObject({ form: 'single_pdf', split: 'none', status: 'draft', chapters: [], canDownload: true });
    const stored = await readFileForViewer(sql, parent, b!.fileId!);
    expect(createHash('sha256').update(stored!.body).digest('hex')).toBe(
      createHash('sha256').update(file).digest('hex'),
    );
  });

  it('the server refuses overlapping, out-of-range, empty-title and repeated-number chapters', () => {
    expect(checkRanges(CHAPTERS, 24)).toMatchObject({ ok: true });
    expect(checkRanges([CHAPTERS[0], { ...CHAPTERS[1], firstPage: 10 }], 24)).toMatchObject({
      problem: 'overlap',
      index: 1,
    });
    expect(checkRanges([{ ...CHAPTERS[0], lastPage: 30 }], 24)).toMatchObject({ problem: 'pages' });
    expect(checkRanges([{ ...CHAPTERS[0], firstPage: 9, lastPage: 4 }], 24)).toMatchObject({ problem: 'pages' });
    expect(checkRanges([{ ...CHAPTERS[0], title: '   ' }], 24)).toMatchObject({ problem: 'title' });
    expect(checkRanges([CHAPTERS[0], { ...CHAPTERS[1], number: 1 }], 24)).toMatchObject({ problem: 'number' });
    expect(checkRanges([], 24)).toMatchObject({ problem: 'too_many' });
  });

  it('nothing is saved when chapters are refused', async () => {
    const { parent, child } = await family();
    const r = await createCompleteBook(
      sql,
      parent,
      {
        uploadId: await upload(parent, samplePdf(), 'Book.pdf'),
        title: 'Sample',
        subject: 'science',
        childIds: [child],
        pageCount: 24,
        split: 'chapters',
        chapters: [CHAPTERS[0], { ...CHAPTERS[1], firstPage: 5 }],
        publish: true,
      },
      T0,
    );
    expect(r).toMatchObject({ ok: false, reason: 'chapters', problem: 'overlap' });
    expect(await listOwnBooks(sql, parent)).toEqual([]);
    expect(await sql`SELECT 1 FROM stored_files WHERE owner_id = ${parent} AND purpose = 'book'`).toHaveLength(0);
  });

  it('a book used as it is can be split later: same book, same PDF, earlier chapters kept as history (B-8)', async () => {
    const { parent, child } = await family();
    const bookId = await completeBook(parent, child);
    const [before] = await listOwnBooks(sql, parent);
    expect(
      await setBookChapters(sql, parent, bookId, { chapters: CHAPTERS, method: 'bookmarks', pageOffset: 3 }, T0),
    ).toEqual({
      ok: true,
    });
    const [after] = await listOwnBooks(sql, parent);
    expect(after).toMatchObject({ id: bookId, fileId: before!.fileId, split: 'chapters', pageOffset: 3 });
    expect(after!.chapters.map((c) => [c.number, c.title, c.firstPage, c.lastPage])).toEqual([
      [1, 'Plants around us', 3, 10],
      [2, 'Water', 11, 20],
    ]);
    // Changed again: the new set replaces the old; nothing duplicated.
    await setBookChapters(sql, parent, bookId, { chapters: [CHAPTERS[0]] }, T0);
    expect((await listOwnBooks(sql, parent))[0]!.chapters).toHaveLength(1);
    expect(await sql`SELECT 1 FROM books WHERE owner_id = ${parent}`).toHaveLength(1);
    expect(await sql`SELECT 1 FROM stored_files WHERE owner_id = ${parent} AND purpose = 'book'`).toHaveLength(1);
  });

  it('the database refuses chapters that share pages or run past the end', async () => {
    const { parent, child } = await family();
    const bookId = await completeBook(parent, child, { split: 'chapters', chapters: CHAPTERS, method: 'bookmarks' });
    await expect(
      sql`INSERT INTO book_chapters (book_id, number, title, first_page, last_page) VALUES (${bookId}, 3, 'X', 20, 22)`,
    ).rejects.toThrow(/share pages/);
    await expect(
      sql`INSERT INTO book_chapters (book_id, number, title, first_page, last_page) VALUES (${bookId}, 3, 'X', 21, 30)`,
    ).rejects.toThrow(/last page/);
  });
});

describe('separate chapters (BK-6, BK-7, BK-13, SEC-19, SEC-20)', () => {
  it('a chapter of page photos is stored as JPEGs without location or camera details, in the parent’s order', async () => {
    const { parent, child } = await family();
    const bookId = await chapterBook(parent, [child]);
    const { chapterId, ids } = await photoChapter(parent, bookId, 2, [10, 20, 30]);
    // A book with no finished chapter can't be published.
    expect(await setBookStatus(sql, parent, bookId, { publish: true }, T0)).toEqual({ ok: false, reason: 'invalid' });
    expect(await finishChapter(sql, parent, chapterId, [ids[2], ids[0], ids[1]], T0)).toEqual({ ok: true });
    expect(await setBookStatus(sql, parent, bookId, { publish: true }, T0)).toEqual({ ok: true });
    // A chapter still being uploaded is hidden from readers, and so are its files.
    const pending = await photoChapter(parent, bookId, 3, [60]);
    const view = await getBookForViewer(sql, child, bookId);
    expect(view!.chapters.map((c) => c.number)).toEqual([2]);
    expect(await mayReadFile(sql, child, pending.ids[0]!)).toBeNull();
    expect(view!.chapters[0]!.files.map((f) => f.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(view!.chapters[0]!.files.every((f) => f.mediaType === 'image/jpeg')).toBe(true);
    const page = await readFileForViewer(sql, child, ids[0]!);
    const meta = await sharp(page!.body).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
  });

  it('PNG and WebP photos are converted too; a renamed non-picture is refused', async () => {
    const { parent, child } = await family();
    const bookId = await chapterBook(parent, [child], 'Sample');
    const s = await startChapter(sql, parent, bookId, { number: 1, title: 'One' }, T0);
    if (!s.ok) throw new Error();
    for (const format of ['png', 'webp'] as const) {
      expect(
        await addChapterFile(
          sql,
          parent,
          s.chapterId,
          await upload(parent, await photo(50, format), `p.${format}`),
          T0,
        ),
      ).toMatchObject({ ok: true, mediaType: 'image/jpeg' });
    }
    const fake = Buffer.from('MZ this is not a picture at all', 'latin1');
    expect(await addChapterFile(sql, parent, s.chapterId, await upload(parent, fake, 'page.jpg'), T0)).toMatchObject({
      ok: false,
      reason: 'type',
    });
  });

  it('a 31st photo is refused; a chapter is one PDF or photos, never both', async () => {
    const { parent, child } = await family();
    const bookId = await chapterBook(parent, [child], 'Sample');
    const s = await startChapter(sql, parent, bookId, { number: 1, title: 'Many pages' }, T0);
    if (!s.ok) throw new Error();
    for (let i = 0; i < PHOTO_LIMIT; i++) {
      const r = await addChapterFile(
        sql,
        parent,
        s.chapterId,
        await upload(parent, await photo(i * 7, 'jpeg', 200), `p${i}.jpg`),
        T0,
      );
      expect(r.ok).toBe(true);
    }
    expect(
      await addChapterFile(
        sql,
        parent,
        s.chapterId,
        await upload(parent, await photo(250, 'jpeg', 200), 'p31.jpg'),
        T0,
      ),
    ).toEqual({ ok: false, reason: 'too_many_photos' });
    const few = await photoChapter(parent, bookId, 3, [77]);
    expect(await addChapterFile(sql, parent, few.chapterId, await upload(parent, samplePdf(), 'c.pdf'), T0)).toEqual({
      ok: false,
      reason: 'mixed',
    });
    const p = await startChapter(sql, parent, bookId, { number: 2, title: 'A PDF chapter' }, T0);
    if (!p.ok) throw new Error();
    expect(
      await addChapterFile(sql, parent, p.chapterId, await upload(parent, samplePdf(), 'Ch 2.pdf'), T0),
    ).toMatchObject({
      ok: true,
    });
    expect(await addChapterFile(sql, parent, p.chapterId, await upload(parent, await photo(3), 'x.jpg'), T0)).toEqual({
      ok: false,
      reason: 'mixed',
    });
    // The database refuses it too, even without the code's checks.
    const [pic] = await sql<{ id: string }[]>`
      SELECT f.id FROM book_chapter_files x JOIN stored_files f ON f.id = x.file_id WHERE x.chapter_id = ${s.chapterId} LIMIT 1`;
    await expect(
      sql.begin(async (tx) => {
        await tx`DELETE FROM book_chapter_files WHERE file_id = ${pic!.id}`;
        await tx`INSERT INTO book_chapter_files (chapter_id, position, file_id) VALUES (${p.chapterId}, 2, ${pic!.id})`;
      }),
    ).rejects.toThrow(/one PDF or page photos/);
  }, 120_000);

  it('B-9: each photo is one upload, through the same daily, space and storage checks as any file', async () => {
    const { parent, child } = await family();
    const bookId = await chapterBook(parent, [child], 'Sample');
    const s = await startChapter(sql, parent, bookId, { number: 1, title: 'Limits' }, T0);
    if (!s.ok) throw new Error();
    try {
      await sql`UPDATE platform_settings SET value = 2 WHERE key = 'file_uploads_per_day'`;
      for (const shade of [11, 22]) {
        expect(
          await addChapterFile(
            sql,
            parent,
            s.chapterId,
            await upload(parent, await photo(shade, 'jpeg', 200), 'p.jpg'),
            T0,
          ),
        ).toMatchObject({ ok: true });
      }
      expect(
        await addChapterFile(sql, parent, s.chapterId, await upload(parent, await photo(33, 'jpeg', 200), 'p.jpg'), T0),
      ).toMatchObject({ ok: false, reason: 'daily_limit' });
    } finally {
      await sql`UPDATE platform_settings SET value = 100 WHERE key = 'file_uploads_per_day'`;
    }
  });

  it('a complete-book PDF book takes no chapter files, and a chapter book takes no page ranges (B-6)', async () => {
    const { parent, child } = await family();
    const pdfBook = await completeBook(parent, child);
    expect(await startChapter(sql, parent, pdfBook, { number: 1, title: 'X' }, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    const bookId = await chapterBook(parent, [child], 'Sample');
    expect(await setBookChapters(sql, parent, bookId, { chapters: CHAPTERS }, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    await expect(
      sql`INSERT INTO book_chapters (book_id, number, title, first_page, last_page) VALUES (${bookId}, 1, 'X', 1, 2)`,
    ).rejects.toThrow(/own files/);
    const [f] = await sql<{ id: string }[]>`SELECT file_id AS id FROM books WHERE id = ${pdfBook}`;
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO book_chapters (book_id, number, title) VALUES (${bookId}, 9, 'Y') RETURNING id`;
    await expect(
      sql`INSERT INTO book_chapter_files (chapter_id, position, file_id) VALUES (${c!.id}, 1, ${f!.id})`,
    ).rejects.toThrow(/belong/);
  });

  it('numbers are kept per chapter; titles can be corrected; order follows number', async () => {
    const { parent, child } = await family();
    const bookId = await chapterBook(parent, [child], 'Sample');
    const a = await photoChapter(parent, bookId, 3, [1]);
    await finishChapter(sql, parent, a.chapterId, a.ids, T0);
    expect(await startChapter(sql, parent, bookId, { number: 3, title: 'Again' }, T0)).toEqual({
      ok: false,
      reason: 'number_taken',
    });
    const b = await photoChapter(parent, bookId, 1, [2]);
    await finishChapter(sql, parent, b.chapterId, b.ids, T0);
    expect(await editChapter(sql, parent, a.chapterId, { number: 1, title: 'Clash' }, T0)).toEqual({
      ok: false,
      reason: 'number_taken',
    });
    expect(
      await editChapter(
        sql,
        parent,
        a.chapterId,
        { number: 2, title: 'Fractions', description: 'Halves and quarters' },
        T0,
      ),
    ).toEqual({ ok: true });
    const [view] = await listOwnBooks(sql, parent);
    expect(view!.chapters.map((c) => [c.number, c.title, c.origin])).toEqual([
      [1, 'Chapter 1 (sample)', 'typed'],
      [2, 'Fractions', 'typed'],
    ]);
  });

  it('a removed photo, a cancelled chapter and a chapter left unfinished leave nothing behind', async () => {
    const { parent, child } = await family();
    const bookId = await chapterBook(parent, [child], 'Sample');
    const one = await photoChapter(parent, bookId, 1, [5, 6]);
    expect(await removeChapterFile(sql, parent, one.chapterId, one.ids[0]!, T0)).toEqual({ ok: true });
    expect(await finishChapter(sql, parent, one.chapterId, one.ids, T0)).toEqual({ ok: false, reason: 'invalid' });
    expect(await finishChapter(sql, parent, one.chapterId, [one.ids[1]], T0)).toEqual({ ok: true });
    const two = await photoChapter(parent, bookId, 2, [7]);
    expect(await discardChapter(sql, parent, two.chapterId, T0)).toEqual({ ok: true });
    const three = await photoChapter(parent, bookId, 3, [8]);
    expect(await discardStaleChapters(sql, parent, new Date(T0.getTime() + 3 * 60 * 60 * 1000))).toBe(1);
    const live = await sql<{ id: string }[]>`
      SELECT id FROM stored_files WHERE owner_id = ${parent} AND purpose = 'book' AND deleted_at IS NULL`;
    expect(live.map((f) => f.id)).toEqual([one.ids[1]]);
    expect(await sql`SELECT 1 FROM book_chapters WHERE id IN ${sql([two.chapterId, three.chapterId])}`).toHaveLength(0);
  });
});

describe('files that are refused (BK-9, SEC-14)', () => {
  it('a password-locked PDF, a cut-off PDF and a non-PDF book are refused and nothing is kept', async () => {
    const { parent, child } = await family();
    const base = { title: 'Sample', subject: 'maths', childIds: [child], pageCount: 4, split: 'none', publish: false };
    const locked = Buffer.from('%PDF-1.4\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF\n', 'latin1');
    const cut = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n', 'latin1');
    expect(
      await createCompleteBook(sql, parent, { ...base, uploadId: await upload(parent, locked, 'a.pdf') }, T0),
    ).toMatchObject({ ok: false, reason: 'pdf_locked' });
    expect(
      await createCompleteBook(sql, parent, { ...base, uploadId: await upload(parent, cut, 'b.pdf') }, T0),
    ).toMatchObject({
      ok: false,
      reason: 'unreadable',
    });
    expect(
      await createCompleteBook(sql, parent, { ...base, uploadId: await upload(parent, await photo(5), 'c.pdf') }, T0),
    ).toMatchObject({ ok: false, reason: 'not_pdf' });
    expect(await sql`SELECT 1 FROM stored_files WHERE owner_id = ${parent} AND deleted_at IS NULL`).toHaveLength(0);
    expect(await listOwnBooks(sql, parent)).toEqual([]);
  });
});

describe('the same file again (BK-8, B-4)', () => {
  it('the same parent is offered the existing book; another family’s identical file is stored and never mentioned', async () => {
    const one = await family();
    const file = samplePdf('shared');
    const first = await createCompleteBook(
      sql,
      one.parent,
      {
        uploadId: await upload(one.parent, file, 'a.pdf'),
        title: 'First copy',
        subject: 'maths',
        childIds: [],
        pageCount: 4,
        split: 'none',
        publish: false,
      },
      T0,
    );
    expect(first).toMatchObject({ ok: true });
    const again = await createCompleteBook(
      sql,
      one.parent,
      {
        uploadId: await upload(one.parent, file, 'b.pdf'),
        title: 'Second copy',
        subject: 'maths',
        childIds: [],
        pageCount: 4,
        split: 'none',
        publish: false,
      },
      T0,
    );
    expect(again).toEqual({
      ok: false,
      reason: 'duplicate',
      bookId: (first as { bookId: string }).bookId,
      title: 'First copy',
    });
    const two = await family();
    expect(
      await createCompleteBook(
        sql,
        two.parent,
        {
          uploadId: await upload(two.parent, file, 'c.pdf'),
          title: 'Other family',
          subject: 'maths',
          childIds: [],
          pageCount: 4,
          split: 'none',
          publish: false,
        },
        T0,
      ),
    ).toMatchObject({ ok: true });
  });
});

describe('who can read a book (BK-10, BK-11, BK-15, W-5, OC-41(5))', () => {
  it('own children and linked teachers in the subject once published; nobody else; teachers never download', async () => {
    const { parent, child } = await family();
    const sibling = await createChild(sql, parent);
    const bookId = await completeBook(parent, child, { publish: false });
    const chaptersId = await chapterBook(parent, [child], 'Photo notes', 'science');
    const ph = await photoChapter(parent, chaptersId, 1, [40]);
    await finishChapter(sql, parent, ph.chapterId, ph.ids, T0);
    const t = await teacher();
    const otherSubject = await teacher();
    const unlinked = await teacher();
    await activeLink(sql, { teacher: t, child, parent, subjects: ['science'] });
    await activeLink(sql, { teacher: otherSubject, child, parent, subjects: ['maths'] });
    const stranger = await family();
    const admin = await createAdult(sql, 'superadmin');
    const fileOf = async (id: string) =>
      (await sql<{ file_id: string }[]>`SELECT file_id FROM books WHERE id = ${id}`)[0]!.file_id;

    // Draft: only the owner.
    expect(await getBookForViewer(sql, child, bookId)).toBeNull();
    expect(await getBookForViewer(sql, t, bookId)).toBeNull();
    expect(await getBookForViewer(sql, parent, bookId)).toMatchObject({ isOwner: true, canDownload: true });

    await setBookStatus(sql, parent, bookId, { publish: true }, T0);
    await setBookStatus(sql, parent, chaptersId, { publish: true }, T0);
    expect(await getBookForViewer(sql, child, bookId)).toMatchObject({
      isOwner: false,
      canDownload: false,
      children: [],
    });
    expect(await getBookForViewer(sql, t, bookId)).toMatchObject({ canDownload: false });
    expect(await mayReadFile(sql, t, await fileOf(bookId))).not.toBeNull();
    expect(await mayReadFile(sql, t, ph.ids[0]!)).not.toBeNull();
    for (const who of [sibling, otherSubject, unlinked, stranger.parent, stranger.child, admin]) {
      expect(await getBookForViewer(sql, who, bookId)).toBeNull();
      expect(await getBookForViewer(sql, who, chaptersId)).toBeNull();
      expect(await mayReadFile(sql, who, await fileOf(bookId))).toBeNull();
      expect(await mayReadFile(sql, who, ph.ids[0]!)).toBeNull();
    }
    expect((await listBooksForStudent(sql, child)).map((b) => b.title).sort()).toEqual([
      'Photo notes',
      'Science sample book',
    ]);
    expect(await listBooksForStudent(sql, sibling)).toEqual([]);
    expect(await listBooksForTeacher(sql, t, child)).toHaveLength(2);
    expect(await listBooksForTeacher(sql, otherSubject, child)).toEqual([]);

    // SEC-10: an administrator's attempt is refused and recorded.
    await noteRefusedBook(sql, admin, bookId, T0);
    const [audit] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM audit_events
      WHERE event_type = 'BOOK_READ_REFUSED' AND actor_id = ${admin} AND details->>'bookId' = ${bookId}`;
    expect(audit!.n).toBe(1);
    // The link ends: the teacher loses access at once; nothing is deleted.
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE teacher_id = ${t}`;
    expect(await getBookForViewer(sql, t, bookId)).toBeNull();
    expect(await mayReadFile(sql, t, ph.ids[0]!)).toBeNull();
    // Archived: children lose it too; the owner keeps it.
    await setBookStatus(sql, parent, bookId, { archive: true }, T0);
    expect(await getBookForViewer(sql, child, bookId)).toBeNull();
    expect(await getBookForViewer(sql, parent, bookId)).toMatchObject({ archived: true });
  });

  it('only the parent’s own children can be given a book; other accounts can’t change it', async () => {
    const { parent, child } = await family();
    const other = await family();
    expect(
      await createChapterBook(sql, parent, { title: 'Sample', subject: 'maths', childIds: [other.child] }, T0),
    ).toEqual({ ok: false, reason: 'children' });
    const bookId = await chapterBook(parent, [child], 'Sample');
    await expect(
      sql`INSERT INTO book_children (book_id, student_id) VALUES (${bookId}, ${other.child})`,
    ).rejects.toThrow(/own children/);
    for (const who of [other.parent, child, await teacher(), await createAdult(sql, 'superadmin')]) {
      expect(await setBookStatus(sql, who, bookId, { publish: true }, T0)).toMatchObject({ ok: false });
      expect(await startChapter(sql, who, bookId, { number: 1, title: 'X' }, T0)).toMatchObject({ ok: false });
    }
    const ch = await photoChapter(parent, bookId, 1, [9]);
    expect(await archiveChapter(sql, other.parent, ch.chapterId, T0)).toEqual({ ok: false, reason: 'not_found' });
    expect(await addChapterFile(sql, other.parent, ch.chapterId, randomUUID(), T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('B-9: the 30-photo limit never gets round the other limits', () => {
  afterEach(async () => {
    for (const [key, value] of Object.entries(DEFAULT_STORAGE_SETTINGS)) {
      await sql`UPDATE platform_settings SET value = ${value} WHERE key = ${key}`;
    }
  });

  async function openChapter() {
    const { parent, child } = await family();
    const bookId = await chapterBook(parent, [child], 'Limits');
    const s = await startChapter(sql, parent, bookId, { number: 1, title: 'Limits' }, T0);
    if (!s.ok) throw new Error();
    return { parent, chapterId: s.chapterId };
  }

  it('a photo over 20 MB is refused', async () => {
    const { parent, chapterId } = await openChapter();
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20 * 1024 * 1024 + 10, 7)]);
    expect(await addChapterFile(sql, parent, chapterId, await upload(parent, big, 'huge.jpg'), T0)).toMatchObject({
      ok: false,
      reason: 'too_big',
    });
  });

  it('a photo that would take the family past its space is refused', async () => {
    const { parent, chapterId } = await openChapter();
    await sql`UPDATE platform_settings SET value = 1 WHERE key = 'file_mb_per_account'`;
    // A large speckled photo stays over 1 MB after conversion.
    const heavy = await photo(90, 'png', 2400);
    expect(await addChapterFile(sql, parent, chapterId, await upload(parent, heavy, 'heavy.png'), T0)).toMatchObject({
      ok: false,
      reason: 'space_full',
    });
  });

  it('at the storage stop level no photo is stored', async () => {
    const { parent, chapterId } = await openChapter();
    // Sent before the stop (new pieces are refused at the stop too), then saved after it.
    const sent = await upload(parent, await photo(12, 'jpeg', 200), 'p.jpg');
    await sql`UPDATE platform_settings SET value = 1 WHERE key = 'database_allowance_mb'`;
    // A date far from every other test: the one-a-day "uploads stopped" notice this records must
    // not hide the one tests/db/storageLimits.test.ts expects (the database is shared by all files).
    const longAgo = new Date('2001-01-01T00:00:00Z');
    expect(await addChapterFile(sql, parent, chapterId, sent, longAgo)).toMatchObject({
      ok: false,
      reason: 'storage_full',
    });
    expect(await sql`SELECT 1 FROM book_chapter_files WHERE chapter_id = ${chapterId}`).toHaveLength(0);
  });

  it('two photos sent at once for the last place: one is kept, one refused', async () => {
    const { parent, chapterId } = await openChapter();
    for (let i = 0; i < PHOTO_LIMIT - 1; i++) {
      const r = await addChapterFile(
        sql,
        parent,
        chapterId,
        await upload(parent, await photo(i * 8, 'jpeg', 120), 'p.jpg'),
        T0,
      );
      expect(r.ok).toBe(true);
    }
    const [a, b] = [
      await upload(parent, await photo(251, 'jpeg', 120), 'a.jpg'),
      await upload(parent, await photo(252, 'jpeg', 120), 'b.jpg'),
    ];
    const results = await Promise.all([
      addChapterFile(sql, parent, chapterId, a, T0),
      addChapterFile(sql, parent, chapterId, b, T0),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'too_many_photos' }]);
    const files = await sql<{ position: number }[]>`
      SELECT position FROM book_chapter_files WHERE chapter_id = ${chapterId} ORDER BY position`;
    expect(files.map((f) => f.position)).toEqual(Array.from({ length: PHOTO_LIMIT }, (_, i) => i + 1));
    const [kept] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM stored_files WHERE owner_id = ${parent} AND purpose = 'book' AND deleted_at IS NULL`;
    expect(kept!.n).toBe(PHOTO_LIMIT);
  }, 120_000);
});

describe('SEC-16: the same file uploaded twice at the same moment', () => {
  it('one book is made and the other is offered it; one file stored; nothing left waiting', async () => {
    const { parent, child } = await family();
    const file = samplePdf('race');
    const base = { title: 'Race', subject: 'maths', childIds: [child], pageCount: 4, split: 'none', publish: false };
    const ids = [await upload(parent, file, 'a.pdf'), await upload(parent, file, 'b.pdf')];
    const results = await Promise.all(
      ids.map((uploadId) => createCompleteBook(sql, parent, { ...base, uploadId }, T0)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const made = results.find((r) => r.ok) as { bookId: string };
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'duplicate', bookId: made.bookId, title: 'Race' });
    expect(await sql`SELECT 1 FROM books WHERE owner_id = ${parent}`).toHaveLength(1);
    expect(
      await sql`SELECT 1 FROM stored_files WHERE owner_id = ${parent} AND purpose = 'book' AND deleted_at IS NULL`,
    ).toHaveLength(1);
    expect(await sql`SELECT 1 FROM upload_parts WHERE owner_id = ${parent}`).toHaveLength(0);
    // Only the stored file counts towards the family's space and uploads.
    const usage = await ownUsage(sql, parent, T0);
    expect(usage.usedBytes).toBe(file.length);
  });

  it('two families uploading the same file at once each get their own book, and neither is told', async () => {
    const one = await family();
    const two = await family();
    const file = samplePdf('two-families');
    const make = async (f: { parent: string; child: string }) =>
      createCompleteBook(
        sql,
        f.parent,
        {
          uploadId: await upload(f.parent, file, 'x.pdf'),
          title: 'Same',
          subject: 'maths',
          childIds: [f.child],
          pageCount: 4,
          split: 'none',
          publish: false,
        },
        T0,
      );
    const [a, b] = await Promise.all([make(one), make(two)]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true });
    expect(JSON.stringify([a, b])).not.toContain('duplicate');
  });
});
