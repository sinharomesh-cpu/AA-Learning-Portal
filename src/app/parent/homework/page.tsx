import type { Metadata } from 'next';
import { SharedResourceCard, type SharedResourceView } from '@/components/resources/SharedResourceCard';
import { AccessDenied } from '@/components/states/AccessDenied';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { listResourcesForParent } from '@/server/teacherResources';
import { formatDue, HomeworkStatus } from '@/components/homework/HomeworkStatus';
import { SUBJECTS } from '@/fixtures/subjects';
import { type HomeworkItem, listHomeworkForParent } from '@/server/assignments';

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
 * is needed for each file (OC-86); download is allowed (OC-90 Q-3). Homework set for the children
 * (CR-17 PR 5) shows its status; marks only after the teacher releases them.
 */
export default async function ParentHomeworkPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  const items: SharedResourceView[] = demo ? DEMO : await listResourcesForParent(db(), access.viewer.id);
  const homework: HomeworkItem[] = demo ? [] : await listHomeworkForParent(db(), access.viewer.id);
  const tz = access.viewer.timeZone;
  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Homework</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          Homework teachers set for your children, and everything they shared.
        </p>
      </div>
      <section aria-labelledby="set" className="flex flex-col gap-3">
        <h2 id="set" className="m-0 text-headline-sm">
          Homework set
        </h2>
        {demo ? (
          <p className="m-0 text-sm text-on-surface-variant">Homework shows here with real accounts.</p>
        ) : homework.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {homework.map((h) => (
              <li
                key={h.targetId}
                className="flex flex-col gap-2 rounded-[24px] border border-card-border bg-surface-container-lowest p-5"
              >
                <span className="text-sm font-bold text-on-surface-variant">{h.childName}</span>
                <span className="text-[18px] font-bold leading-6">{h.title}</span>
                <span className="text-[15px] text-on-surface-variant">
                  {SUBJECTS[h.subject].name} · from {h.teacherName}
                  {h.dueAt ? ` · due ${formatDue(h.dueAt, tz)}` : ''}
                </span>
                <HomeworkStatus status={h.status} overdue={h.overdue} late={h.late} attempt={h.attempt} />
                <span className="text-[15px]">
                  {h.released
                    ? `Marks: ${h.score} out of ${h.maxScore}`
                    : h.status === 'submitted' || h.status === 'under_review' || h.status === 'reviewed'
                      ? 'Waiting for the teacher'
                      : h.kind === 'handwritten'
                        ? 'Done on paper'
                        : `${h.childName} answers it in AA Pro`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[15px] text-on-surface-variant">No homework set yet.</p>
        )}
      </section>
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
