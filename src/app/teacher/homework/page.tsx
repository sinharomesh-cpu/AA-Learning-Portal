import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, LinkButton } from '@/components/Button';
import { AccessDenied } from '@/components/states/AccessDenied';
import { SelectField } from '@/components/ui/SelectField';
import { INPUT, SHELL } from '@/components/ui/styles';
import { DEMO_WORKSHEETS } from '@/fixtures/worksheets';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { type LibraryCard, type LibraryFilters, type LibraryStatus, listWorksheets } from '@/server/worksheets';
import { ArchiveWorksheetButton, DuplicateButton } from './LibraryForms';

export const metadata: Metadata = { title: 'Homework' };
export const dynamic = 'force-dynamic';

const STATUSES: Array<[LibraryStatus, string]> = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['ready', 'Ready'],
  ['archived', 'Archived'],
];
const DIFFICULTY: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const fmtDate = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(d);

const CHIP = 'inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold leading-4 whitespace-nowrap';
const NEUTRAL = 'border-outline-variant bg-surface-container text-on-surface-variant';

function StatusChip({ card }: { card: LibraryCard }) {
  if (card.archived) return <span className={cx(CHIP, NEUTRAL)}>Archived</span>;
  return card.status === 'ready' ? (
    <span className={cx(CHIP, 'border-success-border bg-success-container text-on-success-container')}>Ready</span>
  ) : (
    <span className={cx(CHIP, 'border-warning-border bg-warning-container text-on-warning-container')}>Draft</span>
  );
}

function Card({ card, timeZone, demo }: { card: LibraryCard; timeZone: string; demo: boolean }) {
  const headingId = `ws-${card.id}`;
  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="flex h-full flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-lowest p-5"
        data-testid="worksheet-card"
      >
        <div className="flex items-center justify-between gap-2">
          <StatusChip card={card} />
          <span className="text-sm leading-5 text-on-surface-variant">
            {card.archived && card.archivedAt
              ? `Archived ${fmtDate(card.archivedAt, timeZone)}`
              : `Edited ${fmtDate(card.updatedAt, timeZone)}`}
          </span>
        </div>
        <h3 id={headingId} className="m-0 break-words text-[19px] font-bold leading-[26px]">
          {card.title}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <span className={cx(CHIP, SUBJECTS[card.subject].tile, 'border-transparent')}>
            {SUBJECTS[card.subject].name}
          </span>
          <span className={cx(CHIP, NEUTRAL)}>Grade {card.grade}</span>
          <span className={cx(CHIP, NEUTRAL)}>{card.board}</span>
          {card.difficulty ? <span className={cx(CHIP, NEUTRAL)}>{DIFFICULTY[card.difficulty]}</span> : null}
        </div>
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          {card.chapter ?? 'No chapter'}
          {card.topic ? ` · Topic: ${card.topic}` : ''}
          <br />
          {card.kind === 'handwritten'
            ? 'Handwritten'
            : `Exercise · ${card.questions} ${card.questions === 1 ? 'question' : 'questions'} · ${card.marks} marks`}
        </p>
        {card.emptyQuestions > 0 ? (
          <p className="m-0 rounded-[14px] border border-warning-border bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
            {card.emptyQuestions} empty {card.emptyQuestions === 1 ? 'question' : 'questions'} from your plan. Fill them
            in to mark it ready.
          </p>
        ) : null}
        <dl
          className="m-0 grid grid-cols-3 gap-2 rounded-[16px] bg-surface-container-low px-3 py-2.5"
          aria-label="This worksheet’s assignments"
        >
          {(
            [
              ['Assigned', card.assigned],
              ['Waiting for review', card.waiting],
              ['Reviewed', card.reviewed],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-xs font-bold leading-4 text-on-surface-variant">{label}</dt>
              <dd className="m-0 font-headline text-[22px] font-bold leading-7">{n}</dd>
            </div>
          ))}
        </dl>
        {card.scheduled > 0 ? (
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            {card.scheduled} scheduled for a later date (not visible to the student yet).
          </p>
        ) : null}
        {demo ? null : (
          <div className="mt-auto flex flex-wrap gap-2">
            {card.archived ? (
              <>
                <ArchiveWorksheetButton worksheetId={card.id} title={card.title} restore />
                <DuplicateButton worksheetId={card.id} title={card.title} />
              </>
            ) : (
              <>
                <LinkButton href={`/teacher/homework/${card.id}`} variant="secondary" aria-label={`Edit ${card.title}`}>
                  {card.status === 'draft' ? 'Continue editing' : 'Edit'}
                </LinkButton>
                {card.kind === 'exercise' ? (
                  <LinkButton
                    href={`/teacher/homework/${card.id}/preview`}
                    variant="secondary"
                    aria-label={`Preview ${card.title} as a student`}
                  >
                    Preview
                  </LinkButton>
                ) : null}
                <DuplicateButton worksheetId={card.id} title={card.title} />
                <ArchiveWorksheetButton worksheetId={card.id} title={card.title} />
              </>
            )}
          </div>
        )}
      </article>
    </li>
  );
}

function statusHref(status: LibraryStatus, f: Record<string, string>) {
  const params = new URLSearchParams({ ...f, status });
  for (const [k, v] of [...params.entries()]) if (!v || (k === 'status' && v === 'all')) params.delete(k);
  const qs = params.toString();
  return `/teacher/homework${qs ? `?${qs}` : ''}#library`;
}

