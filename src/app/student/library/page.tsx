import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/states/AccessDenied';
import { DEMO_BOOKS } from '@/fixtures/books';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { requireRole } from '@/server/authz';
import { type BookCard, listBooksForStudent } from '@/server/books';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';

export const metadata: Metadata = { title: 'My library' };
export const dynamic = 'force-dynamic';

/** My library (CR-17 PR B1): the books a parent has published for this student. */
export default async function StudentLibraryPage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  const books: BookCard[] = demo
    ? DEMO_BOOKS.filter((b) => b.status === 'published').map((b) => ({
        id: b.id,
        title: b.title,
        subject: b.subject,
        whole: false,
        chapters: b.chapters.map((c, i) => ({ id: `${b.id}-${i}`, ...c })),
      }))
    : await listBooksForStudent(db(), access.viewer.id);
  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">My library</h1>
        <p className="m-0 text-body-md text-on-surface-variant">Books from your family, ready to read.</p>
      </div>
      {books.length === 0 ? (
        <p className="m-0 rounded-[20px] border border-dashed border-outline p-5 text-[17px]">
          No books yet. When your parent adds a book for you, it shows here.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
          {books.map((b) => (
            <li key={b.id}>
              <article
                aria-labelledby={`lib-${b.id}`}
                data-testid="library-book"
                className="flex h-full flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-lowest p-5"
              >
                <span
                  className={cx(
                    'self-start rounded-full px-3 py-1 text-xs font-bold leading-4',
                    SUBJECTS[b.subject].tile,
                  )}
                >
                  {SUBJECTS[b.subject].name}
                </span>
                <h2 id={`lib-${b.id}`} className="m-0 break-words text-[20px] font-bold leading-7">
                  {demo ? b.title : <Link href={`/books/${b.id}`}>{b.title}</Link>}
                </h2>
                {b.chapters.length ? (
                  <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`Chapters of ${b.title}`}>
                    {b.chapters.map((c) => (
                      <li key={c.id} className="text-[17px]">
                        {demo ? (
                          `${c.number}. ${c.title}`
                        ) : (
                          <Link href={`/books/${b.id}?chapter=${c.id}`} className="inline-flex min-h-11 items-center">
                            {c.number}. {c.title}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="m-0 text-[17px]">The whole book, from page 1.</p>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
