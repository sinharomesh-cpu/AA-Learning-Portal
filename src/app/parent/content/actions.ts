'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { FILE_PROBLEM_TEXT } from '@/server/files/prepare';
import {
  addChapterFile,
  archiveChapter,
  createChapterBook,
  createCompleteBook,
  discardChapter,
  editChapter,
  finishChapter,
  type RangeProblem,
  removeChapterFile,
  setBookChapters,
  setBookStatus,
  startChapter,
} from '@/server/books';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getRealSession } from '@/server/session';

/**
 * Parents' books (CR-17 PR B1; boards B1, B2). The parent comes from the session only; the server
 * functions check ownership, children, files and every chapter again. Nothing is saved until the
 * parent presses Save, and chapter names are always the parent's own (B-1).
 */

async function parentId(): Promise<string> {
  if (isDemoMode()) redirect('/parent/content');
  const real = await getRealSession();
  if (!real || real.session.role !== 'parent') redirect('/sign-in');
  return real.session.accountId;
}

export type ActionResult<T = object> =
  ({ ok: true } & T) | { ok: false; message: string; index?: number; bookId?: string };

const RANGE_TEXT: Record<RangeProblem, string> = {
  title: 'needs a title (up to 200 characters).',
  number: 'needs its own chapter number (1 to 999).',
  pages: 'needs a first and last PDF page inside the book, with the last not before the first.',
  overlap: 'shares pages with another chapter.',
  too_many: '',
};

function rangeText(problem: RangeProblem, index: number, rows: unknown): string {
  if (problem === 'too_many') return 'Add between 1 and 200 chapters, or choose "Use as it is".';
  const n = Array.isArray(rows) ? Number((rows[index] as { number?: unknown } | undefined)?.number) : NaN;
  return `Chapter ${Number.isInteger(n) ? n : index + 1} ${RANGE_TEXT[problem]}`;
}

const UPLOAD_TEXT: Record<string, string> = {
  ...FILE_PROBLEM_TEXT,
  upload_missing: 'The upload did not finish. Please choose the file again.',
  space_full: "Your family's space for books and homework is full. Archive an old book or ask the AA Pro team.",
  storage_full:
    "New files can't be added right now because AA Pro's test storage is nearly full. Nothing you have already added is affected.",
  daily_limit: 'You have reached today’s upload limit. Please try again tomorrow.',
  not_allowed: 'Your account cannot add books.',
};
const uploadText = (reason: string) =>
  UPLOAD_TEXT[reason] ?? 'The upload stopped. Check your connection and try again.';

const done = (bookId?: string) => {
  revalidatePath('/parent/content');
  if (bookId) revalidatePath(`/parent/content/books/${bookId}`);
};

export async function createCompleteBookAction(input: {
  uploadId: string;
  title: string;
  subject: string;
  childIds: string[];
  pageCount: number;
  pageOffset: number | null;
  split: 'none' | 'chapters';
  method: string | null;
  chapters: unknown[];
  publish: boolean;
  confirmed: boolean;
}): Promise<ActionResult<{ bookId: string }>> {
  const me = await parentId();
  if (input.confirmed !== true)
    return { ok: false, message: 'Please tick the box to confirm you may use this material.' };
  const r = await createCompleteBook(db(), me, input);
  if (r.ok) {
    done(r.bookId);
    return { ok: true, bookId: r.bookId };
  }
  switch (r.reason) {
    case 'chapters':
      return { ok: false, message: rangeText(r.problem, r.index, input.chapters), index: r.index };
    case 'duplicate':
      return {
        ok: false,
        message: `You've already uploaded this file as "${r.title}".`,
        bookId: r.bookId,
      };
    case 'children':
      return { ok: false, message: 'Choose your own children only.' };
    case 'not_pdf':
      return { ok: false, message: 'A complete book must be one PDF. For photos, add the book chapter by chapter.' };
    case 'invalid':
      return { ok: false, message: 'Check the title and subject, then try again.' };
    default:
      return { ok: false, message: uploadText(r.reason) };
  }
}

export async function setBookChaptersAction(
  bookId: string,
  input: { chapters: unknown[]; method: string | null; pageOffset: number | null },
): Promise<ActionResult> {
  const me = await parentId();
  const r = await setBookChapters(db(), me, bookId, input);
  if (r.ok) {
    done(bookId);
    return { ok: true };
  }
  if (r.reason === 'chapters')
    return { ok: false, message: rangeText(r.problem, r.index, input.chapters), index: r.index };
  return { ok: false, message: 'This book could not be changed. Reload the page and try again.' };
}

export async function createChapterBookAction(input: {
  title: string;
  subject: string;
  childIds: string[];
}): Promise<ActionResult<{ bookId: string }>> {
  const me = await parentId();
  const r = await createChapterBook(db(), me, input);
  if (r.ok && r.id) {
    done(r.id);
    return { ok: true, bookId: r.id };
  }
  if (!r.ok && r.reason === 'children') return { ok: false, message: 'Choose your own children only.' };
  return { ok: false, message: 'Add a book title (up to 200 characters) and choose a subject.' };
}