/** Board W1: the teacher's worksheet library (CR-17 PR 4). */
export default async function TeacherHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { viewer } = access;
  const raw = await searchParams;
  const one = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '');
  const status = (STATUSES.find(([s]) => s === one('status'))?.[0] ?? 'all') as LibraryStatus;
  const grade = Number(one('grade'));
  const filters: LibraryFilters = {
    q: one('q').slice(0, 100),
    studentId: one('student'),
    grade: Number.isInteger(grade) && grade >= 1 && grade <= 12 ? grade : null,
    board: one('board'),
    subject: one('subject'),
    chapter: one('chapter'),
    status,
  };
  const demo = isDemoMode();
  const lib = demo
    ? {
        cards: DEMO_WORKSHEETS.filter((c) => status === 'all' || c.status === status),
        counts: { all: 3, draft: 1, ready: 2, archived: 0 },
        options: { students: [], grades: [5], boards: ['CBSE'], subjects: ['maths', 'science'] as const, chapters: [] },
      }
    : await listWorksheets(db(), viewer.id, filters);
  const kept = {
    q: filters.q ?? '',
    student: one('student'),
    grade: one('grade'),
    board: filters.board ?? '',
    subject: filters.subject ?? '',
    chapter: filters.chapter ?? '',
  };
  const filtered = Object.values(kept).some(Boolean);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[70ch] flex-col gap-1">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">Homework</h1>
          <p className="m-0 text-body-md text-on-surface-variant">
            Your worksheets are private to you. A student only ever receives their own copy, made when you assign it.
          </p>
        </div>
        {demo ? null : <LinkButton href="/teacher/homework/new">New worksheet</LinkButton>}
      </div>
      {demo ? (
        <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
          <strong>Demo:</strong> sample worksheets only. Creating and editing worksheets works with real accounts.
        </p>
      ) : null}

      <section aria-labelledby="library-heading" id="library" className="flex scroll-mt-24 flex-col gap-4">
        <h2 id="library-heading" className="m-0 text-[22px] font-bold leading-8">
          My worksheets
        </h2>
        {demo ? null : (
          <form
            method="get"
            action="/teacher/homework"
            className={cx(SHELL, 'flex flex-col gap-4 p-5')}
            aria-label="Search and filters"
          >
            <input type="hidden" name="status" value={status === 'all' ? '' : status} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ws-search" className="text-sm font-bold leading-5">
                Search by title or topic
              </label>
              <input
                id="ws-search"
                name="q"
                type="search"
                maxLength={100}
                defaultValue={filters.q}
                className={cx(INPUT, 'min-h-[52px]')}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <SelectField
                name="student"
                label="Student"
                defaultValue={kept.student}
                options={[['', 'Any student'], ...lib.options.students.map((s) => [s.id, s.name] as const)]}
              />
              <SelectField
                name="grade"
                label="Grade"
                defaultValue={kept.grade}
                options={[['', 'Any grade'], ...lib.options.grades.map((g) => [String(g), `Grade ${g}`] as const)]}
              />
              <SelectField
                name="board"
                label="Board"
                defaultValue={kept.board}
                options={[['', 'Any board'], ...lib.options.boards.map((b) => [b, b] as const)]}
              />
              <SelectField
                name="subject"
                label="Subject"
                defaultValue={kept.subject}
                options={[['', 'Any subject'], ...lib.options.subjects.map((s) => [s, SUBJECTS[s].name] as const)]}
              />
              <SelectField
                name="chapter"
                label="Chapter"
                defaultValue={kept.chapter}
                options={[['', 'Any chapter'], ...lib.options.chapters.map((c) => [c, c] as const)]}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="secondary">
                Show worksheets
              </Button>
              {filtered ? (
                <Link href={statusHref(status, {})} className="inline-flex min-h-11 items-center font-bold">
                  Clear filters
                </Link>
              ) : null}
              <span className="text-sm leading-5 text-on-surface-variant">
                The student list shows only children linked to you, in the subjects their parent ticked.
              </span>
            </div>
          </form>
        )}
        <nav aria-label="Library status" className="flex flex-wrap gap-2">
          {STATUSES.map(([s, label]) => (
            <Link
              key={s}
              href={statusHref(s, kept)}
              aria-current={s === status ? 'page' : undefined}
              className={cx(
                'inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-bold no-underline',
                s === status
                  ? 'border-primary bg-primary text-on-primary hover:text-on-primary'
                  : 'border-outline bg-surface-container-lowest text-on-surface hover:text-on-surface',
              )}
            >
              {label} · {lib.counts[s]}
            </Link>
          ))}
        </nav>
        {lib.cards.length ? (
          <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
            {lib.cards.map((c) => (
              <Card key={c.id} card={c} timeZone={viewer.timeZone} demo={demo} />
            ))}
          </ul>
        ) : (
          <p className="m-0 rounded-[16px] border border-primary-fixed-dim bg-primary-fixed/50 px-4 py-3 text-[15px] leading-[22px] text-on-primary-fixed">
            {filtered || status !== 'all' ? (
              <>
                No worksheets match. <Link href="/teacher/homework">Clear filters</Link>
              </>
            ) : (
              'No worksheets yet. Choose “New worksheet” to write your first one. You write every question yourself; nothing is generated for you.'
            )}
          </p>
        )}
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          “Assigned” counts copies not yet handed in, including scheduled ones. “Waiting for review” counts work that is
          submitted or under review. “Reviewed” counts copies you have marked. Withdrawn copies aren’t counted.
        </p>
      </section>
    </div>
  );
}
