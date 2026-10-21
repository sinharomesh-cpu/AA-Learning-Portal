import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { AccessDenied } from '@/components/states/AccessDenied';
import { DEMO_BOOKS } from '@/fixtures/books';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { requireRole } from '@/server/authz';
import { listOwnBooks } from '@/server/books';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { OwnStorageMeter } from '@/server/files/meter';

export const metadata: Metadata = { title: 'Content repository' };
export const dynamic = 'force-dynamic';

const CHIP = 'inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold leading-4 whitespace-nowrap';

interface Card {
  id: string;
  title: string;
  subject: SubjectId;
  kind: string;
  status: 'draft' | 'published';
  archived: boolean;
  children: string[];
  chapters: number;
}

function BookCard({ card, demo }: { card: Card; demo: boolean }) {
  const headingId = `book-${card.id}`;
  return (
    <li>
      <article
        aria-labelledby={headingId}
        data-testid="book-card"
        className="flex h-full flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-lowest p-5"
      >
        <div className="flex flex-wrap gap-1.5">
          {card.archived ? (
            <span className={cx(CHIP, 'border-outline-variant bg-surface-container text-on-surface-variant')}>
              Archived
            </span>
          ) : card.status === 'published' ? (
            <span className={cx(CHIP, 'border-success-border bg-success-container text-on-success-container')}>
              Published
            </span>
          ) : (
            <span className={cx(CHIP, 'border-warning-border bg-warning-container text-on-warning-container')}>
              Draft
            </span>
          )}
          <span className={cx(CHIP, SUBJECTS[card.subject].tile, 'border-transparent')}>
            {SUBJECTS[card.subject].name}
          </span>
        </div>
        <h3 id={headingId} className="m-0 break-words text-[19px] font-bold leading-[26px]">
          {card.title}
        </h3>
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          {card.kind} ·{' '}
          {card.chapters ? `${card.chapters} ${card.chapters === 1 ? 'chapter' : 'chapters'}` : 'no chapters'}
          <br />
          {card.children.length ? `For ${card.children.join(', ')}` : 'No child chosen yet'}
        </p>
        {demo ? null : (
          <div className="mt-auto flex flex-wrap gap-2">
            <LinkButton
              href={`/parent/content/books/${card.id}`}
              variant="secondary"
              aria-label={`Manage ${card.title}`}
            >
              Manage
            </LinkButton>
            <LinkButton href={`/books/${card.id}`} variant="secondary" aria-label={`Open ${card.title}`}>
              Open
            </LinkButton>
          </div>
        )}
      </article>
    </li>
  );
}

/** Content repository (R8; CR-17 PR B1): the parent's own books, private to the family. */
export default async function ParentContentPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  const cards: Card[] = demo
    ? DEMO_BOOKS.map((b) => ({
        id: b.id,
        title: b.title,
        subject: b.subject,
        kind: b.form === 'single_pdf' ? 'Complete PDF' : 'Separate chapters',
        status: b.status,
        archived: false,
        children: b.children,
        chapters: b.chapters.length,
      }))
    : (await listOwnBooks(db(), access.viewer.id)).map((b) => ({
        id: b.id,
        title: b.title,
        subject: b.subject,
        kind: b.form === 'single_pdf' ? 'Complete PDF' : 'Separate chapters',
        status: b.status,
        archived: b.archived,
        children: b.children.map((c) => c.name),
        chapters: b.chapters.length,
      }));
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[70ch] flex-col gap-1">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">Content repository</h1>
          <p className="m-0 text-body-md text-on-surface-variant">
            Your family’s books, private to you. Your children see a book only after you publish it.
          </p>
        </div>
        {demo ? null : (
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/parent/content/books/new">Add a book</LinkButton>
            <LinkButton href="/parent/content/books/chapters" variant="secondary">
              Add chapters
            </LinkButton>
          </div>
        )}
      </div>
      {demo ? (
        <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
          <strong>Demo:</strong> sample books only. Adding and reading books works with real accounts.
        </p>
      ) : null}
      <section aria-labelledby="books-heading" className="flex flex-col gap-4">
        <h2 id="books-heading" className="m-0 text-[22px] font-bold leading-8">
          Books
        </h2>
        {cards.length ? (
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <BookCard key={c.id} card={c} demo={demo} />
            ))}
          </ul>
        ) : (
          <p className="m-0 rounded-[20px] border border-dashed border-outline p-5 text-[15px]">
            No books yet.{' '}
            <Link href="/parent/content/books/new" className="underline">
              Add a book
            </Link>{' '}
            as one PDF, or{' '}
            <Link href="/parent/content/books/chapters" className="underline">
              add it chapter by chapter
            </Link>{' '}
            as PDFs or photos.
          </p>
        )}
      </section>
      <OwnStorageMeter accountId={access.viewer.id} />
    </div>
  );
}
