import 'server-only';
import { SUBJECT_IDS, type SubjectId } from '@/fixtures/subjects';
import { writeAudit } from './auth/audit';
import type { Db, Sql, Tx } from './db/client';
import { storeUploadedFile } from './files/pieces';
import { removeFile, type StoreResult } from './files/store';

/**
 * Parents' books (CR-17 PR B1; OC-74 as amended by B-1; owner decisions OC-127 to OC-129).
 *
 * - A book is ONE complete PDF ("Use as it is", or "Split in Chapters" into page ranges, also
 *   later: B-8) or a set of separate chapters, each one PDF or 1–30 page photos (B-6, B-7, B-9).
 * - Chapter suggestions are made in the parent's browser from the PDF's bookmarks or contents page
 *   (pdf.js); nothing is saved until the parent confirms, and the server checks every range
 *   again. Titles are the parent's (typed or confirmed), never invented (OC-63).
 * - The same file uploaded again by the same parent is refused and the existing copy offered;
 *   other families' files are never compared (B-4).
 * - Who may read: the parent owner; once published, the children it was given to, their active
 *   guardians, and teachers linked to such a child in the book's subject, view only (OC-41(5)).
 *   Admins and the Super Admin never (W-5). Refusals look like "not found".
 * - No AI, no OCR, no paid service.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** B-9 (proposed, awaiting the owner's answer): the most page photos in one chapter. */
export const PHOTO_LIMIT = 30;
export const MAX_PAGES = 3000;
export const MAX_CHAPTERS = 200;

const line = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const para = (s: unknown) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').trim() : '');
const int = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : NaN;
};
const isSubject = (s: string): s is SubjectId => (SUBJECT_IDS as readonly string[]).includes(s);

export type TitleOrigin = 'typed' | 'file_name' | 'bookmarks' | 'contents';
const ORIGINS: TitleOrigin[] = ['typed', 'file_name', 'bookmarks', 'contents'];

async function activeParent(sql: Db, parentId: string): Promise<boolean> {
  if (!UUID.test(parentId)) return false;
  const [row] = await sql`SELECT 1 FROM accounts WHERE id = ${parentId} AND role = 'parent' AND status = 'active'`;
  return Boolean(row);
}

async function ownChildren(sql: Db, parentId: string, ids: unknown): Promise<string[] | null> {
  if (!Array.isArray(ids)) return null;
  const unique = [...new Set(ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)))];
  if (unique.length !== ids.length || unique.length > 20) return null;
  if (unique.length === 0) return [];
  const rows = await sql<Array<{ student_id: string }>>`
    SELECT student_id FROM guardian_links WHERE parent_id = ${parentId} AND status = 'active' AND student_id IN ${sql(unique)}`;
  return rows.length === unique.length ? unique : null;
}

export interface ChapterRange {
  number: number;
  title: string;
  firstPage: number;
  lastPage: number;
  origin: TitleOrigin;
}

export type RangeProblem = 'title' | 'number' | 'pages' | 'overlap' | 'too_many';

/** Checks confirmed page-range chapters against the page count and each other (B-1). */
export function checkRanges(
  raw: unknown,
  pageCount: number,
): { ok: true; chapters: ChapterRange[] } | { ok: false; problem: RangeProblem; index: number } {
  if (!Array.isArray(raw)) return { ok: false, problem: 'too_many', index: -1 };
  if (raw.length === 0 || raw.length > MAX_CHAPTERS) return { ok: false, problem: 'too_many', index: -1 };
  const out: ChapterRange[] = [];
  const numbers = new Set<number>();
  for (const [i, r] of raw.entries()) {
    const c = (r ?? {}) as Record<string, unknown>;
    const title = line(c.title);
    const number = int(c.number);
    const first = int(c.firstPage);
    const last = int(c.lastPage);
    const origin = ORIGINS.includes(c.origin as TitleOrigin) ? (c.origin as TitleOrigin) : 'typed';
    if (!title || title.length > 200) return { ok: false, problem: 'title', index: i };
    if (!(number >= 1 && number <= 999) || numbers.has(number)) return { ok: false, problem: 'number', index: i };
    if (!(first >= 1 && last >= first && last <= pageCount)) return { ok: false, problem: 'pages', index: i };
    numbers.add(number);
    out.push({ number, title, firstPage: first, lastPage: last, origin });
  }
  const sorted = [...out].sort((a, b) => a.firstPage - b.firstPage);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.firstPage <= sorted[i - 1]!.lastPage) {
      return { ok: false, problem: 'overlap', index: out.indexOf(sorted[i]!) };
    }
  }
  return { ok: true, chapters: out };
}

