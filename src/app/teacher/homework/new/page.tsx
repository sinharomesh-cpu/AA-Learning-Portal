import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { builderOptions } from '@/server/worksheets';
import { WorksheetBuilder } from '../Builder';

export const metadata: Metadata = { title: 'New worksheet' };
export const dynamic = 'force-dynamic';

/** Board W2: a new worksheet in the teacher's library (CR-17 PR 4). */
export default async function NewWorksheetPage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="New worksheet"
        body="Writing worksheets works with real accounts. The sample preview stores nothing."
        homeHref="/teacher/homework"
        homeLabel="Back to my worksheets"
      />
    );
  }
  const options = await builderOptions(db(), access.viewer.id);
  if (!options) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <Link href="/teacher/homework" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ My worksheets
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">New worksheet</h1>
        <p className="m-0 text-body-md text-on-surface-variant">Saved in your library. Nobody else sees it.</p>
      </div>
      <WorksheetBuilder worksheet={null} options={options} />
    </div>
  );
}