export async function startChapterAction(
  bookId: string,
  input: { number: number; title: string; description: string; origin: 'typed' | 'file_name' },
): Promise<ActionResult<{ chapterId: string }>> {
  const me = await parentId();
  const r = await startChapter(db(), me, bookId, input);
  if (r.ok) return { ok: true, chapterId: r.chapterId };
  if (r.reason === 'number_taken') {
    return {
      ok: false,
      message: `Chapter ${input.number} is already in this book. Choose another number, or archive the old chapter first.`,
    };
  }
  if (r.reason === 'invalid') {
    return {
      ok: false,
      message: 'Each chapter needs a number (1 to 999) and a title; descriptions up to 500 characters.',
    };
  }
  return { ok: false, message: 'This book could not be changed. Reload the page and try again.' };
}

export async function addChapterFileAction(
  chapterId: string,
  uploadId: string,
): Promise<ActionResult<{ fileId: string }>> {
  const me = await parentId();
  const r = await addChapterFile(db(), me, chapterId, uploadId);
  if (r.ok) return { ok: true, fileId: r.fileId };
  switch (r.reason) {
    case 'too_many_photos':
      return {
        ok: false,
        message:
          'This chapter has 30 photos, the most for one chapter. Upload the rest as the next chapter, or as a PDF.',
      };
    case 'mixed':
      return { ok: false, message: 'A chapter is one PDF, or photos of its pages, not both.' };
    case 'duplicate':
      return {
        ok: false,
        message: `This file is already in "${r.title}". Remove it from this upload.`,
        bookId: r.bookId,
      };
    case 'not_found':
      return { ok: false, message: 'This chapter could not be found. Reload the page and try again.' };
    default:
      return { ok: false, message: uploadText(r.reason) };
  }
}

export async function removeChapterFileAction(chapterId: string, fileId: string): Promise<ActionResult> {
  const me = await parentId();
  const r = await removeChapterFile(db(), me, chapterId, fileId);
  return r.ok ? { ok: true } : { ok: false, message: 'This page could not be removed. Reload the page and try again.' };
}

export async function finishChapterAction(bookId: string, chapterId: string, order: string[]): Promise<ActionResult> {
  const me = await parentId();
  const r = await finishChapter(db(), me, chapterId, order);
  if (r.ok) {
    done(bookId);
    return { ok: true };
  }
  return {
    ok: false,
    message:
      r.reason === 'no_files'
        ? 'Add a PDF or at least one photo to this chapter.'
        : 'This chapter could not be saved. Reload the page and try again.',
  };
}

export async function discardChapterAction(chapterId: string): Promise<ActionResult> {
  const me = await parentId();
  await discardChapter(db(), me, chapterId);
  return { ok: true };
}

export async function publishBookAction(bookId: string, publish: boolean): Promise<ActionResult> {
  const me = await parentId();
  const r = await setBookStatus(db(), me, bookId, { publish });
  if (r.ok) {
    done(bookId);
    return { ok: true };
  }
  return {
    ok: false,
    message:
      r.reason === 'invalid'
        ? 'Choose at least one child, and add at least one chapter, before publishing.'
        : 'This book could not be changed. Reload the page and try again.',
  };
}

// ---------------------------------------------------------------- forms on the book page

export interface BookFormState {
  error?: string;
  notice?: string;
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

export async function bookChildrenAction(_: BookFormState, fd: FormData): Promise<BookFormState> {
  const me = await parentId();
  const bookId = str(fd, 'bookId');
  const childIds = fd.getAll('child').filter((v): v is string => typeof v === 'string');
  const r = await setBookStatus(db(), me, bookId, {
    childIds,
    ...(childIds.length === 0 ? { publish: false } : {}),
  });
  if (!r.ok) return { error: 'Choose your own children only.', at: Date.now() };
  done(bookId);
  return {
    notice: childIds.length ? 'Saved.' : 'Saved. With no child chosen, the book is back to draft.',
    at: Date.now(),
  };
}

export async function archiveBookAction(_: BookFormState, fd: FormData): Promise<BookFormState> {
  const me = await parentId();
  const bookId = str(fd, 'bookId');
  const restore = str(fd, 'restore') === '1';
  const r = await setBookStatus(db(), me, bookId, restore ? { restore: true } : { archive: true });
  if (!r.ok) return { error: 'This book could not be changed.', at: Date.now() };
  done(bookId);
  return { notice: restore ? 'Restored.' : 'Archived. Children and teachers can no longer open it.', at: Date.now() };
}

export async function editChapterAction(_: BookFormState, fd: FormData): Promise<BookFormState> {
  const me = await parentId();
  const bookId = str(fd, 'bookId');
  const r = await editChapter(db(), me, str(fd, 'chapterId'), {
    number: str(fd, 'number'),
    title: str(fd, 'title'),
    description: str(fd, 'description'),
  });
  if (!r.ok) {
    return {
      error:
        r.reason === 'number_taken'
          ? 'Another chapter already has this number.'
          : 'Each chapter needs a number (1 to 999) and a title; descriptions up to 500 characters.',
      at: Date.now(),
    };
  }
  done(bookId);
  return { notice: 'Chapter saved.', at: Date.now() };
}

export async function archiveChapterAction(_: BookFormState, fd: FormData): Promise<BookFormState> {
  const me = await parentId();
  const bookId = str(fd, 'bookId');
  const r = await archiveChapter(db(), me, str(fd, 'chapterId'));
  if (!r.ok) return { error: 'This chapter could not be archived.', at: Date.now() };
  done(bookId);
  return { notice: 'Chapter archived.', at: Date.now() };
}