type UploadFailure =
  Exclude<StoreResult, { ok: true } | { ok: false; reason: 'refused' }> | { ok: false; reason: 'upload_missing' };

export type CompleteBookResult =
  | { ok: true; bookId: string }
  | { ok: false; reason: 'not_allowed' | 'invalid' | 'children' | 'not_pdf' }
  | { ok: false; reason: 'chapters'; problem: RangeProblem; index: number }
  | { ok: false; reason: 'duplicate'; bookId: string; title: string }
  | UploadFailure;

export interface CompleteBookInput {
  uploadId: unknown;
  title: unknown;
  subject: unknown;
  childIds: unknown;
  /** Read in the parent's browser by pdf.js; checked to be a whole number 1–3000. */
  pageCount: unknown;
  pageOffset?: unknown;
  /** "Use as it is" (none) or "Split in Chapters" (chapters). */
  split: unknown;
  method?: unknown;
  chapters?: unknown;
  publish: unknown;
}

/** A parent's same file already stored as a book file (B-4: own account only). */
async function duplicateOf(
  tx: Tx,
  parentId: string,
  fileId: string,
): Promise<{ bookId: string; title: string } | null> {
  const [d] = await tx<Array<{ book_id: string; title: string }>>`
    SELECT b.id AS book_id, b.title FROM stored_files n
    JOIN stored_files o ON o.owner_id = n.owner_id AND o.sha256 = n.sha256 AND o.id <> n.id
      AND o.purpose = 'book' AND o.deleted_at IS NULL
    JOIN books b ON b.owner_id = ${parentId} AND b.archived_at IS NULL AND (b.file_id = o.id OR EXISTS (
      SELECT 1 FROM book_chapters c JOIN book_chapter_files x ON x.chapter_id = c.id
      WHERE c.book_id = b.id AND x.file_id = o.id AND c.archived_at IS NULL))
    WHERE n.id = ${fileId} AND n.owner_id = ${parentId}
    LIMIT 1`;
  return d ? { bookId: d.book_id, title: d.title } : null;
}

async function insertRanges(tx: Tx, bookId: string, chapters: ChapterRange[]): Promise<void> {
  for (const c of chapters) {
    await tx`INSERT INTO book_chapters (book_id, number, title, title_origin, first_page, last_page)
             VALUES (${bookId}, ${c.number}, ${c.title}, ${c.origin}, ${c.firstPage}, ${c.lastPage})`;
  }
}

/** Board B1: a complete book, used as it is or split into confirmed chapters. */
export async function createCompleteBook(
  sql: Sql,
  parentId: string,
  input: CompleteBookInput,
  now: Date = new Date(),
): Promise<CompleteBookResult> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  const title = line(input.title);
  const subject = line(input.subject);
  const pageCount = int(input.pageCount);
  const offset =
    input.pageOffset === undefined || input.pageOffset === null || input.pageOffset === ''
      ? null
      : int(input.pageOffset);
  const split = input.split === 'chapters' ? 'chapters' : input.split === 'none' ? 'none' : null;
  const method = ['bookmarks', 'contents', 'manual'].includes(input.method as string) ? (input.method as string) : null;
  const uploadId = line(input.uploadId);
  if (!title || title.length > 200 || !isSubject(subject) || !split || !UUID.test(uploadId))
    return { ok: false, reason: 'invalid' };
  if (!(pageCount >= 1 && pageCount <= MAX_PAGES) || (offset !== null && !(offset >= 1 && offset <= pageCount))) {
    return { ok: false, reason: 'invalid' };
  }
  const children = await ownChildren(sql, parentId, input.childIds);
  if (!children) return { ok: false, reason: 'children' };
  let chapters: ChapterRange[] = [];
  if (split === 'chapters') {
    const r = checkRanges(input.chapters, pageCount);
    if (!r.ok) return { ok: false, reason: 'chapters', problem: r.problem, index: r.index };
    chapters = r.chapters;
  }
  const publish = input.publish === true && children.length > 0;
  let bookId = '';
  const stored = await storeUploadedFile(sql, parentId, 'book', uploadId, now, async (tx, fileId) => {
    const [f] = await tx<Array<{ media_type: string }>>`SELECT media_type FROM stored_files WHERE id = ${fileId}`;
    if (f?.media_type !== 'application/pdf') return { ok: false, detail: 'not_pdf' };
    const dup = await duplicateOf(tx, parentId, fileId);
    if (dup) return { ok: false, detail: `duplicate:${dup.bookId}` };
    const [b] = await tx<Array<{ id: string }>>`
      INSERT INTO books (owner_id, title, subject, form, split, method, file_id, page_count, page_offset, status,
                         created_at, updated_at)
      VALUES (${parentId}, ${title}, ${subject}, 'single_pdf', ${split}, ${split === 'chapters' ? (method ?? 'manual') : null},
              ${fileId}, ${pageCount}, ${offset}, ${publish ? 'published' : 'draft'}, ${now}, ${now})
      RETURNING id`;
    bookId = b!.id;
    for (const c of children) await tx`INSERT INTO book_children (book_id, student_id) VALUES (${bookId}, ${c})`;
    await insertRanges(tx, bookId, chapters);
    await writeAudit(
      tx,
      {
        type: 'BOOK_ADDED',
        outcome: 'success',
        actorId: parentId,
        details: { bookId, split, chapters: chapters.length },
      },
      now,
    );
    return { ok: true };
  });
  if (stored.ok) return { ok: true, bookId };
  if (stored.reason === 'refused') {
    if (stored.detail === 'not_pdf') return { ok: false, reason: 'not_pdf' };
    const id = stored.detail.slice('duplicate:'.length);
    const [b] = await sql<
      Array<{ title: string }>
    >`SELECT title FROM books WHERE id = ${id} AND owner_id = ${parentId}`;
    return { ok: false, reason: 'duplicate', bookId: id, title: b?.title ?? '' };
  }
  return stored;
}

