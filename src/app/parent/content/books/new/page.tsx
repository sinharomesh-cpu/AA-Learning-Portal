import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/states/AccessDenied';
import { requireRole } from '@/server/authz';
import { listChildren } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { NewBookForm } from './NewBookForm';

export const metadata: Metadata = { title: 'Add a book' };
export const dynamic = 'force-dynamic';

/** Board B1: add a complete book (CR-17 PR B1). */
export default async function NewBookPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  const kids = demo ? [] : await listChildren(db(), access.viewer.id);
  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <Link href="/parent/content" className="self-start font-bold">
        ‹ Content repository
      </Link>
      <div className="flex max-w-[70ch] flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Add a book</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          It stays private to your family. Your children see it only after you publish it.
        </p>
      </div>
      {demo ? (
        <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
          <strong>Demo:</strong> adding books works with real accounts only.
        </p>
      ) : (
        <NewBookForm
          kids={kids
            .filter((k) => k.status === 'active')
            .map((k) => ({ id: k.id, name: k.name, grade: k.grade, subjects: k.subjects }))}
        />
      )}
    </div>
  );
}
