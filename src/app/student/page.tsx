import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { JoinButton } from '@/components/JoinButton';
import { LessonJoinStatus } from '@/components/lessons/LessonJoinStatus';
import { SessionRow } from '@/components/SessionRow';
import { StatusChip } from '@/components/StatusChip';
import { SubjectCard } from '@/components/SubjectCard';
import { TimeDisplay } from '@/components/TimeDisplay';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { brand } from '@/config/brand';
import { getStudentDashboard } from '@/fixtures/student';
import { greeting } from '@/lib/localTime';
import { formatClockTime } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { isDemoMode } from '@/server/demo';
import { AI_RULE_TEXT, describeAllowance } from '@/lib/aiAllowance';
import { clockNow } from '@/lib/clock';
import { getAiAllowance } from '@/server/aiSessions';
import { db } from '@/server/db/client';
import { studentTodayLessons } from '@/server/lessonViews';
import type { Persona } from '@/fixtures/personas';
import type { StudentDashboard } from '@/fixtures/student';

/**
 * A real child's dashboard (WP2-4). Teacher lessons come from bookings (CR-17 PR 2, added below);
 * books arrive with uploads, so the other lists start empty.
 */
function realStudentDashboard(viewer: Persona): StudentDashboard {
  return {
    studentId: viewer.id,
    firstName: viewer.displayName,
    timeZone: viewer.timeZone,
    subjects: (viewer.subjects ?? []).map((id) => ({ id, detail: 'No book assigned yet' })),
    today: [],
    newResources: [],
    lessonsFinishedThisWeek: 0,
  };
}

export const metadata: Metadata = { title: 'Home' };

