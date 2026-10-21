import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { builderOptions, getWorksheet } from '@/server/worksheets';
import { WorksheetBuilder } from '../Builder';

export const metadata: Metadata = { title: 'Edit worksheet' };
export const dynamic = 'force-dynamic';

/** Board W2: edit one of the teacher's own worksheets. Anyone else's gives "not found". */
export default async function EditWorksheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ worksheetId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Worksheet"
        body="Editing worksheets works with real accounts. The sample preview stores nothing."
        homeHref="/teacher/homework"
        homeLabel="Back to my worksheets"
      />
    );
  }
  const { worksheetId } = await params;
  const { saved } = await searchParams;
  const sql = db();
  const worksheet = await getWorksheet(sql, access.viewer.id, worksheetId);
  if (!worksheet) notFound();
  if (worksheet.archived) {
    return (
      <NotReadyYet
        title={worksheet.title}
        body="This worksheet is archived. Restore it from My worksheets to edit or assign it."
        homeHref="/teacher/homework?status=archived"
        homeLabel="Go to archived worksheets"
      />
    );
  }
  const options = await builderOptions(sql, access.viewer.id, worksheet.id);
  if (!options) return <AccessDenied viewerRole={access.viewer.role} />;
  const savedNotice =
    saved === 'ready'
      ? 'Saved and marked ready. You can assign it now.'
      : saved === 'draft'
        ? 'Draft saved.'
        : undefined;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <Link href="/teacher/homework" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ My worksheets
      </Link>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold uppercase tracking-[.06em] text-on-surface-variant">
          {worksheet.status === 'ready' ? 'Ready' : 'Draft'}
        </span>
        <h1 className="text-headline-lg-mobile break-words lg:text-headline-lg">{worksheet.title}</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Changes here stay in your library. Copies already given to students don’t change.
        </p>
      </div>
      <WorksheetBuilder worksheet={worksheet} options={options} savedNotice={savedNotice} />
    </div>
  );
}