type OwnBookRow = {
  id: string;
  title: string;
  subject: SubjectId;
  form: 'single_pdf' | 'chapter_files';
  split: 'none' | 'chapters' | null;
  method: string | null;
  file_id: string | null;
  page_count: number | null;
  page_offset: number | null;
  status: 'draft' | 'published';
  archived_at: Date | null;
  updated_at: Date;
};

async function ownBook(sql: Db, parentId: string, bookId: string): Promise<OwnBookRow | null> {
  if (!UUID.test(parentId) || !UUID.test(bookId)) return null;
  const [b] = await sql<OwnBookRow[]>`
    SELECT id, title, subject, form, split, method, file_id, page_count, page_offset, status, archived_at, updated_at
    FROM books WHERE id = ${bookId} AND owner_id = ${parentId}`;
  return b ?? null;
}

export type Simple =
  { ok: true; id?: string } | { ok: false; reason: 'not_found' | 'not_allowed' | 'invalid' | 'children' };

/**
 * B-8: choose "Split in Chapters" later for a book used as it is, or change a split book's
 * chapters. Same book, same PDF; the earlier chapters are archived, not deleted.
 */
export async function setBookChapters(
  sql: Sql,
  parentId: string,
  bookId: string,
  input: { chapters: unknown; method?: unknown; pageOffset?: unknown },
  now: Date = new Date(),
): Promise<Simple | { ok: false; reason: 'chapters'; problem: RangeProblem; index: number }> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  const b = await ownBook(sql, parentId, bookId);
  if (!b || b.archived_at || b.form !== 'single_pdf') return { ok: false, reason: 'not_found' };
  const r = checkRanges(input.chapters, b.page_count!);
  if (!r.ok) return { ok: false, reason: 'chapters', problem: r.problem, index: r.index };
  const offset =
    input.pageOffset === undefined || input.pageOffset === null || input.pageOffset === ''
      ? null
      : int(input.pageOffset);
  if (offset !== null && !(offset >= 1 && offset <= b.page_count!)) return { ok: false, reason: 'invalid' };
  const method = ['bookmarks', 'contents', 'manual'].includes(input.method as string)
    ? (input.method as string)
    : 'manual';
  await sql.begin(async (tx) => {
    await tx`UPDATE book_chapters SET archived_at = ${now} WHERE book_id = ${bookId} AND archived_at IS NULL`;
    await tx`UPDATE books SET split = 'chapters', method = ${method}, page_offset = ${offset} WHERE id = ${bookId}`;
    await insertRanges(tx, bookId, r.chapters);
    await writeAudit(
      tx,
      { type: 'BOOK_SPLIT', outcome: 'success', actorId: parentId, details: { bookId, chapters: r.chapters.length } },
      now,
    );
  });
  return { ok: true };
}

