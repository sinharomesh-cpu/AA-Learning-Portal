import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LinkButton } from '@/components/Button';
import { Icon, type SymbolName } from '@/components/icons/Icon';
import { JoinButton } from '@/components/JoinButton';
import { LessonStatusChip } from '@/components/lessons/LessonStatus';
import { LessonRules } from '@/components/lessons/LessonRules';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { SUBJECT_ICONS } from '@/config/subjectIcons';
import { SUBJECTS } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { describeGrades } from '@/lib/grades';
import { greeting } from '@/lib/localTime';
import { LESSON_RULES_TEXT, REAL_LESSON_RULES_TEXT } from '@/lib/lessonRules';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { getTeacherHome, type TeacherHome } from '@/server/teacherHome';
import { RateNegotiationPanel } from './RateNegotiationPanel';
import { StudentRoster } from './StudentRoster';
import { VerificationPanel } from './VerificationPanel';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/** The large rounded panel of the S21 reference (3rem corners from 640 px up). */
const PANEL =
  'rounded-lg border border-card-border bg-surface-container-lowest shadow-[0_4px_12px_-2px_rgba(19,27,46,0.05),0_2px_6px_-1px_rgba(19,27,46,0.03)] sm:rounded-xl';

function SectionHeading({
  id,
  eyebrow,
  eyebrowClass = 'text-primary',
  children,
}: {
  id: string;
  eyebrow: string;
  eyebrowClass?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className={cx('text-label-sm uppercase tracking-wider', eyebrowClass)}>{eyebrow}</span>
      <h2 id={id} className="font-headline text-headline-sm font-bold sm:text-headline-md">
        {children}
      </h2>
    </div>
  );
}

