import type { Metadata } from 'next';
import { JoinButton } from '@/components/JoinButton';
import { Icon } from '@/components/icons/Icon';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { SUBJECT_ICONS } from '@/config/subjectIcons';
import { SUBJECTS } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { formatClock, formatLessonTime } from '@/lib/lessonDisplay';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { lessonsForStudent } from '@/server/lessons';

export const metadata: Metadata = { title: 'My schedule' };
export const dynamic = 'force-dynamic';

/**
 * The child's own confirmed lessons with human teachers (CR-17 PR 2, D3A-23): teacher, subject,
 * day and time, in the child's time zone. No requests, prices or buttons to book or cancel:
 * parents book (OC-06). Demo mode keeps its placeholder.
 */
export default async function StudentSchedulePage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="My schedule"
        body="Your schedule will appear here soon."
        homeHref="/student"
        homeLabel="Go to my home"
        child
      />
    );
  }
  const tz = access.viewer.timeZone;
  const now = clockNow();
  const lessons = await lessonsForStudent(db(), access.viewer.id, now);
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">My schedule</h1>
        <p className="m-0 text-[17px] leading-6 text-on-surface-variant">Your lessons with your teachers.</p>
      </div>
      {lessons.length ? (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {lessons.map((l) => (
            <li key={l.id}>
              <article
                aria-labelledby={`lesson-${l.id}`}
                className="flex flex-col gap-4 rounded-[24px] border border-card-border bg-surface-container-lowest p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cx(
                      'flex h-14 w-14 shrink-0 items-center justify-center rounded-md',
                      SUBJECTS[l.subject].tile,
                    )}
                  >
                    <Icon name={SUBJECT_ICONS[l.subject]} size={28} />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h2 id={`lesson-${l.id}`} className="m-0 text-[20px] font-bold leading-7">
                      {SUBJECTS[l.subject].name} with {l.teacherName}
                    </h2>
                    <p className="m-0 text-[17px] leading-6">
                      {formatLessonTime(l.startsAt, tz)}–{formatClock(l.endsAt, tz)} · {l.minutes} min
                    </p>
                  </div>
                </div>
                <JoinButton
                  lesson={{
                    startIso: l.startsAt.toISOString(),
                    endIso: l.endsAt.toISOString(),
                    nowIso: now.toISOString(),
                  }}
                />
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No lessons yet">
          When your parent books a lesson with a teacher and the teacher says yes, it appears here.
        </EmptyState>
      )}
    </div>
  );
}