/** Board B2, step 1: a new book of separate chapters (draft until a chapter is added and published). */
export async function createChapterBook(
  sql: Sql,
  parentId: string,
  input: { title: unknown; subject: unknown; childIds: unknown },
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  const title = line(input.title);
  const subject = line(input.subject);
  if (!title || title.length > 200 || !isSubject(subject)) return { ok: false, reason: 'invalid' };
  const children = await ownChildren(sql, parentId, input.childIds);
  if (!children) return { ok: false, reason: 'children' };
  return sql.begin(async (tx): Promise<Simple> => {
    const [b] = await tx<Array<{ id: string }>>`
      INSERT INTO books (owner_id, title, subject, form, status, created_at, updated_at)
      VALUES (${parentId}, ${title}, ${subject}, 'chapter_files', 'draft', ${now}, ${now}) RETURNING id`;
    for (const c of children) await tx`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${c})`;
    await writeAudit(
      tx,
      { type: 'BOOK_ADDED', outcome: 'success', actorId: parentId, details: { bookId: b!.id, form: 'chapter_files' } },
      now,
    );
    return { ok: true, id: b!.id };
  });
}

/** Unfinished chapters are removed after this long (as unfinished uploads are). */
const STALE_CHAPTER_MS = 2 * 60 * 60 * 1000;

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === '23505';

export type StartChapterResult =
  { ok: true; chapterId: string } | { ok: false; reason: 'not_allowed' | 'not_found' | 'invalid' | 'number_taken' };

/**
 * Board B2, step 2a: a new chapter of a book of separate chapters, hidden from readers until its
 * files are in. Its number is kept for it straight away, so two tabs can't take the same number.
 */
export async function startChapter(
  sql: Sql,
  parentId: string,
  bookId: string,
  input: { number: unknown; title: unknown; description?: unknown; origin?: unknown },
  now: Date = new Date(),
): Promise<StartChapterResult> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  const b = await ownBook(sql, parentId, bookId);
  if (!b || b.archived_at || b.form !== 'chapter_files') return { ok: false, reason: 'not_found' };
  const number = int(input.number);
  const title = line(input.title);
  const description = para(input.description);
  const origin = input.origin === 'file_name' ? 'file_name' : 'typed';
  if (!(number >= 1 && number <= 999) || !title || title.length > 200 || description.length > 500) {
    return { ok: false, reason: 'invalid' };
  }
  await discardStaleChapters(sql, parentId, now);
  try {
    const [c] = await sql<Array<{ id: string }>>`
      INSERT INTO book_chapters (book_id, number, title, description, title_origin, complete, created_at)
      VALUES (${bookId}, ${number}, ${title}, ${description || null}, ${origin}, false, ${now}) RETURNING id`;
    return { ok: true, chapterId: c!.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: 'number_taken' };
    throw e;
  }
}

/** The parent's own unfinished chapter. */
async function pendingChapter(sql: Db, parentId: string, chapterId: string) {
  if (!UUID.test(parentId) || !UUID.test(chapterId)) return null;
  const [c] = await sql<Array<{ id: string; book_id: string; files: number; pdfs: number }>>`
    SELECT c.id, c.book_id,
      (SELECT count(*)::int FROM book_chapter_files x WHERE x.chapter_id = c.id) AS files,
      (SELECT count(*)::int FROM book_chapter_files x JOIN stored_files f ON f.id = x.file_id
       WHERE x.chapter_id = c.id AND f.media_type = 'application/pdf') AS pdfs
    FROM book_chapters c JOIN books b ON b.id = c.book_id
    WHERE c.id = ${chapterId} AND b.owner_id = ${parentId} AND b.archived_at IS NULL
      AND NOT c.complete AND c.archived_at IS NULL`;
  return c ?? null;
}

export type AddFileResult =
  | { ok: true; fileId: string; mediaType: string }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'too_many_photos' | 'mixed' }
  | { ok: false; reason: 'duplicate'; bookId: string; title: string }
  | UploadFailure;

/**
 * Board B2, step 2b: one file of an unfinished chapter: one PDF, or up to 30 page photos (B-7,
 * B-9). Each goes through the normal checks (type read from the content, 20 MB, photos turned into
 * JPEGs with location and camera details removed). One file per request keeps every request
 * under the free host's limits.
 */
