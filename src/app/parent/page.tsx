import type { Metadata } from 'next';
import { clockNow } from '@/lib/clock';
import Link from 'next/link';
import { HomeChapters } from '@/components/lessons/HomeChapters';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { LessonKindChip, LessonStatusChip } from '@/components/lessons/LessonStatus';
import { LessonRules } from '@/components/lessons/LessonRules';
import { LESSON_RULES_TEXT, REAL_LESSON_RULES_TEXT } from '@/lib/lessonRules';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import type { ParentLesson } from '@/fixtures/family';
import { familyResources, notificationSummary, parentLessons } from '@/fixtures/family';
import { cx } from '@/lib/cx';
import { greeting } from '@/lib/localTime';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { isDemoMode } from '@/server/demo';
import { db } from '@/server/db/client';
import { familyChildren } from '@/server/family';
import { openMaterialRequestCount } from '@/server/materialRequests';

export const metadata: Metadata = { title: 'Family home' };

const AVATAR = ['bg-primary-fixed text-on-primary-fixed-variant', 'bg-secondary-fixed text-on-secondary-fixed-variant'];

function lessonDetail(l: ParentLesson) {
  return l.kind === 'human'
    ? `${l.subject} with ${l.teacherName} · ${l.durationMinutes} min`
    : `${l.subject} · ${l.durationMinutes} min`;
}

function longWeekday(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(new Date(iso));
}

function reminderText(l: ParentLesson) {
  // Real accounts (B2, owner 25 Oct 2026): only the real reminder, which is CR-17 PR 7's
  // best-effort in-app one for a confirmed teacher lesson. No email is sent or promised.
  if (!isDemoMode()) return l.kind === 'human' && l.status === 'confirmed' ? 'In AA Pro, 15 min before' : '—';
  // OC-49 (D-22): AI reminders go to the parent by email and to the child on screen.
  if (l.kind === 'ai') return 'Email to you · on screen for your child, 15 min before';
  // OC-45: a teacher's proposal is not booked yet, so it has no reminder.
  return l.status === 'confirmed' ? 'Email, 15 min before' : '—';
}

