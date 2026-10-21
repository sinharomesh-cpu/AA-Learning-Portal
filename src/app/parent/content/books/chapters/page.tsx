import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/states/AccessDenied';
import { requireRole } from '@/server/authz';
import { listOwnBooks } from '@/server/books';
import { listChildren } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { ChaptersForm } from './ChaptersForm';

export const metadata: Metadata = { title: 'Add chapters' };
export const dynamic = 'force-dynamic';

/** Board B2: add chapters, each a PDF or photos of its pages (CR-17 PR B1). */
export default async function AddChaptersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  const raw = await searchParams;
  const initial = typeof raw.book === 'string' ? raw.book : '';
  const [kids, own] = demo
    ? [[], []]
    : await Promise.all([listChildren(db(), access.viewer.id), listOwnBooks(db(), access.viewer.id)]);
  const books = own
    .filter((b) => b.form === 'chapter_files' && !b.archived)
    .map((b) => ({
      id: b.id,
      title: b.title,
      subject: b.subject,
      numbers: b.chapters.map((c) => c.number),
      childNames: b.children.map((c) => c.name),
    }));
  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <Link href="/parent/content" className="self-start font-bold">
        ‹ Content repository
      </Link>
      <div className="flex max-w-[70ch] flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Add chapters</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          For a book you have chapter by chapter: each chapter is a PDF, or photos of its pages.
        </p>
      </div>
      {demo ? (
        <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
          <strong>Demo:</strong> adding chapters works with real accounts only.
        </p>
      ) : (
        <ChaptersForm
          kids={kids
            .filter((k) => k.status === 'active')
            .map((k) => ({ id: k.id, name: k.name, grade: k.grade, subjects: k.subjects }))}
          books={books}
          initialBook={books.some((b) => b.id === initial) ? initial : ''}
        />
      )}
    </div>
  );
}