export async function addChapterFile(
  sql: Sql,
  parentId: string,
  chapterId: string,
  uploadId: unknown,
  now: Date = new Date(),
): Promise<AddFileResult> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  const c = await pendingChapter(sql, parentId, chapterId);
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.files >= PHOTO_LIMIT) return { ok: false, reason: 'too_many_photos' };
  if (c.pdfs > 0) return { ok: false, reason: 'mixed' };
  let dup: { bookId: string; title: string } | null = null;
  let mediaType = '';
  const stored = await storeUploadedFile(sql, parentId, 'book', line(uploadId), now, async (tx, fileId) => {
    // Locked: two files sent at once can't both take the last place or the same position.
    const [locked] = await tx<Array<{ id: string }>>`
      SELECT id FROM book_chapters WHERE id = ${chapterId} AND NOT complete AND archived_at IS NULL FOR UPDATE`;
    if (!locked) return { ok: false, detail: 'gone' };
    const [f] = await tx<Array<{ media_type: string }>>`SELECT media_type FROM stored_files WHERE id = ${fileId}`;
    const [n] = await tx<Array<{ files: number; pdfs: number }>>`
      SELECT count(*)::int AS files, count(*) FILTER (WHERE s.media_type = 'application/pdf')::int AS pdfs
      FROM book_chapter_files x JOIN stored_files s ON s.id = x.file_id WHERE x.chapter_id = ${chapterId}`;
    if (n!.files >= PHOTO_LIMIT) return { ok: false, detail: 'too_many' };
    if (n!.pdfs > 0 || (n!.files > 0 && f?.media_type === 'application/pdf')) return { ok: false, detail: 'mixed' };
    dup = await duplicateOf(tx, parentId, fileId);
    if (dup) return { ok: false, detail: 'duplicate' };
    mediaType = f!.media_type;
    await tx`INSERT INTO book_chapter_files (chapter_id, position, file_id) VALUES (${chapterId}, ${n!.files + 1}, ${fileId})`;
    return { ok: true };
  });
  if (stored.ok) return { ok: true, fileId: stored.fileId, mediaType };
  if (stored.reason === 'refused') {
    if (stored.detail === 'gone') return { ok: false, reason: 'not_found' };
    if (stored.detail === 'too_many') return { ok: false, reason: 'too_many_photos' };
    if (stored.detail === 'mixed') return { ok: false, reason: 'mixed' };
    const d = dup as { bookId: string; title: string } | null;
    return { ok: false, reason: 'duplicate', bookId: d?.bookId ?? '', title: d?.title ?? '' };
  }
  return stored;
}

/** Takes one file back out of an unfinished chapter (the parent removed a photo). */
export async function removeChapterFile(
  sql: Sql,
  parentId: string,
  chapterId: string,
  fileId: string,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  if (!(await pendingChapter(sql, parentId, chapterId)) || !UUID.test(fileId))
    return { ok: false, reason: 'not_found' };
  const gone =
    await sql`DELETE FROM book_chapter_files WHERE chapter_id = ${chapterId} AND file_id = ${fileId} RETURNING file_id`;
  if (!gone.length) return { ok: false, reason: 'not_found' };
  await removeFile(sql, parentId, fileId, now);
  return { ok: true };
}

export type FinishChapterResult =
  { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'invalid' | 'no_files' | 'number_taken' };

/**
 * Board B2, step 2c: the parent's page order is saved and the chapter becomes readable (in a
 * published book). `order` lists every file of the chapter exactly once.
 */
export async function finishChapter(
  sql: Sql,
  parentId: string,
  chapterId: string,
  order: unknown,
  now: Date = new Date(),
): Promise<FinishChapterResult> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  const c = await pendingChapter(sql, parentId, chapterId);
  if (!c) return { ok: false, reason: 'not_found' };
  if (!c.files) return { ok: false, reason: 'no_files' };
  const ids = Array.isArray(order) ? order.map(line) : [];
  return sql.begin(async (tx): Promise<FinishChapterResult> => {
    const [locked] = await tx`SELECT 1 FROM book_chapters WHERE id = ${chapterId} AND NOT complete FOR UPDATE`;
    if (!locked) return { ok: false, reason: 'not_found' };
    const files = await tx<
      Array<{ file_id: string }>
    >`SELECT file_id FROM book_chapter_files WHERE chapter_id = ${chapterId}`;
    const have = new Set(files.map((f) => f.file_id));
    if (ids.length !== have.size || new Set(ids).size !== ids.length || ids.some((id) => !have.has(id))) {
      return { ok: false, reason: 'invalid' };
    }
    // Positions are checked at the end of the save, so they can be swapped freely here.
    for (const [i, id] of ids.entries()) {
      await tx`UPDATE book_chapter_files SET position = ${i + 1} WHERE chapter_id = ${chapterId} AND file_id = ${id}`;
    }
    await tx`UPDATE book_chapters SET complete = true WHERE id = ${chapterId}`;
    await tx`UPDATE books SET updated_at = ${now} WHERE id = ${c.book_id}`;
    await writeAudit(
      tx,
      {
        type: 'BOOK_CHAPTER_ADDED',
        outcome: 'success',
        actorId: parentId,
        details: { bookId: c.book_id, files: ids.length },
      },
      now,
    );
    return { ok: true };
  });
}