/** Student dashboard: S1 (desktop, board 5) and S9 (phone, board 6), synthetic data only. */
export default async function StudentHomePage() {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  // The student id comes from the session only (cross-child isolation, FR-002.2).
  const data = isDemoMode() ? getStudentDashboard(access.viewer.id) : realStudentDashboard(access.viewer);
  // CR-17 PR 2: a real child's confirmed teacher lessons today (D3A-23).
  if (data && !isDemoMode()) data.today = await studentTodayLessons(access.viewer.id, data.timeZone, clockNow());
  if (!data) return <AccessDenied viewerRole="student" />;

  const tz = data.timeZone;
  const now = clockNow();
  // OC-89(4): the allowance comes from the server's own record (real accounts only).
  const allowance = isDemoMode() ? null : await getAiAllowance(db(), access.viewer.id, access.viewer.id, now);
  const nextHuman = data.today.find((s) => s.kind === 'human');
  const nextAi = data.today.find((s) => s.kind === 'ai');

  return (
    <div className="flex flex-col gap-6">
      {nextHuman ? (
        <section
          aria-labelledby="next-teacher-lesson"
          className="flex flex-col gap-5 rounded-md bg-primary p-[18px] text-on-primary sm:p-8 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-2">
              <StatusChip kind="human">Human teacher</StatusChip>
              <StatusChip kind="success">Today</StatusChip>
            </div>
            <h1 id="next-teacher-lesson" className="text-headline-lg-mobile text-on-primary lg:text-headline-lg">
              {nextHuman.subject} with {nextHuman.teacherName}
            </h1>
            <p className="text-[17px] text-on-primary-panel">
              Today · <TimeDisplay iso={nextHuman.startIso} timeZone={tz} />–
              <TimeDisplay iso={nextHuman.endIso} timeZone={tz} /> · on Zoom
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 lg:items-start">
            {isDemoMode() ? (
              <JoinButton
                lesson={{ startIso: nextHuman.startIso, endIso: nextHuman.endIso, nowIso: now.toISOString() }}
              />
            ) : (
              <LessonJoinStatus
                startIso={nextHuman.startIso}
                endIso={nextHuman.endIso}
                nowIso={now.toISOString()}
                timeZone={tz}
                lessonId={nextHuman.lessonId}
                ready={nextHuman.joinReady}
              />
            )}
          </div>
        </section>
      ) : (
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">
          {greeting(tz)}, {data.firstName}!
        </h1>
      )}

      {nextHuman ? (
        <p className="font-headline text-headline-lg-mobile font-bold lg:hidden">
          {greeting(tz)}, {data.firstName}!
        </p>
      ) : null}

      <Link
        href="/student/book"
        className="flex min-h-16 items-center justify-between rounded-[20px] border border-secondary-fixed-dim bg-secondary-fixed px-[18px] text-[17px] font-extrabold text-on-secondary-fixed-variant no-underline hover:text-on-secondary-fixed-variant lg:hidden"
      >
        Book an AI class <span aria-hidden="true">›</span>
      </Link>

      <p
        aria-label="AI Tutor allowance"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[16px] bg-surface-container-low px-4 py-2.5 text-[15px] leading-[22px]"
      >
        <strong>AI Tutor:</strong> {AI_RULE_TEXT}
        {allowance ? <span className="font-bold text-primary">{describeAllowance(allowance, tz, now)}</span> : null}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <Card aria-labelledby="my-subjects" className="order-2 flex flex-col gap-4 lg:order-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="my-subjects" className="text-headline-md">
                My subjects
              </h2>
              <span className="hidden lg:block">
                <LinkButton href="/student/book">Book an AI class</LinkButton>
              </span>
            </div>
            {data.subjects.length ? (
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:gap-4">
                {data.subjects.map((s) => (
                  <li key={s.id}>
                    <SubjectCard subject={s.id} detail={s.detail} href="/student/library" />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No subjects yet">Your parent chooses your subjects.</EmptyState>
            )}
          </Card>

          <Card aria-labelledby="new-in-library" className="order-4 flex flex-col gap-1 lg:order-none">
            <div className="flex items-center justify-between gap-3">
              <h2 id="new-in-library" className="text-[22px] font-bold leading-7">
                New in my library
              </h2>
              <Link href="/student/library" className="font-bold">
                Open library
              </Link>
            </div>
            {data.newResources.length ? (
              <ul className="m-0 list-none p-0">
                {data.newResources.map((r, i) => (
                  <li
                    key={r.title}
                    className={`flex flex-wrap items-center justify-between gap-3 py-3.5 ${i < data.newResources.length - 1 ? 'border-b border-surface-container' : ''}`}
                  >
                    <span>
                      <strong>{r.title}</strong>
                      <br />
                      <span className="text-[15px] text-on-surface-variant">{r.source}</span>
                    </span>
                    <LinkButton href="/student/library" variant="secondary" aria-label={`Read ${r.title}`}>
                      Read
                    </LinkButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3.5 text-on-surface-variant">
                Nothing new yet. Books and worksheets from your parent and teachers will appear here.
              </p>
            )}
          </Card>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <Card aria-labelledby="ai-tutor" className="order-1 flex flex-col gap-3.5 lg:order-none">
            <div className="flex items-center gap-2.5">
              <StatusChip kind="ai">{brand.tutorNameShort}</StatusChip>
              <h2 id="ai-tutor" className="text-headline-sm">
                {brand.tutorNameFull}
              </h2>
            </div>
            <p className="rounded-[20px] bg-surface-container-low px-4 py-3.5 text-body-md">
              {nextAi
                ? `Your next AI lesson is ${nextAi.subject} at ${formatClockTime(nextAi.startIso, { timeZone: tz })}. Ready to practise ${nextAi.topic ?? 'together'}?`
                : 'You have no AI lesson booked today.'}
            </p>
            <p className="text-[15px] text-on-surface-variant">The AI Tutor opens from a booked lesson.</p>
          </Card>

          <Card aria-labelledby="today" className="order-3 flex flex-col lg:order-none">
            <h2 id="today" className="mb-1.5 text-headline-sm">
              Today
            </h2>
            {data.today.length ? (
              <ul className="m-0 list-none p-0">
                {data.today.map((s, i) => (
                  <SessionRow
                    key={s.startIso}
                    kind={s.kind}
                    subject={s.subject}
                    startIso={s.startIso}
                    durationMinutes={s.durationMinutes}
                    timeZone={tz}
                    last={i === data.today.length - 1}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Nothing today"
                action={<LinkButton href="/student/book">Book an AI lesson</LinkButton>}
              >
                You have no lessons today.
              </EmptyState>
            )}
          </Card>

          <Card aria-labelledby="this-week" className="order-5 flex flex-col gap-1.5 lg:order-none">
            <h2 id="this-week" className="text-headline-sm">
              This week
            </h2>
            <p className="text-body-md">
              {data.lessonsFinishedThisWeek} {data.lessonsFinishedThisWeek === 1 ? 'lesson' : 'lessons'} finished
            </p>
            <Link href="/student/history" className="font-bold">
              See what I learned
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