function Masthead({ home, now }: { home: TeacherHome; now: Date }) {
  const zone = `${formatZoneName(now.toISOString(), { timeZone: home.timeZone })}, ${home.timeZone}`;
  const claims = [
    home.experienceYears !== null
      ? `${home.experienceYears} ${home.experienceYears === 1 ? 'year' : 'years'} teaching`
      : null,
    home.curricula.length ? home.curricula.join(', ') : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="teacher-name" className={cx(PANEL, 'relative overflow-hidden')}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-primary-fixed/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-40 h-56 w-56 rounded-full bg-tertiary-fixed/25 blur-2xl"
      />
      <div className="relative flex flex-col justify-between gap-6 p-5 sm:p-8 lg:flex-row lg:items-center">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            {home.photoId ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, uncached photo route
              <img
                src={`/teacher-photo/${home.photoId}`}
                alt=""
                width={112}
                height={112}
                className="h-24 w-24 rounded-lg object-cover shadow-md sm:h-28 sm:w-28"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-24 w-24 items-center justify-center rounded-lg bg-primary-fixed font-headline text-[44px] font-bold text-on-primary-fixed-variant shadow-md sm:h-28 sm:w-28"
              >
                {home.initial}
              </span>
            )}
            <span className="absolute -bottom-2 -right-2 flex items-center gap-1 rounded-full bg-tertiary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-tertiary shadow-sm">
              <Icon name="verified_fill" size={14} />
              Approved
            </span>
          </div>
          <div className="flex max-w-xl flex-col gap-1.5">
            <p className="text-label-md text-on-surface-variant">{greeting(home.timeZone, now)}</p>
            <h1 id="teacher-name" className="font-headline text-headline-md sm:text-headline-lg">
              {home.name}
            </h1>
            <p className="text-body-md text-on-surface-variant">
              {claims.length ? `${claims.join(' · ')} · ` : ''}Times are shown in your time zone ({zone}).
            </p>
            <ul aria-label="What you teach" className="m-0 flex list-none flex-wrap items-center gap-2 p-0 pt-1">
              {home.subjectIds.map((s) => (
                <li
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-label-sm text-on-surface"
                >
                  <Icon name={SUBJECT_ICONS[s]} size={16} className="text-primary" />
                  {SUBJECTS[s].name}
                </li>
              ))}
              {home.grades.length ? (
                <li className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-label-sm text-on-surface-variant">
                  <Icon name="school" size={16} />
                  {describeGrades(home.grades)}
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        <div className="flex min-w-[260px] flex-col gap-3 rounded-lg bg-surface-container-low p-5">
          <h2 className="text-label-sm uppercase tracking-wider text-on-surface-variant">This week</h2>
          <dl className="m-0 flex flex-col gap-2">
            {home.summary.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 rounded-md bg-surface-container-lowest px-3 py-2"
              >
                <dt className="text-body-sm text-on-surface-variant">{row.label}</dt>
                <dd className="m-0 text-right text-label-md text-on-surface">
                  {row.href ? (
                    <Link href={row.href} aria-label={`${row.label}: ${row.value}`} className="font-bold">
                      {row.value}
                    </Link>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="relative flex flex-col justify-between gap-2 bg-surface-container-high/60 px-5 py-3 sm:px-8 md:flex-row md:items-center">
        <p className="flex items-center gap-2 text-label-sm text-on-surface-variant">
          <Icon name="security" size={18} className="text-primary" />
          Private to you: you see only your own lessons and the students linked to you.
        </p>
        {home.mode === 'demo' ? (
          <p className="flex items-center gap-1.5 self-start text-label-sm text-secondary md:self-auto">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-secondary-container" />
            Demo: sample data only
          </p>
        ) : null}
      </div>
    </section>
  );
}

const BAR = {
  confirmed: 'bg-primary',
  booked: 'bg-primary',
  proposed: 'bg-secondary-container',
  requested: 'bg-secondary-container',
} as const;

function Sessions({ home, now }: { home: TeacherHome; now: Date }) {
  const nowIso = now.toISOString();
  const today = home.lessons.filter((l) => l.dayLabel === 'Today').length;
  return (
    <section aria-labelledby="sessions" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading id="sessions" eyebrow="Upcoming lessons">
          Scheduled teaching sessions
        </SectionHeading>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-container px-2.5 py-1 text-label-sm text-on-surface-variant">
            Today: {today} {today === 1 ? 'lesson' : 'lessons'}
          </span>
          {home.mode === 'demo' ? (
            // B1: hidden for real accounts until teacher proposals (OC-45) are built.
            <LinkButton href="/teacher/propose" variant="secondary">
              <Icon name="add" size={18} />
              Propose a meeting
            </LinkButton>
          ) : null}
        </div>
      </div>
      {home.mode === 'real' && home.lessonRequests ? (
        <div
          className={cx(PANEL, 'flex flex-wrap items-center justify-between gap-3 p-5')}
          data-testid="lesson-requests-waiting"
        >
          <p className="m-0 text-body-md">
            <strong>
              {home.lessonRequests} lesson {home.lessonRequests === 1 ? 'request is' : 'requests are'} waiting for your
              answer.
            </strong>{' '}
            Each one expires if it isn’t answered in time.
          </p>
          <LinkButton href="/teacher/schedule">Review requests</LinkButton>
        </div>
      ) : null}
      {home.lessons.length ? (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {home.lessons.map((l) => (
            <li key={l.id} className={cx(PANEL, 'relative overflow-hidden transition-shadow hover:shadow-md')}>
              <span aria-hidden="true" className={cx('absolute bottom-0 left-0 top-0 w-2', BAR[l.status])} />
              <article
                aria-labelledby={`lesson-${l.id}`}
                className="flex flex-col justify-between gap-4 py-5 pl-6 pr-5 sm:pr-6 md:flex-row md:items-center"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cx(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-md',
                      SUBJECTS[l.subjectId].tile,
                    )}
                  >
                    <Icon name={SUBJECT_ICONS[l.subjectId]} size={26} />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id={`lesson-${l.id}`} className="font-headline text-headline-sm">
                        {l.subject} with {l.studentName}
                      </h3>
                      <span className="rounded-full bg-surface-container px-2 py-0.5 text-label-sm text-primary">
                        {l.subject} · Grade {l.studentGrade}
                      </span>
                    </div>
                    <p className="text-body-md text-on-surface-variant">
                      1-on-1 teacher lesson · {l.durationMinutes} min
                      {home.mode === 'real'
                        ? ''
                        : ` · ${l.status === 'confirmed' ? 'on Zoom' : 'no Zoom meeting until the parent accepts'}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-label-sm text-on-surface-variant">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="schedule" size={16} className="text-primary" />
                        {l.dayLabel} {l.timeLabel}–{l.endLabel}
                      </span>
                      <LessonStatusChip status={l.status} viewer="teacher" />
                      {l.status === 'confirmed' && home.mode === 'demo' ? (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="notifications" size={16} />
                          Email reminder to you and the parent, 15 min before
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row md:flex-col md:items-end">
                  {l.status === 'confirmed' ? (
                    <JoinButton who="teacher" size="md" lesson={{ startIso: l.startIso, endIso: l.endIso, nowIso }} />
                  ) : null}
                  <Link
                    href="/teacher/schedule"
                    className="inline-flex min-h-12 items-center justify-center gap-1 text-label-md md:min-h-0 md:py-1"
                  >
                    <Icon name={l.status === 'confirmed' ? 'description' : 'edit_calendar'} size={18} />
                    View details
                    <span className="sr-only">
                      : {l.subject} with {l.studentName}
                    </span>
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <div className={cx(PANEL, 'flex flex-col items-start gap-2 p-6')}>
          <Icon name="event_available" size={32} className="text-primary" />
          <h3 className="font-headline text-headline-sm">No lessons coming up</h3>
          <p className="text-body-md text-on-surface-variant">
            {home.mode === 'real'
              ? 'No confirmed lessons yet. When a linked family requests a lesson, it appears in My schedule for you to accept or decline.'
              : 'When families book you, the lessons appear here.'}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <LessonRules
          items={
            home.mode === 'demo'
              ? [
                  LESSON_RULES_TEXT.join.replace('Join', 'Start'),
                  'A lesson you propose is only booked when the parent accepts it. No Zoom meeting until then.',
                  'You or the parent can cancel or move a lesson up to 30 minutes before the start. Your move needs the parent’s OK, and the parent is told if you cancel.',
                  LESSON_RULES_TEXT.oneToOne,
                ]
              : // Real accounts (CR-17 PR 2, B1): nothing about proposing or moving, which aren't available.
                [
                  REAL_LESSON_RULES_TEXT.teacherJoin,
                  REAL_LESSON_RULES_TEXT.teacherChanges,
                  REAL_LESSON_RULES_TEXT.oneToOne,
                  REAL_LESSON_RULES_TEXT.reminders,
                ]
          }
        />
      </div>
    </section>
  );
}

const PILL = {
  open: 'bg-surface-container-high text-primary',
  full: 'bg-surface-container text-on-surface-variant',
  none: 'text-on-surface-variant',
} as const;
const DOT = { open: 'bg-primary', full: 'bg-secondary', none: 'bg-transparent' } as const;
const ROW_DOT = {
  success: 'bg-tertiary',
  warning: 'bg-secondary',
  neutral: 'bg-outline',
  human: 'bg-primary',
} as const;

function Availability({ home, now }: { home: TeacherHome; now: Date }) {
  return (
    <section aria-labelledby="availability" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <SectionHeading id="availability" eyebrow="This week" eyebrowClass="text-tertiary">
          Availability
        </SectionHeading>
        <Link
          href="/teacher/availability"
          className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded-full bg-tertiary px-3 text-label-sm text-on-tertiary no-underline shadow-sm hover:bg-tertiary-container hover:text-on-tertiary"
        >
          <Icon name="add" size={16} />
          {home.mode === 'real' ? 'Edit times' : 'Edit availability'}
        </Link>
      </div>
      <div className={cx(PANEL, 'flex flex-col gap-4 p-5')}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-label-md text-on-surface">
            <Icon name="calendar_view_week" className="text-primary" />
            Next 7 days
          </span>
          <span className="text-label-sm text-on-surface-variant">
            {formatZoneName(now.toISOString(), { timeZone: home.timeZone })}
          </span>
        </div>
        <ol aria-label="Next 7 days" className="m-0 grid list-none grid-cols-7 gap-1 p-0 text-center">
          {home.week.map((d) => (
            <li
              key={`${d.short}-${d.date}`}
              className={cx(
                'flex flex-col items-center rounded-lg px-0.5 py-1.5',
                PILL[d.state],
                d.isToday && 'ring-2 ring-primary',
              )}
            >
              <span className="sr-only">{d.summary}</span>
              <span aria-hidden="true" className="text-[10px] font-bold uppercase">
                {d.short}
              </span>
              <span
                aria-hidden="true"
                className="mt-1 font-headline text-[18px] font-bold leading-none sm:text-headline-sm"
              >
                {d.date}
              </span>
              <span aria-hidden="true" className={cx('mt-1 h-1.5 w-1.5 rounded-full', DOT[d.state])} />
            </li>
          ))}
        </ol>
        {home.weekRows.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {home.weekRows.map((r) => (
              <li
                key={`${r.dayOffset}-${r.from}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2.5"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={cx('h-2 w-2 shrink-0 rounded-full', ROW_DOT[r.chip.kind])} />
                  <span className="flex flex-col">
                    <span className="whitespace-nowrap text-label-md text-on-surface">
                      {r.dayLabel} · {r.from}–{r.to}
                    </span>
                    <span className="text-[13px] leading-[18px] text-on-surface-variant">{r.detail}</span>
                  </span>
                </span>
                <StatusChip kind={r.chip.kind}>{r.chip.text}</StatusChip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-on-surface-variant">
            No usual times yet. Add the times you are usually free so families can see them on your listing.
          </p>
        )}
        {home.weekRows.length ? <p className="text-body-sm text-on-surface-variant">{home.weekNote}</p> : null}
      </div>
    </section>
  );
}

const FILE_ICON: SymbolName = 'description';

function Resources({ home }: { home: TeacherHome }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section aria-labelledby="share" className={cx(PANEL, 'flex flex-col gap-4 p-5 sm:p-8 lg:col-span-2')}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionHeading id="share" eyebrow="Learning resources">
            Share learning resources
          </SectionHeading>
          <Link href="/teacher/resources" className="text-label-md font-bold">
            All learning resources
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low/50 p-6 text-center sm:p-8">
          <span
            aria-hidden="true"
            className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed text-primary"
          >
            <Icon name="cloud_upload" size={32} />
          </span>
          <h3 className="font-headline text-headline-sm">Revision sheets, notes and slides</h3>
          <p className="mt-1 max-w-md text-body-md text-on-surface-variant">
            PDF, JPG, PNG, WebP or HEIC, up to 20 MB. Your linked students see it straight away; their parents can see
            it too. Only students linked to you, in the subjects their parent ticked.
          </p>
          <LinkButton href="/teacher/resources" className="mt-3">
            <Icon name="upload_file" size={18} />
            Choose a file
          </LinkButton>
        </div>
      </section>
      <section aria-labelledby="shared" className={cx(PANEL, 'flex flex-col gap-4 p-5')}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="shared" className="font-headline text-headline-sm">
            Recently shared
          </h2>
          <span className="text-label-sm text-primary">
            {home.shared.length} {home.shared.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        {home.shared.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {home.shared.map((r) => (
              <li key={r.title} className="flex items-center gap-2 rounded-lg bg-surface-container-low p-2.5">
                <Icon name={FILE_ICON} size={24} className="text-primary" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-label-md text-on-surface">{r.title}</span>
                  <span className="text-[12px] leading-4 text-on-surface-variant">
                    Shared with {r.studentName} · {r.subject}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-on-surface-variant">Nothing shared yet.</p>
        )}
      </section>
    </div>
  );
}

/** Teacher dashboard: S21 reference (boards 55, 56). Sample data in demo mode; real accounts show their own. */
export default async function TeacherHomePage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const now = clockNow();
  const home = await getTeacherHome(access.viewer, now);
  if (!home) return <AccessDenied viewerRole="teacher" />;
  const day = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone: home.timeZone,
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(d)
      : null;
  const vf = home.verification;

  return (
    <div className="flex flex-col gap-8">
      <Masthead home={home} now={now} />
      {home.linkRequests > 0 ? (
        <section
          aria-labelledby="link-requests"
          className="flex flex-col gap-3 rounded-lg border border-human-border bg-primary-fixed/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="link-requests" className="font-headline text-headline-sm font-bold">
              Requests from parents
            </h2>
            <p className="text-body-md text-on-surface-variant">
              {home.linkRequests === 1
                ? '1 request is waiting for your answer.'
                : `${home.linkRequests} requests are waiting for your answer.`}{' '}
              You answer for each child.
            </p>
          </div>
          <LinkButton href="/teacher/students">Answer requests</LinkButton>
        </section>
      ) : null}
      {home.packageNeedsDetails ? (
        <section
          aria-labelledby="package-details"
          className="flex flex-col gap-3 rounded-lg border border-human-border bg-primary-fixed/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="package-details" className="font-headline text-headline-sm font-bold">
              Finish your learning package
            </h2>
            <p className="text-body-md text-on-surface-variant">
              Your monthly price became a learning package. Add how many classes a week, the weeks to complete it and
              the class times. Parents can&apos;t see it until you do.
            </p>
          </div>
          <LinkButton href="/teacher/listing">Finish package</LinkButton>
        </section>
      ) : null}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <Sessions home={home} now={now} />
        <Availability home={home} now={now} />
      </div>
      {vf ? (
        <VerificationPanel
          state={vf.state}
          requestedOn={day(vf.requestedAt)}
          verifiedOn={day(vf.decidedAt)}
          expiresOn={day(vf.expiresAt)}
          canRequest={vf.canRequest}
          blocked={vf.blocked}
        />
      ) : null}
      {home.rates ? (
        <RateNegotiationPanel on={home.rates.on} openPrices={home.rates.openPrices} waiting={home.rates.waiting} />
      ) : null}
      <StudentRoster students={home.students} realAccount={home.mode === 'real'} />
      <Resources home={home} />
    </div>
  );
}