/** The parent cancelled an unfinished chapter: it and its files go. */
export async function discardChapter(
  sql: Sql,
  parentId: string,
  chapterId: string,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  if (!(await pendingChapter(sql, parentId, chapterId))) return { ok: false, reason: 'not_found' };
  await dropChapter(sql, parentId, chapterId, now);
  return { ok: true };
}

async function dropChapter(sql: Sql, parentId: string, chapterId: string, now: Date) {
  const files = await sql<Array<{ file_id: string }>>`
    DELETE FROM book_chapter_files WHERE chapter_id = ${chapterId} RETURNING file_id`;
  await sql`DELETE FROM book_chapters WHERE id = ${chapterId} AND NOT complete`;
  for (const f of files) await removeFile(sql, parentId, f.file_id, now);
}

/** Unfinished chapters left for more than two hours (a closed tab) are removed with their files. */
export async function discardStaleChapters(sql: Sql, parentId: string, now: Date = new Date()): Promise<number> {
  const stale = await sql<Array<{ id: string }>>`
    SELECT c.id FROM book_chapters c JOIN books b ON b.id = c.book_id
    WHERE b.owner_id = ${parentId} AND NOT c.complete AND c.created_at < ${new Date(now.getTime() - STALE_CHAPTER_MS)}`;
  for (const c of stale) await dropChapter(sql, parentId, c.id, now);
  return stale.length;
}

/** The parent corrects a chapter's number, title or description (B-1: the parent's words). */
export async function editChapter(
  sql: Sql,
  parentId: string,
  chapterId: string,
  input: { number: unknown; title: unknown; description?: unknown },
  now: Date = new Date(),
): Promise<Simple | { ok: false; reason: 'number_taken' }> {
  if (!(await activeParent(sql, parentId)) || !UUID.test(chapterId)) return { ok: false, reason: 'not_found' };
  const number = int(input.number);
  const title = line(input.title);
  const description = para(input.description);
  if (!(number >= 1 && number <= 999) || !title || title.length > 200 || description.length > 500) {
    return { ok: false, reason: 'invalid' };
  }
  try {
    const rows = await sql`
      UPDATE book_chapters c SET number = ${number}, title = ${title}, description = ${description || null},
        title_origin = CASE WHEN c.title = ${title} THEN c.title_origin ELSE 'typed' END
      FROM books b WHERE c.id = ${chapterId} AND b.id = c.book_id AND b.owner_id = ${parentId}
        AND c.archived_at IS NULL AND b.archived_at IS NULL
      RETURNING c.book_id`;
    if (!rows.length) return { ok: false, reason: 'not_found' };
    await sql`UPDATE books SET updated_at = ${now} WHERE id = ${rows[0]!.book_id}`;
    return { ok: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: 'number_taken' };
    throw e;
  }
}

/** Publish (children can read it) or back to draft; who can read it; archive. */
export async function setBookStatus(
  sql: Sql,
  parentId: string,
  bookId: string,
  change: { publish?: boolean; childIds?: unknown; archive?: boolean; restore?: boolean },
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeParent(sql, parentId))) return { ok: false, reason: 'not_allowed' };
  const b = await ownBook(sql, parentId, bookId);
  if (!b) return { ok: false, reason: 'not_found' };
  let children: string[] | null = null;
  if (change.childIds !== undefined) {
    children = await ownChildren(sql, parentId, change.childIds);
    if (!children) return { ok: false, reason: 'children' };
  }
  return sql.begin(async (tx): Promise<Simple> => {
    if (children) {
      await tx`DELETE FROM book_children WHERE book_id = ${bookId}`;
      for (const c of children) await tx`INSERT INTO book_children (book_id, student_id) VALUES (${bookId}, ${c})`;
    }
    if (change.archive) await tx`UPDATE books SET archived_at = ${now} WHERE id = ${bookId} AND archived_at IS NULL`;
    if (change.restore) await tx`UPDATE books SET archived_at = NULL WHERE id = ${bookId}`;
    if (change.publish !== undefined) {
      if (change.publish) {
        const [kids] = await tx<
          Array<{ n: number }>
        >`SELECT count(*)::int AS n FROM book_children WHERE book_id = ${bookId}`;
        const [chs] = await tx<Array<{ n: number }>>`
          SELECT count(*)::int AS n FROM book_chapters WHERE book_id = ${bookId} AND archived_at IS NULL AND complete`;
        if (!kids!.n || (b.form === 'chapter_files' && !chs!.n)) return { ok: false, reason: 'invalid' };
      }
      await tx`UPDATE books SET status = ${change.publish ? 'published' : 'draft'} WHERE id = ${bookId}`;
    }
    await writeAudit(tx, { type: 'BOOK_CHANGED', outcome: 'success', actorId: parentId, details: { bookId } }, now);
    return { ok: true };
  });
}

