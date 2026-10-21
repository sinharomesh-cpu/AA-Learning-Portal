import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { AccessDenied } from '@/components/states/AccessDenied';
import { Panel } from '@/components/ui/Panel';
import { SUBJECTS } from '@/fixtures/subjects';
import { requireRole } from '@/server/authz';
import { getBookForViewer, noteRefusedBook } from '@/server/books';
import { listChildren } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { ArchiveBookForm, ChapterEditForm, ChildrenForm, PublishButton, SplitLater } from './BookForms';

export const metadata: Metadata = { title: 'Book' };
export const dynamic = 'force-dynamic';

const CHIP = 'inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold leading-4 whitespace-nowrap';

/** The parent's own book (CR-17 PR B1): publish, who can read it, chapters, split later (B-8). */
export default async function ParentBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) return <AccessDenied viewerRole="parent" />;
  const { bookId } = await params;
  const raw = await searchParams;
  const book = await getBookForViewer(db(), access.viewer.id, bookId);
  if (!book || !book.isOwner) {
    await noteRefusedBook(db(), access.viewer.id, bookId);
    return <AccessDenied viewerRole="parent" />;
  }
  const kids = (await listChildren(db(), access.viewer.id)).filter((k) => k.status === 'active');
  const published = book.status === 'published';
  const saved = raw.saved;

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <Link href="/parent/content" className="self-start font-bold">
        ‹ Content repository
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[70ch] flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {book.archived ? (
              <span className={`${CHIP} border-outline-variant bg-surface-container text-on-surface-variant`}>
                Archived
              </span>
            ) : published ? (
              <span className={`${CHIP} border-success-border bg-success-container text-on-success-container`}>
                Published
              </span>
            ) : (
              <span className={`${CHIP} border-warning-border bg-warning-container text-on-warning-container`}>
                Draft
              </span>
            )}
            <span className={`${CHIP} border-transparent ${SUBJECTS[book.subject].tile}`}>
              {SUBJECTS[book.subject].name}
            </span>
            <span className={`${CHIP} border-outline-variant bg-surface-container text-on-surface-variant`}>
              {book.form === 'single_pdf'
                ? book.split === 'chapters'
                  ? `Complete PDF · ${book.chapters.length} chapters`
                  : 'Complete PDF · used as it is'
                : `Separate chapters · ${book.chapters.length}`}
            </span>
          </div>
          <h1 className="m-0 break-words text-headline-lg-mobile lg:text-headline-lg">{book.title}</h1>
          <p className="m-0 text-body-md text-on-surface-variant">
            {book.children.length ? `For ${book.children.map((c) => c.name).join(', ')}.` : 'No child chosen yet.'}{' '}
            {published
              ? 'Your children can read it, and teachers linked to them for this subject can view it without download.'
              : 'Only you can see it until you publish it.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={`/books/${book.id}`}>Open the book</LinkButton>
          {book.fileId ? (
            <LinkButton href={`/files/${book.fileId}/view`} variant="secondary">
              Original PDF
            </LinkButton>
          ) : null}
        </div>
      </div>
      {saved === 'published' || saved === 'draft' ? (
        <p
          role="status"
          className="m-0 rounded-[16px] border border-success-border bg-success-container px-4 py-3 text-[15px] leading-[22px] text-on-success-container"
        >
          {saved === 'published' ? 'Saved and published.' : 'Saved as a draft. Only you can see it.'}
        </p>
      ) : null}

      {book.archived ? null : (
        <Panel id="book-publish" title="Publishing" level={2}>
          <PublishButton bookId={book.id} published={published} />
          <ChildrenForm
            bookId={book.id}
            kids={kids.map((k) => ({ id: k.id, name: k.name, grade: k.grade }))}
            chosen={book.children.map((c) => c.id)}
          />
        </Panel>
      )}

      <Panel
        id="book-chapters"
        title="Chapters"
        intro={
          book.form === 'single_pdf'
            ? 'Each chapter is a page range inside the one PDF, so no copies are made.'
            : 'Each chapter is one PDF, or photos of its pages.'
        }
        level={2}
      >
        {book.chapters.length ? (
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {book.chapters.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-[20px] border border-card-border p-4"
                data-testid="book-chapter"
              >
                <p className="m-0 text-[15px]">
                  <strong>
                    {c.number}. {c.title}
                  </strong>{' '}
                  ·{' '}
                  {c.firstPage
                    ? `PDF pages ${c.firstPage}–${c.lastPage}`
                    : c.files[0]?.mediaType === 'application/pdf'
                      ? 'PDF'
                      : `${c.files.length} ${c.files.length === 1 ? 'photo' : 'photos'}`}{' '}
                  ·{' '}
                  <Link href={`/books/${book.id}?chapter=${c.id}`} className="underline">
                    Open
                  </Link>
                </p>
                {book.archived || book.form === 'single_pdf' ? null : <ChapterEditForm bookId={book.id} chapter={c} />}
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[15px]">
            {book.form === 'single_pdf' ? 'Used as it is: one PDF, read from page 1.' : 'No chapters yet.'}
          </p>
        )}
        {book.archived ? null : book.form === 'single_pdf' && book.fileId && book.pageCount ? (
          <SplitLater
            key={book.chapters.map((c) => c.id).join(',')}
            bookId={book.id}
            fileId={book.fileId}
            pageCount={book.pageCount}
            pageOffset={book.pageOffset}
            current={book.chapters.map((c) => ({
              key: c.id,
              number: String(c.number),
              title: c.title,
              firstPage: String(c.firstPage),
              lastPage: String(c.lastPage),
              origin: c.origin === 'bookmarks' || c.origin === 'contents' ? c.origin : 'typed',
              needsCheck: false,
            }))}
          />
        ) : (
          <LinkButton
            href={`/parent/content/books/chapters?book=${book.id}`}
            variant="secondary"
            className="self-start"
          >
            Add chapters
          </LinkButton>
        )}
      </Panel>

      <ArchiveBookForm bookId={book.id} archived={book.archived} />
    </div>
  );
}
