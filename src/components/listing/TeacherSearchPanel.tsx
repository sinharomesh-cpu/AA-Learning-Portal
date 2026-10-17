import Link from 'next/link';
import { SUBJECT_IDS, SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { CURRICULA_LIST } from '@/lib/curricula';

/**
 * Search and filters for public teacher listings (owner request OC-84; boards D8, D10). A plain
 * GET form, so it works without JavaScript and every result page has its own address. Only
 * filters backed by real listing data: name, subject, grade, curriculum, experience; sorting by
 * newest or experience (no ratings exist, R-04).
 */
export interface SearchValues {
  name: string;
  subject: string | null;
  grade: number | null;
  curriculum: string | null;
  minExperience: number | null;
  sort: 'newest' | 'experience';
}

const FIELD =
  'min-h-12 w-full rounded-[14px] border-2 border-outline bg-surface-container-lowest px-3 text-base text-on-surface';

/** Address of the teacher list with these values (empty values left out). */
export function teachersHref(v: Partial<SearchValues>, hash = ''): string {
  const q = new URLSearchParams();
  if (v.name) q.set('name', v.name);
  if (v.subject) q.set('subject', v.subject);
  if (v.grade) q.set('grade', String(v.grade));
  if (v.curriculum) q.set('curriculum', v.curriculum);
  if (v.minExperience) q.set('experience', String(v.minExperience));
  if (v.sort && v.sort !== 'newest') q.set('sort', v.sort);
  const s = q.toString();
  return `/teachers${s ? `?${s}` : ''}${hash}`;
}

export function TeacherSearchPanel({ values, idPrefix = 'ts' }: { values: SearchValues; idPrefix?: string }) {
  const chip = (active: boolean) =>
    cx(
      'inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-bold no-underline',
      active
        ? 'border-primary bg-primary text-on-primary hover:text-on-primary'
        : 'border-card-border bg-surface-container-low text-on-surface hover:bg-surface-container hover:text-on-surface',
    );
  return (
    <div className="pub-card flex flex-col gap-4 rounded-lg p-4 md:p-5">
      <form role="search" aria-label="Search teachers" action="/teachers" method="get" className="flex flex-col gap-3">
        {values.subject ? <input type="hidden" name="subject" value={values.subject} /> : null}
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] md:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-name`} className="text-sm font-bold">
              Teacher name
            </label>
            <input
              id={`${idPrefix}-name`}
              name="name"
              type="search"
              maxLength={60}
              defaultValue={values.name}
              placeholder="Search by name"
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-grade`} className="text-sm font-bold">
              Grade
            </label>
            <select id={`${idPrefix}-grade`} name="grade" defaultValue={values.grade ?? ''} className={FIELD}>
              <option value="">Any grade</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-curriculum`} className="text-sm font-bold">
              Curriculum
            </label>
            <select
              id={`${idPrefix}-curriculum`}
              name="curriculum"
              defaultValue={values.curriculum ?? ''}
              className={FIELD}
            >
              <option value="">Any curriculum</option>
              {CURRICULA_LIST.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-experience`} className="text-sm font-bold">
              Experience
            </label>
            <select
              id={`${idPrefix}-experience`}
              name="experience"
              defaultValue={values.minExperience ?? ''}
              className={FIELD}
            >
              <option value="">Any</option>
              <option value="2">2+ years</option>
              <option value="5">5+ years</option>
              <option value="10">10+ years</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-sort`} className="text-sm font-bold">
              Sort by
            </label>
            <select id={`${idPrefix}-sort`} name="sort" defaultValue={values.sort} className={FIELD}>
              <option value="newest">Newest</option>
              <option value="experience">Most experience</option>
            </select>
          </div>
        </div>
        <div>
          <button
            type="submit"
            className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full border-2 border-primary bg-primary px-[22px] text-[15px] font-bold text-on-primary hover:border-primary-hover hover:bg-primary-hover"
          >
            Show teachers
          </button>
        </div>
      </form>
      <nav aria-label="Subjects" className="flex flex-wrap gap-2">
        <Link
          href={teachersHref({ ...values, subject: null })}
          className={chip(!values.subject)}
          aria-current={!values.subject ? 'page' : undefined}
        >
          All Subjects
        </Link>
        {SUBJECT_IDS.map((s) => (
          <Link
            key={s}
            href={teachersHref({ ...values, subject: s })}
            className={chip(values.subject === s)}
            aria-current={values.subject === s ? 'page' : undefined}
          >
            {SUBJECTS[s].name}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-on-surface-variant">Experience is as stated by each teacher.</p>
    </div>
  );
}