/** Archive one chapter (it stays in the PDF, or its files stay stored, until the book goes). */
export async function archiveChapter(
  sql: Sql,
  parentId: string,
  chapterId: string,
  now: Date = new Date(),
): Promise<Simple> {
  if (!(await activeParent(sql, parentId)) || !UUID.test(chapterId)) return { ok: false, reason: 'not_found' };
  const rows = await sql`
    UPDATE book_chapters c SET archived_at = ${now} FROM books b
    WHERE c.id = ${chapterId} AND b.id = c.book_id AND b.owner_id = ${parentId} AND c.archived_at IS NULL RETURNING c.id`;
  return rows.length ? { ok: true } : { ok: false, reason: 'not_found' };
}

export interface BookChapter {
  id: string;
  number: number;
  title: string;
  description: string | null;
  origin: TitleOrigin;
  firstPage: number | null;
  lastPage: number | null;
  /** Separate chapters: their files in order. */
  files: Array<{ id: string; mediaType: string }>;
}

export interface BookView {
  id: string;
  title: string;
  subject: SubjectId;
  form: 'single_pdf' | 'chapter_files';
  split: 'none' | 'chapters' | null;
  method: string | null;
  fileId: string | null;
  pageCount: number | null;
  pageOffset: number | null;
  status: 'draft' | 'published';
  archived: boolean;
  updatedAt: Date;
  children: Array<{ id: string; name: string }>;
  chapters: BookChapter[];
  /** The parent owner may download the original; nobody else may (OC-41(5)). */
  canDownload: boolean;
  isOwner: boolean;
}

async function chaptersOf(sql: Db, bookId: string): Promise<BookChapter[]> {
  const rows = await sql<
    Array<{
      id: string;
      number: number;
      title: string;
      description: string | null;
      title_origin: TitleOrigin;
      first_page: number | null;
      last_page: number | null;
      files: Array<{ id: string; mediaType: string }> | null;
    }>
  >`
    SELECT c.id, c.number, c.title, c.description, c.title_origin, c.first_page, c.last_page,
      (SELECT json_agg(json_build_object('id', f.id, 'mediaType', f.media_type) ORDER BY x.position)
       FROM book_chapter_files x JOIN stored_files f ON f.id = x.file_id AND f.deleted_at IS NULL WHERE x.chapter_id = c.id) AS files
    FROM book_chapters c WHERE c.book_id = ${bookId} AND c.archived_at IS NULL AND c.complete ORDER BY c.number`;
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    description: r.description,
    origin: r.title_origin,
    firstPage: r.first_page,
    lastPage: r.last_page,
    files: r.files ?? [],
  }));
}

async function toView(sql: Db, b: OwnBookRow, isOwner: boolean): Promise<BookView> {
  const kids = await sql<Array<{ id: string; name: string }>>`
    SELECT a.id, a.display_name AS name FROM book_children k JOIN accounts a ON a.id = k.student_id
    WHERE k.book_id = ${b.id} ORDER BY a.display_name`;
  return {
    id: b.id,
    title: b.title,
    subject: b.subject,
    form: b.form,
    split: b.split,
    method: b.method,
    fileId: b.file_id,
    pageCount: b.page_count,
    pageOffset: b.page_offset,
    status: b.status,
    archived: b.archived_at !== null,
    updatedAt: b.updated_at,
    children: isOwner ? [...kids] : [],
    chapters: await chaptersOf(sql, b.id),
    canDownload: isOwner,
    isOwner,
  };
}

/** Content repository (R8): the parent's own books, newest first. */
export async function listOwnBooks(sql: Sql, parentId: string): Promise<BookView[]> {
  if (!(await activeParent(sql, parentId))) return [];
  const rows = await sql<OwnBookRow[]>`
    SELECT id, title, subject, form, split, method, file_id, page_count, page_offset, status, archived_at, updated_at
    FROM books WHERE owner_id = ${parentId} ORDER BY archived_at NULLS FIRST, updated_at DESC`;
  return Promise.all(rows.map((b) => toView(sql, b, true)));
}

/**
 * One book for a reader: the parent owner (any state), or once published and not archived, a
 * child it was given to, their active guardian, or a teacher linked to such a child in the book's
 * subject. Everyone else (Admins included) gets null.
 */
