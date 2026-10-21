import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { SUBJECTS } from '@/fixtures/subjects';
import { assignOptions } from '@/server/assignments';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { AssignForm } from './AssignForm';

export const metadata: Metadata = { title: 'Assign worksheet' };
export const dynamic = 'force-dynamic';

/** Board W3: assign one of the teacher's own Ready worksheets to one linked student. */
export default async function AssignWorksheetPage({ params }: { params: Promise<{ worksheetId: string }> }) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Assign worksheet"
        body="Assigning works with real accounts. The sample preview stores nothing."
        homeHref="/teacher/homework"
        homeLabel="Back to my worksheets"
      />
    );
  }
  const { worksheetId } = await params;
  const options = await assignOptions(db(), access.viewer.id, worksheetId);
  if (!options) notFound();
  const w = options.worksheet;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: options.timeZone }).format(new Date());
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6">
      <Link href="/teacher/homework" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ My worksheets
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-headline-lg-mobile break-words lg:text-headline-lg">Assign “{w.title}”</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          {SUBJECTS[w.subject].name} · Grade {w.grade} · {w.board} ·{' '}
          {w.kind === 'handwritten' ? 'Handwritten' : `${w.questions} questions · ${w.marks} marks`}
        </p>
      </div>
      <AssignForm options={options} today={today} />
    </div>
  );
}
