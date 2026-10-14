import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { JoinButton } from '@/components/JoinButton';
import { LessonStatusChip } from '@/components/lessons/LessonStatus';
import { PendingNote } from '@/components/PendingNote';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { getTeacherDashboard, TEACHER_SLOT_MINUTES } from '@/fixtures/teacher';
import { cx } from '@/lib/cx';
import { greeting } from '@/lib/localTime';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Dashboard' };

function availabilityText(d: { booked: number; waiting: number; open: number }) {
  const parts = [];
  if (d.booked) parts.push(`${d.booked} booked`);
  if (d.waiting) parts.push(`${d.waiting} waiting`);
  parts.push(`${d.open} open`);
  return parts.join(' · ');
}

/** Teacher dashboard: P21 (board 55 desktop, board 56 phone). Synthetic data only. */
export default async function TeacherHomePage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  // The teacher id comes from the session only: own lessons and linked students (FR-002.2).
  const now = new Date();
  const data = getTeacherDashboard(access.viewer.id, now);
  if (!data) return <AccessDenied viewerRole="teacher" />;
  const tz = data.timeZone;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">
            {greeting(tz, now)}, {data.name}
          </h1>
          <p className="text-sm leading-5 text-on-surface-variant">
            {data.subjects} · {data.grades} · times are shown in your time zone (
            {formatZoneName(now.toISOString(), { timeZone: tz })}, {tz}).
          </p>
        </div>
        <LinkButton href="/teacher/propose">Propose a meeting</LinkButton>
      </div>

      <Card aria-labelledby="lessons" className="flex flex-col gap-1 p-4 sm:p-6">
        <h2 id="lessons" className="mb-1.5 text-[22px] font-bold leading-7">
          Upcoming lessons
        </h2>
        {data.lessons.length ? (
          <ul className="m-0 list-none p-0">
            {data.lessons.map((l, i) => (
              <li
                key={l.id}
                className={cx(
                  'flex flex-col gap-3 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
                  i < data.lessons.length - 1 && 'border-b border-surface-container',
                )}
              >
                <article aria-labelledby={`lesson-${l.id}`} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-2">
                    <StatusChip kind="human">Teacher lesson</StatusChip>
                    <LessonStatusChip status={l.status} viewer="teacher" />
                  </div>
                  <h3 id={`lesson-${l.id}`} className="font-headline text-[20px] font-bold leading-7">
                    {l.subject} · {l.studentName} (Grade {l.studentGrade})
                  </h3>
                  <p className="text-[15px]">
                    {l.dayLabel} {l.timeLabel}–{l.endLabel} · {l.durationMinutes} min ·{' '}
                    {l.status === 'confirmed' ? 'on Zoom' : 'Zoom meeting not created yet'}
                  </p>
                  {l.status === 'confirmed' ? (
                    <p className="text-sm text-on-surface-variant">
                      Reminder: email to you and the parent, 15 min before
                    </p>
                  ) : null}
                </article>
                <div className="flex flex-col items-stretch gap-2 sm:items-start">
                  {l.status === 'confirmed' ? <JoinButton label="Start opens before the lesson" size="md" /> : null}
                  <Link href="/teacher/schedule" className="font-bold">
                    View details
                    <span className="sr-only">
                      : {l.subject} with {l.studentName}
                    </span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No lessons coming up">When families book you, the lessons appear here.</EmptyState>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <PendingNote decision="D-35">When Start and Join open.</PendingNote>
          <PendingNote decision="D-08">Whether the parent must confirm a lesson you propose.</PendingNote>
          <PendingNote decision="D-07">Whether teachers may cancel.</PendingNote>
          <PendingNote decision="D-15">Group sessions. Only 1:1 lessons are shown.</PendingNote>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card aria-labelledby="availability" className="flex flex-col gap-2.5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 id="availability" className="text-[22px] font-bold leading-7">
              My availability this week
            </h2>
            <LinkButton href="/teacher/availability" variant="secondary">
              Edit availability
            </LinkButton>
          </div>
          <ul className="m-0 list-none p-0">
            {data.availability.map((d, i) => (
              <li
                key={`${d.dayLabel}-${d.from}`}
                className={cx(
                  'flex flex-wrap items-center justify-between gap-3 py-3.5',
                  i < data.availability.length - 1 && 'border-b border-surface-container',
                )}
              >
                <span>
                  <strong>{d.dayLabel}</strong> {d.from}–{d.to}
                </span>
                <StatusChip kind={d.booked || d.waiting ? 'warning' : 'success'}>{availabilityText(d)}</StatusChip>
              </li>
            ))}
          </ul>
          <p className="text-sm text-on-surface-variant">
            Slots are {TEACHER_SLOT_MINUTES} minutes. Families see these times in their own time zone.
          </p>
        </Card>

        <Card aria-labelledby="students" className="flex flex-col gap-1.5 p-4 sm:p-6">
          <h2 id="students" className="text-[22px] font-bold leading-7">
            My students
          </h2>
          <ul className="m-0 list-none p-0">
            {data.students.map((s, i) => (
              <li
                key={s.id}
                className={cx(
                  'flex flex-wrap items-center justify-between gap-3 py-3.5',
                  i < data.students.length - 1 && 'border-b border-surface-container',
                )}
              >
                <span>
                  <strong>{s.name}</strong>
                  <br />
                  <span className="text-sm text-on-surface-variant">
                    Grade {s.grade} · {s.subject} · {s.completed} {s.completed === 1 ? 'lesson' : 'lessons'} completed
                  </span>
                </span>
                <LinkButton href={`/teacher/students/${s.id}`} variant="secondary" aria-label={`View ${s.name}`}>
                  View
                </LinkButton>
              </li>
            ))}
          </ul>
          <PendingNote decision="D-09">
            How teachers are linked to students. Only students linked to you appear.
          </PendingNote>
        </Card>
      </div>

      <Card aria-labelledby="shared" className="flex flex-col gap-1.5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 id="shared" className="text-[22px] font-bold leading-7">
            Recently shared
          </h2>
          <LinkButton href="/teacher/resources" variant="secondary">
            Share a resource
          </LinkButton>
        </div>
        {data.shared.length ? (
          <ul className="m-0 list-none p-0">
            {data.shared.map((r) => (
              <li key={r.title} className="py-3.5">
                <strong>{r.title}</strong>
                <br />
                <span className="text-sm text-on-surface-variant">
                  Shared with {r.studentName} · {r.subject}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-on-surface-variant">Nothing shared yet.</p>
        )}
        <PendingNote decision="D-16">
          Who sees teacher-shared resources, and whether parents approve sharing.
        </PendingNote>
      </Card>
    </div>
  );
}