export async function getBookForViewer(sql: Sql, viewerId: string, bookId: string): Promise<BookView | null> {
  if (!UUID.test(viewerId) || !UUID.test(bookId)) return null;
  const [v] = await sql<
    Array<{ role: string }>
  >`SELECT role FROM accounts WHERE id = ${viewerId} AND status = 'active'`;
  if (!v || !['parent', 'student', 'teacher'].includes(v.role)) return null;
  const [b] = await sql<Array<OwnBookRow & { owner_id: string }>>`
    SELECT id, owner_id, title, subject, form, split, method, file_id, page_count, page_offset, status, archived_at, updated_at
    FROM books WHERE id = ${bookId}`;
  if (!b) return null;
  if (b.owner_id === viewerId) return toView(sql, b, true);
  if (b.status !== 'published' || b.archived_at) return null;
  const [ok] = await sql`
    SELECT 1 FROM book_children k WHERE k.book_id = ${bookId} AND (
      (${v.role} = 'student' AND k.student_id = ${viewerId})
      OR (${v.role} = 'parent' AND EXISTS (SELECT 1 FROM guardian_links g WHERE g.parent_id = ${viewerId}
            AND g.student_id = k.student_id AND g.status = 'active'))
      OR (${v.role} = 'teacher' AND EXISTS (
            SELECT 1 FROM teacher_student_links l JOIN teacher_profiles t ON t.account_id = l.teacher_id
            WHERE l.teacher_id = ${viewerId} AND l.student_id = k.student_id AND l.status = 'active'
              AND ${b.subject} = ANY (l.subjects) AND t.approval_status = 'approved')))
    LIMIT 1`;
  return ok ? toView(sql, b, false) : null;
}

export interface BookCard {
  id: string;
  title: string;
  subject: SubjectId;
  chapters: Array<{ id: string; number: number; title: string }>;
  whole: boolean;
}

/** A student's library: published books given to them. */
export async function listBooksForStudent(sql: Sql, studentId: string): Promise<BookCard[]> {
  if (!UUID.test(studentId)) return [];
  const rows = await sql<Array<{ id: string; title: string; subject: SubjectId; split: string | null }>>`
    SELECT b.id, b.title, b.subject, b.split FROM books b JOIN book_children k ON k.book_id = b.id
    JOIN accounts s ON s.id = k.student_id AND s.status = 'active' AND s.role = 'student'
    WHERE k.student_id = ${studentId} AND b.status = 'published' AND b.archived_at IS NULL
    ORDER BY b.subject, b.title`;
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      subject: r.subject,
      whole: r.split === 'none',
      chapters: (await chaptersOf(sql, r.id)).map((c) => ({ id: c.id, number: c.number, title: c.title })),
    })),
  );
}

/** A linked teacher's view of one child's books, in the subjects linked now (view only). */
export async function listBooksForTeacher(sql: Sql, teacherId: string, studentId: string): Promise<BookCard[]> {
  if (!UUID.test(teacherId) || !UUID.test(studentId)) return [];
  const rows = await sql<Array<{ id: string; title: string; subject: SubjectId; split: string | null }>>`
    SELECT b.id, b.title, b.subject, b.split FROM books b JOIN book_children k ON k.book_id = b.id
    JOIN teacher_student_links l ON l.student_id = k.student_id AND l.teacher_id = ${teacherId} AND l.status = 'active'
      AND b.subject = ANY (l.subjects)
    JOIN teacher_profiles t ON t.account_id = l.teacher_id AND t.approval_status = 'approved'
    WHERE k.student_id = ${studentId} AND b.status = 'published' AND b.archived_at IS NULL
    ORDER BY b.subject, b.title`;
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      subject: r.subject,
      whole: r.split === 'none',
      chapters: (await chaptersOf(sql, r.id)).map((c) => ({ id: c.id, number: c.number, title: c.title })),
    })),
  );
}

/** A refused book (SEC-10): recorded in the audit trail when the book exists; looks like "not found". */
export async function noteRefusedBook(sql: Sql, viewerId: string, bookId: string, now: Date = new Date()) {
  if (!UUID.test(viewerId) || !UUID.test(bookId)) return;
  const [exists] = await sql`SELECT 1 FROM books WHERE id = ${bookId}`;
  const [actor] = await sql`SELECT 1 FROM accounts WHERE id = ${viewerId}`;
  if (exists && actor) {
    await writeAudit(
      sql,
      { type: 'BOOK_READ_REFUSED', outcome: 'denied', actorId: viewerId, details: { bookId } },
      now,
    );
  }
}
