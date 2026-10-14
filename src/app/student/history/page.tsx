import type { Metadata } from 'next';
import { LinkButton } from '@/components/Button';
import { PendingNote } from '@/components/PendingNote';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { brand } from '@/config/brand';
import { getStudentHistory } from '@/fixtures/history';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: "Things I've learned" };

/** M-16 student learning history (boards 26 and 27). Own sessions only; no XP or badges (OC-12). */
export default async function StudentHistoryPage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  // The student id comes from the session only (FR-002.2).
  const items = getStudentHistory(access.viewer.id) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 lg:gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Things I&apos;ve learned</h1>
        <p className="text-[15px] leading-[22px] text-on-surface-variant">Your past lessons, newest first.</p>
      </div>
      <PendingNote decision="D-24">How lesson summaries are made, and how long they are kept.</PendingNote>
      {items.length ? (
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {items.map((it) => {
            const s = SUBJECTS[it.subject];
            return (
              <li key={it.id}>
                <article
                  aria-labelledby={`h-${it.id}`}
                  className="flex items-start gap-4 rounded-md border border-card-border bg-white p-4 shadow-[0_4px_12px_-2px_rgba(19,27,46,0.05)] sm:gap-[18px] sm:p-6"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'hidden h-[52px] w-[52px] flex-none items-center justify-center rounded-[16px] font-headline text-[17px] font-extrabold sm:flex',
                      s.tile,
                    )}
                  >
                    {s.abbr}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip kind={it.kind === 'ai' ? 'ai' : 'human'}>
                        {it.kind === 'ai' ? brand.tutorNameShort : 'Teacher'}
                      </StatusChip>
                      <span className="text-sm text-on-surface-variant">
                        {it.whenLabel} · {it.minutes} min
                      </span>
                    </div>
                    <h2
                      id={`h-${it.id}`}
                      className="font-headline text-[20px] font-bold leading-7 sm:text-[22px] sm:leading-[30px]"
                    >
                      {it.title}
                    </h2>
                    <p className="text-base leading-6">{it.text}</p>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState title="No lessons yet" action={<LinkButton href="/student/book">Book an AI lesson</LinkButton>}>
          When you finish a lesson, it will show up here.
        </EmptyState>
      )}
    </div>
  );
}
