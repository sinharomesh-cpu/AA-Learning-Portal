import type { Metadata } from 'next';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import Link from 'next/link';
import { AccessDenied } from '@/components/states/AccessDenied';
import { SUBJECTS } from '@/fixtures/subjects';
import { formatFileSize } from '@/lib/filePieces';
import { RESOURCE_TYPE_LABEL } from '@/lib/resourceTypes';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { OwnStorageMeter } from '@/server/files/meter';
import { listOwnResources, type OwnResource, shareOptions } from '@/server/teacherResources';
import { ArchiveButton, EditResource, ShareForm, ShareMore, StopSharing, type StudentOption } from './ResourceForms';

export const metadata: Metadata = { title: 'Learning resources' };
export const dynamic = 'force-dynamic';

const fmtDate = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric' }).format(d);

function ResourceItem({ r, students, timeZone }: { r: OwnResource; students: StudentOption[]; timeZone: string }) {
  const sharedIds = new Set(r.sharedWith.map((s) => s.studentId));
  const more = students.filter((s) => s.subjects.includes(r.subject) && !sharedIds.has(s.studentId));
  return (
    <li
      className="flex flex-col gap-3 rounded-[20px] border border-card-border bg-surface-container-lowest p-4"
      data-testid="own-resource"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="m-0 break-words text-[18px] font-bold leading-6">{r.title}</h3>
          <span className="text-sm leading-5 text-on-surface-variant">
            {RESOURCE_TYPE_LABEL[r.resourceType]} · {SUBJECTS[r.subject].name}
            {r.chapter ? ` · ${r.chapter}` : ''} · {r.mediaType === 'application/pdf' ? 'PDF' : 'Picture'} ·{' '}
            {formatFileSize(r.byteSize)} · shared {fmtDate(r.createdAt, timeZone)}
          </span>
          {r.note ? <p className="m-0 mt-1 whitespace-pre-line text-[15px] leading-6">{r.note}</p> : null}
        </div>
        <Link href={`/files/${r.fileId}/view`} className="font-bold">
          Open
        </Link>
      </div>
      {r.archivedAt ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px]">
            Deleted. Removed for good on {fmtDate(r.removeOn!, timeZone)} unless you restore it.
          </span>
          <ArchiveButton resourceId={r.id} title={r.title} restore />
        </div>
      ) : (
        <>
          <p className="m-0 text-[15px] leading-6">
            {r.sharedWith.length
              ? `Shared with ${r.sharedWith.map((s) => (s.linked ? s.name : `${s.name} (no longer linked)`)).join(', ')}`
              : 'Not shared with anyone right now.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {r.sharedWith.map((s) => (
              <StopSharing key={s.studentId} resourceId={r.id} studentId={s.studentId} name={s.name} />
            ))}
          </div>
          <ShareMore resourceId={r.id} options={more} />
          <EditResource
            resourceId={r.id}
            title={r.title}
            chapter={r.chapter}
            note={r.note}
            resourceType={r.resourceType}
          />
          <div>
            <ArchiveButton resourceId={r.id} title={r.title} />
          </div>
        </>
      )}
    </li>
  );
}

/** Board HW2: share learning resources with linked students (CR-07 H-2b). */
export default async function TeacherResourcesPage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { viewer } = access;
  if (isDemoMode()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Learning resources</h1>
        <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
          <strong>Demo:</strong> sharing files works with real accounts. The sample preview stores no files.
        </p>
        <OwnStorageMeter accountId={viewer.id} />
      </div>
    );
  }
  const sql = db();
  const [students, resources] = await Promise.all([shareOptions(sql, viewer.id), listOwnResources(sql, viewer.id)]);
  const active = resources.filter((r) => !r.archivedAt);
  const archived = resources.filter((r) => r.archivedAt);
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Learning resources</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Your students see what you share on their homework page straight away. Their parents can see it too.
        </p>
      </div>
      <section aria-labelledby="share-new" className={SHELL}>
        <PanelHead id="share-new" title="Share a resource" />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          {students.length ? (
            <ShareForm students={students} />
          ) : (
            <p className="m-0 text-[15px] leading-6">
              No students linked yet. Students appear once a parent links you; then you can share with them.
            </p>
          )}
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            Who will see it: the students you choose, on &ldquo;From my teachers&rdquo;, and each child&apos;s parent.
            Not other families, not other teachers, not AA Pro admins.
          </p>
        </div>
      </section>
      <OwnStorageMeter accountId={viewer.id} />
      <section aria-labelledby="own" className="flex flex-col gap-3">
        <h2 id="own" className="m-0 text-[20px] font-bold leading-7">
          Your shared resources ({active.length})
        </h2>
        {active.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {active.map((r) => (
              <ResourceItem key={r.id} r={r} students={students} timeZone={viewer.timeZone} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[15px] text-on-surface-variant">Nothing shared yet.</p>
        )}
      </section>
      {archived.length ? (
        <section aria-labelledby="deleted" className="flex flex-col gap-3">
          <h2 id="deleted" className="m-0 text-[20px] font-bold leading-7">
            Deleted (kept 30 days)
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {archived.map((r) => (
              <ResourceItem key={r.id} r={r} students={students} timeZone={viewer.timeZone} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
