import type { Metadata } from 'next';
import Link from 'next/link';
import { SharedResourceCard, type SharedResourceView } from '@/components/resources/SharedResourceCard';
import { AccessDenied } from '@/components/states/AccessDenied';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { listResourcesForStudent } from '@/server/teacherResources';

export const metadata: Metadata = { title: 'My homework' };
export const dynamic = 'force-dynamic';

/** Sample cards for the demo preview (no files). */
const DEMO: SharedResourceView[] = [
  {
    id: 'demo-1',
    title: 'Plants and cells notes (sample)',
    subject: 'science',
    chapter: 'Chapter 2 (sample)',
    note: null,
    fileId: null,
    mediaType: 'application/pdf',
    byteSize: 1_200_000,
    teacherName: 'Teacher A. Rao',
    fromCurrentTeacher: true,
  },
];

/**
 * Board HW5: the student's homework page. "From my teachers" shows files teachers shared with
 * this student only (CR-07 H-2b), by subject, chapter and teacher. Homework itself arrives with H-3.
 */
export default async function StudentHomeworkPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const demo = isDemoMode();
  // The student comes from the session only (FR-002.2).
  const all: SharedResourceView[] = demo ? DEMO : await listResourcesForStudent(db(), access.viewer.id);
  const subjects = [...new Set(all.map((r) => r.subject))] as SubjectId[];
  const { subject } = await searchParams;
  const chosen = subjects.includes(subject as SubjectId) ? (subject as SubjectId) : null;
  const shown = chosen ? all.filter((r) => r.subject === chosen) : all;

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 lg:gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">My homework</h1>
      <p className="m-0 rounded-[16px] bg-surface-container-low px-4 py-3 text-[16px] leading-6">
        Homework from your teachers will show here soon.
      </p>
      <section aria-labelledby="from-teachers" className="flex flex-col gap-3">
        <h2 id="from-teachers" className="m-0 text-headline-sm">
          From my teachers
        </h2>
        {demo ? (
          <p className="m-0 text-sm text-on-surface-variant">Sample card. Real files appear with real accounts.</p>
        ) : null}
        {subjects.length > 1 ? (
          <nav aria-label="Subjects" className="flex flex-wrap gap-2">
            {[null, ...subjects].map((s) => (
              <Link
                key={s ?? 'all'}
                href={s ? `/student/homework?subject=${s}` : '/student/homework'}
                aria-current={chosen === s ? 'page' : undefined}
                className={cx(
                  'inline-flex min-h-12 items-center rounded-full border-2 px-5 font-bold no-underline',
                  chosen === s
                    ? 'border-primary bg-primary text-on-primary hover:text-on-primary'
                    : 'border-outline bg-surface-container-lowest text-on-surface',
                )}
              >
                {s ? SUBJECTS[s].name : 'All'}
              </Link>
            ))}
          </nav>
        ) : null}
        {shown.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {shown.map((r) => (
              <li key={r.id}>
                <SharedResourceCard r={r} child />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[16px] leading-6 text-on-surface-variant">
            Nothing from your teachers yet. When a teacher shares notes or a worksheet with you, it appears here.
          </p>
        )}
      </section>
    </div>
  );
}
