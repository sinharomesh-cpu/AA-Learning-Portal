import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { BookReader } from '@/components/books/BookReader';
import { AccessDenied } from '@/components/states/AccessDenied';
import { Wordmark } from '@/components/Wordmark';
import { SUBJECTS } from '@/fixtures/subjects';
import { getBookForViewer, noteRefusedBook } from '@/server/books';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getViewer } from '@/server/session';

export const metadata: Metadata = { title: 'Book' };
export const dynamic = 'force-dynamic';

const HOME: Record<string, string> = { parent: '/parent', teacher: '/teacher', student: '/student' };
const BACK: Record<string, [string, string]> = {
  parent: ['/parent/content', 'Back to content repository'],
  teacher: ['/teacher', 'Back to home'],
  student: ['/student/library', 'Back to my library'],
};

/**
 * Reads a parent's book (CR-17 PR B1): the parent owner, or once published, the children it was
 * given to, their guardians and teachers linked to such a child in its subject. View only; no
 * download here (OC-41(5)). Everyone else, Admins included, gets their role's "not found" (W-5).
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isDemoMode()) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.mfaPending) redirect('/security-check');
  const { bookId } = await params;
  const raw = await searchParams;
  const book = await getBookForViewer(db(), viewer.id, bookId);
  if (!book) {
    await noteRefusedBook(db(), viewer.id, bookId);
    return (
      <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-6 px-4 py-8">
        <Wordmark size={24} href={HOME[viewer.role] ?? '/'} />
        <AccessDenied viewerRole={viewer.role} />
      </main>
    );
  }
  const [backHref, backLabel] = book.isOwner
    ? [`/parent/content/books/${book.id}`, 'Back to the book page']
    : (BACK[viewer.role] ?? ['/', 'Back']);
  return (
    <main className="mx-auto flex min-h-screen max-w-[1180px] flex-col gap-4 bg-surface px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Wordmark size={24} href={HOME[viewer.role] ?? '/'} />
        <a href={backHref} className="font-bold">
          {backLabel}
        </a>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 break-words text-headline-sm">{book.title}</h1>
        <p className="m-0 text-[15px] text-on-surface-variant">
          {SUBJECTS[book.subject].name}
          {book.isOwner ? '' : ' · view only'}
        </p>
      </div>
      <BookReader
        title={book.title}
        fileId={book.fileId}
        pageOffset={book.pageOffset}
        chapters={book.chapters}
        initialChapter={typeof raw.chapter === 'string' ? raw.chapter : null}
      />
    </main>
  );
}
