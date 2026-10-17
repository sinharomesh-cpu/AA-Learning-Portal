import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { EmptyState } from '@/components/states/States';
import { SUBJECT_IDS, SUBJECTS } from '@/fixtures/subjects';
import { describeGrades } from '@/lib/grades';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { cleanDirectoryQuery, DIRECTORY_LIMIT, NAME_QUERY_MAX, searchTeachers } from '@/server/teacherDirectory';

export const metadata: Metadata = { title: 'Find a teacher' };
export const dynamic = 'force-dynamic';

const FIELD = 'min-h-12 w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-3.5 text-[15px]';
const subjectName = (s: string) => SUBJECTS[s as keyof typeof SUBJECTS]?.name ?? s;

/**
 * Board 65 (OC-48, OC-54, OC-62): parents search approved teachers by subject, grade and name.
 * Only name, subjects, grades, time zone and bio are shown — never an email or phone number.
 * "Add as my teacher" opens the add form for that teacher (C-1 option (a), owner 16 Oct 2026).
 * "See available times" is hidden until teacher availability exists (Phase 3).
 */
export default async function FindTeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; grade?: string; name?: string }>;
}) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Find a teacher"
        body="Finding teachers works with real accounts. The sample preview has no teachers to search."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  const raw = await searchParams;
  const query = cleanDirectoryQuery({
    subject: typeof raw.subject === 'string' ? raw.subject : undefined,
    grade: typeof raw.grade === 'string' ? raw.grade : undefined,
    name: typeof raw.name === 'string' ? raw.name : undefined,
  });
  const { teachers, more } = await searchTeachers(db(), access.viewer.id, query);
  const searched = Boolean(query.subject || query.grade || query.name);
  const summary = [
    query.subject ? subjectName(query.subject) : null,
    query.grade ? `Grade ${query.grade}` : null,
    query.name ? `name contains “${query.name}”` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const count =
    teachers.length === 1 ? '1 teacher' : `${more ? `More than ${DIRECTORY_LIMIT}` : teachers.length} teachers`;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/parent/teachers" className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ My teachers
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Find a teacher</h1>
        <p className="text-sm leading-5 text-on-surface-variant">
          Every teacher here has been checked and approved by the AA Pro team.
        </p>
      </div>
      <Card className="p-4 sm:p-6">
        <form
          method="get"
          role="search"
          aria-label="Search teachers"
          className="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr_auto] md:items-end"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ft-subject" className="text-sm font-bold leading-5">
              Subject
            </label>
            <select id="ft-subject" name="subject" defaultValue={query.subject ?? ''} className={FIELD}>
              <option value="">Any subject</option>
              {SUBJECT_IDS.map((s) => (
                <option key={s} value={s}>
                  {SUBJECTS[s].name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ft-grade" className="text-sm font-bold leading-5">
              Grade
            </label>
            <select id="ft-grade" name="grade" defaultValue={query.grade ? String(query.grade) : ''} className={FIELD}>
              <option value="">Any grade</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ft-name" className="text-sm font-bold leading-5">
              Name (optional)
            </label>
            <input
              id="ft-name"
              name="name"
              type="search"
              placeholder="Search by name"
              defaultValue={query.name ?? ''}
              maxLength={NAME_QUERY_MAX}
              autoComplete="off"
              className={FIELD}
            />
          </div>
          <button
            type="submit"
            className="min-h-12 rounded-full border-2 border-primary bg-primary px-6 text-[15px] font-bold text-on-primary"
          >
            Show teachers
          </button>
        </form>
      </Card>

      <p className="font-bold" role="status">
        {teachers.length === 0 ? 'No teachers found' : count}
        {summary ? ` for ${summary}` : ''}
      </p>

      {teachers.length === 0 ? (
        <EmptyState
          title="No results"
          action={
            <LinkButton href="/parent/teachers/new" variant="secondary">
              Add a teacher by email
            </LinkButton>
          }
        >
          {searched
            ? "No approved teachers match yet. Try another subject or grade, or add your child's own teacher."
            : "No approved teachers are listed yet. You can still add your child's own teacher by email."}
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-5 p-0 lg:grid-cols-2" aria-label="Teachers">
          {teachers.map((t) => (
            <li key={t.id} className="flex">
              <Card as="article" aria-labelledby={`dt-${t.id}`} className="flex w-full flex-col gap-3 p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-primary-fixed font-headline text-[22px] font-extrabold text-on-primary-fixed"
                  >
                    {[...t.name.replace(/^Teacher\s+/i, '')][0]?.toUpperCase() ?? '?'}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <h2 id={`dt-${t.id}`} className="break-words text-[20px] font-bold leading-7">
                      {t.name}
                    </h2>
                    <p className="text-sm leading-5 text-on-surface-variant">
                      {describeGrades(t.grades)} · {t.timeZone}
                    </p>
                  </div>
                </div>
                <p className="m-0 flex flex-wrap gap-1.5" aria-label="Subjects">
                  {t.subjects.map((s) => (
                    <span
                      key={s}
                      className="inline-flex rounded-full bg-primary-fixed/60 px-2.5 py-0.5 text-[13px] font-bold text-on-primary-fixed"
                    >
                      {subjectName(s)}
                    </span>
                  ))}
                </p>
                {t.bio ? (
                  <p className="whitespace-pre-line break-words text-sm leading-5 text-on-surface-variant">{t.bio}</p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2.5 pt-1">
                  {t.alreadyMine ? (
                    <LinkButton href={`/parent/teachers/${t.id}`} variant="secondary" aria-describedby={`dt-${t.id}`}>
                      Already your teacher · Change children
                    </LinkButton>
                  ) : (
                    <LinkButton href={`/parent/teachers/find/${t.id}`} aria-describedby={`dt-${t.id}`}>
                      Add as my teacher
                    </LinkButton>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {more ? (
        <p className="text-sm leading-5 text-on-surface-variant">
          Showing the first {DIRECTORY_LIMIT}. Choose a subject or grade, or type a name, to narrow the list.
        </p>
      ) : null}
    </div>
  );
}