/** Parent family home: P19 (board 53 desktop, board 54 phone). Synthetic data only. */
export default async function ParentHomePage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  // The parent id comes from the session only; every list holds this parent's own children (FR-002.2).
  const parentId = access.viewer.id;
  const tz = access.viewer.timeZone;
  const now = clockNow();
  const kids = await familyChildren(access.viewer, now);
  // Real accounts: the children's open lesson requests and upcoming lessons (CR-17 PR 2).
  const week = isDemoMode()
    ? parentLessons(parentId, now)
    : kids
        .flatMap((k) => k.lessons.map((l) => ({ ...l, childName: k.name })))
        .filter((l) => Date.parse(l.startIso) < now.getTime() + 7 * 24 * 60 * 60 * 1000)
        .sort((a, b) => a.startIso.localeCompare(b.startIso));
  // TL-2 (owner direction 23:06 IST): teachers' open material requests waiting for this parent.
  const materialsWaiting = isDemoMode() ? 0 : await openMaterialRequestCount(db(), parentId, now);
  // TL-3 (WF-31): teachers' proposals waiting for this parent, counted from the records.
  const proposalsWaiting = isDemoMode()
    ? 0
    : kids.flatMap((k) => k.lessons).filter((l) => l.status === 'proposed').length;
  const resources = familyResources(parentId);
  const notify = notificationSummary(parentId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">
            {greeting(tz, now)}, {access.viewer.displayName}
          </h1>
          <p className="text-sm leading-5 text-on-surface-variant">
            Times are shown in your time zone ({formatZoneName(now.toISOString(), { timeZone: tz })}, {tz}).
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:flex-wrap">
          <LinkButton href="/parent/book-ai">Book an AI lesson</LinkButton>
          <LinkButton href="/parent/book-teacher" variant="secondary">
            Book a teacher
          </LinkButton>
        </div>
      </div>

      {proposalsWaiting ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5" data-testid="proposals-waiting">
          <p className="m-0 text-body-md">
            <strong>
              {proposalsWaiting === 1
                ? 'A teacher proposed a lesson.'
                : `Teachers proposed lessons: ${proposalsWaiting} proposals are waiting.`}
            </strong>{' '}
            Accept or decline before it expires. Nothing is booked until you accept.
          </p>
          <LinkButton href="/parent/calendar">Review proposals</LinkButton>
        </Card>
      ) : null}

      {materialsWaiting ? (
        <Card
          className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"
          data-testid="materials-requested"
        >
          <p className="m-0 text-body-md">
            <strong>
              {materialsWaiting === 1
                ? 'A teacher asked you for material for a lesson.'
                : `Teachers asked you for material for lessons: ${materialsWaiting} requests are waiting.`}
            </strong>{' '}
            Share a book or chapter, or say it isn’t available.
          </p>
          <LinkButton href="/parent/calendar">Review requests</LinkButton>
        </Card>
      ) : null}

      <section aria-labelledby="kids" className="flex flex-col gap-3">
        <h2 id="kids" className="text-[22px] font-bold leading-7">
          Your children
        </h2>
        {kids.length ? (
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 md:gap-6">
            {kids.map((k, i) => {
              const next = k.lessons.slice(0, 2);
              const proposed = k.lessons.find((l) => l.status === 'proposed');
              return (
                <li key={k.id}>
                  <Card
                    as="article"
                    aria-labelledby={`kid-${k.id}`}
                    className="flex h-full flex-col gap-3.5 p-4 sm:p-6"
                  >
                    <div className="flex items-center gap-3.5">
                      <span
                        aria-hidden="true"
                        className={cx(
                          'flex h-14 w-14 flex-none items-center justify-center rounded-full font-headline text-2xl font-extrabold',
                          AVATAR[i % AVATAR.length],
                        )}
                      >
                        {k.initial}
                      </span>
                      <div>
                        <h3 id={`kid-${k.id}`} className="font-headline text-[22px] font-bold leading-7">
                          {k.name}
                        </h3>
                        <span className="text-sm text-on-surface-variant">
                          Grade {k.grade}
                          {k.school ? ` · ${k.school}` : ''}
                        </span>
                      </div>
                    </div>
                    {next.length ? (
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {next.map((l) => (
                          <li
                            key={l.id}
                            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-[22px]"
                          >
                            <LessonKindChip kind={l.kind} long />
                            <strong>
                              {l.dayLabel} {l.timeLabel}
                            </strong>
                            <span>· {lessonDetail(l)}</span>
                            {l.status === 'proposed' || l.status === 'requested' ? (
                              <LessonStatusChip status={l.status} viewer="parent" />
                            ) : null}
                            <HomeChapters chapters={l.chapters} className="w-full text-sm text-on-surface-variant" />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[15px] text-on-surface-variant">No lessons booked this week.</p>
                    )}
                    {proposed ? (
                      <LinkButton href={`/parent/bookings/${proposed.id}`} variant="secondary" className="lg:hidden">
                        Review {proposed.dayLabel === 'Today' ? 'today' : longWeekday(proposed.startIso, tz)}’s lesson
                      </LinkButton>
                    ) : null}
                    <div className="flex flex-wrap gap-2.5">
                      <LinkButton
                        href={`/parent/children/${k.id}`}
                        variant="secondary"
                        aria-label={`${k.name}'s profile`}
                      >
                        Profile
                      </LinkButton>
                      <LinkButton
                        href={`/parent/children/${k.id}/restrictions`}
                        variant="secondary"
                        aria-label={`${k.name}'s restrictions`}
                      >
                        Restrictions
                      </LinkButton>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No children yet"
            action={<LinkButton href="/parent/children/new">Add your first child</LinkButton>}
          >
            Add your first child to set their grade, subjects and sign-in details.
          </EmptyState>
        )}
      </section>

      <Card aria-labelledby="week" className="hidden flex-col gap-2.5 lg:flex">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 id="week" className="text-[22px] font-bold leading-7">
            This week
          </h2>
          <Link href="/parent/calendar" className="font-bold">
            Open family calendar
          </Link>
        </div>
        <table className="w-full border-collapse text-sm">
          <caption className="pb-1.5 text-left text-sm leading-5 text-on-surface-variant">
            AI and teacher lessons are labelled in words, not colour only.
          </caption>
          <thead>
            <tr className="border-b-2 border-card-border text-left text-[13px] text-on-surface-variant">
              <th scope="col" className="px-2.5 py-2 font-bold">
                Lesson
              </th>
              <th scope="col" className="px-2.5 py-2 font-bold">
                Child
              </th>
              <th scope="col" className="px-2.5 py-2 font-bold">
                When
              </th>
              <th scope="col" className="px-2.5 py-2 font-bold">
                Status
              </th>
              <th scope="col" className="px-2.5 py-2 font-bold">
                Reminder
              </th>
              <th scope="col" className="px-2.5 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {week.map((l) => (
              <tr key={l.id} className="border-b border-surface-container align-top">
                <td className="px-2.5 py-3 leading-5">
                  <LessonKindChip kind={l.kind} />
                  <br />
                  <strong>{l.subject}</strong>
                  {l.kind === 'human' ? ` · ${l.teacherName}` : l.chapter ? ` · ${l.chapter}` : ''} ·{' '}
                  {l.durationMinutes} min
                  {l.chapters?.length ? (
                    <>
                      <br />
                      <HomeChapters chapters={l.chapters} className="text-on-surface-variant" />
                    </>
                  ) : null}
                </td>
                <td className="px-2.5 py-3">{l.childName}</td>
                <td className="px-2.5 py-3">
                  {l.dayLabel} {l.timeLabel}
                </td>
                <td className="px-2.5 py-3">
                  <LessonStatusChip status={l.status} viewer="parent" />
                </td>
                <td className="px-2.5 py-3">{reminderText(l)}</td>
                <td className="px-2.5 py-3">
                  <LinkButton
                    href={isDemoMode() || l.status === 'proposed' ? `/parent/bookings/${l.id}` : '/parent/calendar'}
                    variant="secondary"
                    aria-label={`${l.status === 'proposed' ? 'Review' : 'View'} ${l.subject} for ${l.childName}, ${l.dayLabel} ${l.timeLabel}`}
                  >
                    {l.status === 'proposed' ? 'Review' : 'View'}
                  </LinkButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <LessonRules
        items={
          isDemoMode()
            ? [
                LESSON_RULES_TEXT.teacherProposal,
                LESSON_RULES_TEXT.teacherChanges,
                LESSON_RULES_TEXT.aiChanges,
                LESSON_RULES_TEXT.join,
                'Reminders: email to you 15 minutes before each lesson; your child sees AI lesson reminders on screen. Emails are queued, not sent, until an email service is approved.',
              ]
            : // Real accounts (CR-17 PR 2, B2): only what is available now; reminders as PR 7 really works.
              [
                REAL_LESSON_RULES_TEXT.parentTeacherChanges,
                REAL_LESSON_RULES_TEXT.parentAiChanges,
                REAL_LESSON_RULES_TEXT.join,
                REAL_LESSON_RULES_TEXT.reminders,
              ]
        }
      />

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card aria-labelledby="content" className="flex flex-col gap-1.5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 id="content" className="text-[22px] font-bold leading-7">
              Learning content
            </h2>
            <LinkButton href="/parent/content">Upload</LinkButton>
          </div>
          <ul className="m-0 list-none p-0">
            {resources.map((r, i) => (
              <li
                key={r.title}
                className={cx(
                  'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5',
                  i < resources.length - 1 && 'border-b border-surface-container',
                )}
              >
                <span className="flex flex-col gap-1">
                  <strong>{r.title}</strong>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
                    <StatusChip kind={r.source === 'teacher' ? 'human' : 'neutral'}>{r.sourceLabel}</StatusChip>
                    {r.childName} · {r.subject}
                    {r.chapter ? ` · ${r.chapter}` : ''}
                  </span>
                </span>
                <LinkButton href="/parent/content" variant="secondary" aria-label={`Open ${r.title}`}>
                  Open
                </LinkButton>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="notify" className="flex flex-col gap-2.5 p-4 sm:p-6">
          <h2 id="notify" className="text-[22px] font-bold leading-7">
            Reminders and messages
          </h2>
          {notify ? (
            <ul className="m-0 list-none p-0">
              <li className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-container py-3.5">
                <span>
                  <strong>Email</strong>
                  <br />
                  <span className="text-sm text-on-surface-variant">
                    {notify.email.address} · reminders 15 min before teacher lessons
                  </span>
                </span>
                <StatusChip kind={notify.email.on ? 'success' : 'neutral'}>{notify.email.on ? 'On' : 'Off'}</StatusChip>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <span>
                  <strong>WhatsApp</strong>
                  <br />
                  <span className="text-sm text-on-surface-variant">Available when enabled and after your consent</span>
                </span>
                <StatusChip kind="neutral">{notify.whatsapp.enabled ? 'On' : 'Not enabled'}</StatusChip>
              </li>
            </ul>
          ) : null}
          {/* CR-16 Q-5 (OC-117): the button opens the Notifications page; no preferences in CR-16. */}
          <LinkButton href="/parent/notifications" variant="secondary" className="self-start">
            Notifications
          </LinkButton>
        </Card>
      </div>
    </div>
  );
}
