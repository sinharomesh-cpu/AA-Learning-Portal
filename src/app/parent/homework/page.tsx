import type { Metadata } from 'next';
import { SharedResourceCard, type SharedResourceView } from '@/components/resources/SharedResourceCard';
import { AccessDenied } from '@/components/states/AccessDenied';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { listResourcesForParent } from '@/server/teacherResources';

export const metadata: Metadata = { title: 'Homework' };
export const dynamic = 'force-dynamic';

const DEMO: SharedResourceView[] = [
  {
    id: 'demo-1',
    title: 'Plants and cells notes (sample)',
    subject: 'science',
    chapter: null,
    note: null,
    fileId: null,
    mediaType: 'application/pdf',
    byteSize: 1_200_000,
    teacherName: 'Teacher A. Rao',
    fromCurrentTeacher: true,
    children: [
      { id: 'k', name: 'Kiran' },
      { id: 'm', name: 'Meera' },
    ],
  },
];

/**
 * Board HW8: everything teachers shared with the parent's own children (CR-07 H-2b). No approval
 * is needed for each file (OC-86); download is allowed (OC-90 Q-3). Homework arrives with H-3.
 */
export default async function ParentHomeworkPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  const items: SharedResourceView[] = demo ? DEMO : await listResourcesForParent(db(), access.viewer.id);
  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Homework</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Everything teachers have shared with your children. Homework they set will show here soon.
        </p>
      </div>
      <section aria-labelledby="shared" className="flex flex-col gap-3">
        <h2 id="shared" className="m-0 text-headline-sm">
          Shared with your children
        </h2>
        {demo ? (
          <p className="m-0 text-sm text-on-surface-variant">Sample card. Real files appear with real accounts.</p>
        ) : null}
        {items.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {items.map((r) => (
              <li key={r.id}>
                <SharedResourceCard r={r} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[15px] leading-6 text-on-surface-variant">Nothing shared with your children yet.</p>
        )}
      </section>
    </div>
  );
}
