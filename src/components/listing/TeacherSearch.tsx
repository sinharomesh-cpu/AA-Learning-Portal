'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icons/Icon';
import { SUBJECT_IDS, SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { type SearchValues, teachersHref } from './searchHref';

/**
 * Teacher search and filters (OC-105, boards SF0–SF3). A real GET form, so it still works
 * without JavaScript; with JavaScript, choices apply at once (desktop) or from a filter sheet
 * (phone). Only real data: grades 1–12, curricula that published teachers list, experience as
 * stated by teachers, and the two sort orders that exist.
 */

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
const EXPERIENCE = [2, 5, 10] as const;
const SORTS = [
  ['newest', 'Newest'],
  ['experience', 'Most experience'],
] as const;

export interface CurriculumOption {
  curriculum: string;
  /** Matching teachers; null when counts aren't available. */
  count: number | null;
}

const gradeText = (g: number | null) => (g ? `Grade ${g}` : 'All grades');
const expText = (e: number | null) => (e ? `${e}+ years` : 'Any experience');
const sortText = (s: SearchValues['sort']) => SORTS.find(([v]) => v === s)![1];

/** A filter button with a small panel: Esc and outside clicks close it; focus returns. */
function FilterPopover({
  label,
  value,
  active,
  children,
  wide,
  align = 'left',
  variant = 'pill',
}: {
  label: string;
  value: string;
  active: boolean;
  /** The choices; clicking any button inside closes the panel and returns focus. */
  children: ReactNode;
  wide?: boolean;
  align?: 'left' | 'right';
  variant?: 'pill' | 'sort';
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[aria-pressed="true"], button, a')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${value}`}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-[52px] cursor-pointer items-center gap-2.5 rounded-full text-left text-on-surface',
          variant === 'pill'
            ? 'border bg-surface-container-lowest pl-[18px] pr-3.5 hover:border-outline'
            : 'border-0 bg-transparent px-3 text-on-surface-variant hover:bg-surface-container-low',
          variant === 'pill' && (active ? 'border-primary bg-primary-fixed/40' : 'border-card-border'),
          open && 'ring-4 ring-primary/20',
        )}
      >
        {variant === 'sort' ? (
          <>
            <Icon name="swap_vert" size={18} />
            <span className="text-[15px]">
              Sort: <strong className="text-on-surface">{value}</strong>
            </span>
          </>
        ) : (
          <span className="flex flex-col">
            <span className="text-[11px] font-bold uppercase leading-[14px] tracking-[.06em] text-on-surface-variant">
              {label}
            </span>
            <span
              className={cx(
                'whitespace-nowrap text-[15px] font-bold leading-5',
                active && 'text-on-primary-fixed-variant',
              )}
            >
              {value}
            </span>
          </span>
        )}
        <Icon name="keyboard_arrow_down" size={18} />
      </button>
      {open ? (
        <div
          ref={panel}
          id={id}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) close();
          }}
          role="group"
          aria-label={label}
          className={cx(
            'absolute top-[62px] z-30 flex flex-col gap-3 rounded-[20px] border border-card-border bg-surface-container-lowest p-3.5 shadow-[0_20px_48px_-12px_rgba(19,27,46,.28)]',
            wide ? 'w-[300px]' : 'w-[260px]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <span className="text-xs font-bold uppercase tracking-[.06em] text-on-surface-variant">{label}</span>
          {children}
        </div>
      ) : null}
    </div>
  );
}

const OPTION =
  'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-[12px] border-0 bg-transparent px-3 text-left text-[15px] font-bold text-on-surface hover:bg-surface-container-low aria-pressed:bg-primary-fixed/50 aria-pressed:text-on-primary-fixed-variant';
const GRADE_BTN =
  'flex h-11 cursor-pointer items-center justify-center rounded-[12px] border border-card-border bg-surface-container-lowest text-[15px] font-bold text-on-surface hover:border-outline aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary';

function GradeGrid({ value, onPick }: { value: number | null; onPick: (g: number | null) => void }) {
  return (
    <>
      <button type="button" className={OPTION} aria-pressed={value === null} onClick={() => onPick(null)}>
        All grades {value === null ? <Icon name="check" size={18} /> : null}
      </button>
      <div className="grid grid-cols-6 gap-1.5">
        {GRADES.map((g) => (
          <button
            key={g}
            type="button"
            className={GRADE_BTN}
            aria-pressed={value === g}
            aria-label={`Grade ${g}`}
            onClick={() => onPick(g)}
          >
            {g}
          </button>
        ))}
      </div>
    </>
  );
}

export function TeacherSearch({
  values,
  total,
  curricula,
  idPrefix = 'ts',
  showResults = true,
}: {
  values: SearchValues;
  /** Real number of matching teachers, or null where no results are shown (homepage). */
  total: number | null;
  curricula: CurriculumOption[];
  idPrefix?: string;
  showResults?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(values.name);
  const [sheet, setSheet] = useState<null | 'filters' | 'sort'>(null);
  const go = (patch: Partial<SearchValues>) =>
    startTransition(() => router.push(teachersHref({ ...values, name, ...patch }, '#results'), { scroll: false }));

  // Typing: results update 300 ms after typing stops (SF3).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (name.trim() === values.name) return;
    const t = setTimeout(() => go({ name: name.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text starts a search
  }, [name]);

  const selected = values.curriculum;
  const curriculumList: CurriculumOption[] =
    selected && !curricula.some((c) => c.curriculum === selected)
      ? [...curricula, { curriculum: selected, count: 0 }]
      : curricula;
  const activeCount = [values.grade, values.curriculum, values.minExperience].filter(Boolean).length;
  const chips: Array<[string, string]> = [
    ...(values.subject
      ? [
          [
            SUBJECTS[values.subject as keyof typeof SUBJECTS]?.name ?? values.subject,
            teachersHref({ ...values, subject: null }),
          ] as [string, string],
        ]
      : []),
    ...(values.name ? [[`“${values.name}”`, teachersHref({ ...values, name: '' })] as [string, string]] : []),
    ...(values.grade ? [[`Grade ${values.grade}`, teachersHref({ ...values, grade: null })] as [string, string]] : []),
    ...(values.curriculum
      ? [[values.curriculum, teachersHref({ ...values, curriculum: null })] as [string, string]]
      : []),
    ...(values.minExperience
      ? [[`${values.minExperience}+ years`, teachersHref({ ...values, minExperience: null })] as [string, string]]
      : []),
  ];

  const searchField = (
    <div className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-full border border-transparent bg-surface-container-low pl-[18px] pr-1.5 text-on-surface-variant focus-within:border-primary focus-within:bg-surface-container-lowest focus-within:ring-4 focus-within:ring-primary/15">
      <Icon name="search" size={20} />
      <label htmlFor={`${idPrefix}-name`} className="sr-only">
        Search teachers by name
      </label>
      <input
        id={`${idPrefix}-name`}
        name="name"
        type="search"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Search teachers by name"
        autoComplete="off"
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-base text-on-surface outline-none placeholder:text-on-surface-variant [&::-webkit-search-cancel-button]:hidden"
      />
      {name ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setName('');
            go({ name: '' });
          }}
          className="flex size-10 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-on-surface-variant hover:bg-surface-container"
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
      <noscript>
        <button type="submit" className="h-10 rounded-full border-0 bg-primary px-4 text-sm font-bold text-on-primary">
          Search
        </button>
      </noscript>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-lowest p-3 shadow-[0_1px_2px_rgba(19,27,46,.04),0_12px_32px_-16px_rgba(19,27,46,.18)]">
        <form
          role="search"
          aria-label="Search teachers"
          action="/teachers"
          method="get"
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go({ name: name.trim() });
          }}
        >
          {values.subject ? <input type="hidden" name="subject" value={values.subject} /> : null}
          {searchField}
          {/* Desktop toolbar (SF1). */}
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <FilterPopover label="Grade" value={gradeText(values.grade)} active={!!values.grade}>
              <GradeGrid
                value={values.grade}
                onPick={(g) => {
                  go({ grade: g });
                }}
              />
            </FilterPopover>
            <FilterPopover
              label="Curriculum"
              value={values.curriculum ?? 'All curricula'}
              active={!!values.curriculum}
              wide
            >
              <>
                <button
                  type="button"
                  className={OPTION}
                  aria-pressed={!values.curriculum}
                  onClick={() => {
                    go({ curriculum: null });
                  }}
                >
                  All curricula {!values.curriculum ? <Icon name="check" size={18} /> : null}
                </button>
                {curriculumList.map((c) => (
                  <button
                    key={c.curriculum}
                    type="button"
                    className={OPTION}
                    aria-pressed={values.curriculum === c.curriculum}
                    onClick={() => {
                      go({ curriculum: c.curriculum });
                    }}
                  >
                    {c.curriculum}
                    <span className="flex items-center gap-2 text-[13px] text-on-surface-variant">
                      {c.count !== null ? <span aria-label={`${c.count} teachers`}>{c.count}</span> : null}
                      {values.curriculum === c.curriculum ? <Icon name="check" size={18} /> : null}
                    </span>
                  </button>
                ))}
                <span className="text-[13px] text-on-surface-variant">
                  Only curricula that published teachers list.
                </span>
              </>
            </FilterPopover>
            <FilterPopover label="Experience" value={expText(values.minExperience)} active={!!values.minExperience}>
              <>
                {[null, ...EXPERIENCE].map((e) => (
                  <button
                    key={e ?? 'any'}
                    type="button"
                    className={OPTION}
                    aria-pressed={values.minExperience === e}
                    onClick={() => {
                      go({ minExperience: e });
                    }}
                  >
                    {expText(e)} {values.minExperience === e ? <Icon name="check" size={18} /> : null}
                  </button>
                ))}
                <span className="text-[13px] text-on-surface-variant">As stated by each teacher.</span>
              </>
            </FilterPopover>
            <span aria-hidden="true" className="mx-1 h-8 w-px bg-card-border" />
            <FilterPopover label="Sort" value={sortText(values.sort)} active={false} variant="sort" align="right">
              <>
                {SORTS.map(([v, text]) => (
                  <button
                    key={v}
                    type="button"
                    className={OPTION}
                    aria-pressed={values.sort === v}
                    onClick={() => {
                      go({ sort: v });
                    }}
                  >
                    {text} {values.sort === v ? <Icon name="check" size={18} /> : null}
                  </button>
                ))}
              </>
            </FilterPopover>
          </div>
          {/* Phone (SF2): Filters and Sort open sheets. */}
          <div className="flex w-full gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setSheet('filters')}
              aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
              className={cx(
                'flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border text-[15px] font-bold',
                activeCount
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-card-border bg-surface-container-lowest text-on-surface',
              )}
            >
              <Icon name="tune" size={18} />
              Filters
              {activeCount ? (
                <span
                  aria-hidden="true"
                  className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-surface-container-lowest px-1 text-xs font-extrabold text-primary"
                >
                  {activeCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setSheet('sort')}
              aria-label={`Sort: ${sortText(values.sort)}`}
              className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-card-border bg-surface-container-lowest text-[15px] font-bold text-on-surface"
            >
              <Icon name="swap_vert" size={18} />
              <span>{sortText(values.sort)}</span>
            </button>
          </div>
          {/* Without JavaScript the filters are plain selects (they stay hidden otherwise). */}
          <noscript>
            <div className="flex flex-wrap gap-2">
              <select
                name="grade"
                defaultValue={values.grade ?? ''}
                aria-label="Grade"
                className="h-11 rounded-full px-3"
              >
                <option value="">All grades</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
              <select
                name="curriculum"
                defaultValue={values.curriculum ?? ''}
                aria-label="Curriculum"
                className="h-11 rounded-full px-3"
              >
                <option value="">All curricula</option>
                {curriculumList.map((c) => (
                  <option key={c.curriculum}>{c.curriculum}</option>
                ))}
              </select>
              <select
                name="experience"
                defaultValue={values.minExperience ?? ''}
                aria-label="Experience"
                className="h-11 rounded-full px-3"
              >
                <option value="">Any experience</option>
                {EXPERIENCE.map((e) => (
                  <option key={e} value={e}>
                    {e}+ years
                  </option>
                ))}
              </select>
              <select name="sort" defaultValue={values.sort} aria-label="Sort" className="h-11 rounded-full px-3">
                {SORTS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </noscript>
        </form>
        <nav aria-label="Subjects" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 md:flex-wrap">
          {[null, ...SUBJECT_IDS].map((s) => {
            const on = values.subject === s;
            return (
              <Link
                key={s ?? 'all'}
                href={teachersHref({ ...values, subject: s }, '#results')}
                scroll={false}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'flex h-10 flex-none items-center rounded-full px-4 text-sm font-bold no-underline',
                  on
                    ? 'bg-primary text-on-primary hover:text-on-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
                )}
              >
                {s ? SUBJECTS[s].name : 'All subjects'}
              </Link>
            );
          })}
        </nav>
      </div>

      {showResults && total !== null ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5" aria-live="polite" aria-busy={pending}>
          <span className="mr-1.5 font-headline text-[20px] font-bold leading-7">
            {total} {total === 1 ? 'teacher' : 'teachers'} found
            {pending ? <span className="ml-2 text-sm font-normal text-on-surface-variant">Updating…</span> : null}
          </span>
          {chips.map(([label, href]) => (
            <span
              key={label}
              className="flex h-9 items-center gap-1 rounded-full border border-human-border bg-primary-fixed/50 pl-3.5 pr-1.5 text-sm font-bold text-on-primary-fixed-variant"
            >
              {label}
              <Link
                href={`${href}${href.includes('#') ? '' : '#results'}`}
                scroll={false}
                aria-label={`Remove ${label}`}
                className="flex size-7 items-center justify-center rounded-full text-on-primary-fixed-variant hover:bg-primary-fixed"
              >
                <Icon name="close" size={16} />
              </Link>
            </span>
          ))}
          {chips.length || values.sort !== 'newest' ? (
            <Link
              href="/teachers#results"
              scroll={false}
              onClick={() => setName('')}
              className="px-1.5 py-2 text-sm font-bold text-primary underline underline-offset-[3px]"
            >
              Clear all
            </Link>
          ) : null}
        </div>
      ) : null}

      {sheet ? (
        <FilterSheet
          kind={sheet}
          values={values}
          curricula={curriculumList}
          onClose={() => setSheet(null)}
          onApply={(patch) => {
            setSheet(null);
            go(patch);
          }}
        />
      ) : null}
    </div>
  );
}

/** Phone bottom sheet (SF2): choices are staged and applied with "Show N teachers". */
function FilterSheet({
  kind,
  values,
  curricula,
  onClose,
  onApply,
}: {
  kind: 'filters' | 'sort';
  values: SearchValues;
  curricula: CurriculumOption[];
  onClose: () => void;
  onApply: (patch: Partial<SearchValues>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [grade, setGrade] = useState(values.grade);
  const [curriculum, setCurriculum] = useState(values.curriculum);
  const [exp, setExp] = useState(values.minExperience);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  // The real count for the staged choices (SF2), from AA Pro's own database.
  useEffect(() => {
    if (kind !== 'filters') return;
    const ctrl = new AbortController();
    const href = teachersHref({ ...values, grade, curriculum, minExperience: exp });
    fetch(`/teachers/count${href.slice('/teachers'.length)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { count?: number } | null) => setCount(typeof j?.count === 'number' ? j.count : null))
      .catch(() => setCount(null));
    return () => ctrl.abort();
  }, [kind, values, grade, curriculum, exp]);
  const chip = (on: boolean) =>
    cx(
      'flex h-11 cursor-pointer items-center justify-center rounded-[12px] border px-3.5 text-[15px] font-bold',
      on
        ? 'border-primary bg-primary text-on-primary'
        : 'border-card-border bg-surface-container-lowest text-on-surface',
    );
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-[28px] border-0 bg-surface-container-lowest p-0 text-on-surface backdrop:bg-[rgba(19,27,46,.45)]"
    >
      <div className="flex justify-center pt-2" aria-hidden="true">
        <span className="h-1 w-10 rounded-full bg-outline-variant" />
      </div>
      <div className="flex items-center justify-between border-b border-card-border px-4 pb-2.5 pt-1">
        <h2 id={titleId} className="text-[20px] font-bold">
          {kind === 'filters' ? 'Filters' : 'Sort teachers'}
        </h2>
        <button
          type="button"
          aria-label={kind === 'filters' ? 'Close filters' : 'Close sort'}
          onClick={() => dialog.current?.close()}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-on-surface-variant"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      {kind === 'sort' ? (
        <div className="flex flex-col gap-1 px-2.5 pb-6 pt-2">
          {SORTS.map(([v, text]) => (
            <button
              key={v}
              type="button"
              className={cx(OPTION, 'min-h-[52px]')}
              aria-pressed={values.sort === v}
              onClick={() => onApply({ sort: v })}
            >
              {text} {values.sort === v ? <Icon name="check" size={20} /> : null}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4">
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-bold">Grade</legend>
              <button
                type="button"
                className={chip(grade === null)}
                aria-pressed={grade === null}
                onClick={() => setGrade(null)}
              >
                All grades
              </button>
              <div className="grid grid-cols-6 gap-1.5">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={chip(grade === g)}
                    aria-pressed={grade === g}
                    aria-label={`Grade ${g}`}
                    onClick={() => setGrade(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-bold">Curriculum</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={chip(curriculum === null)}
                  aria-pressed={curriculum === null}
                  onClick={() => setCurriculum(null)}
                >
                  All
                </button>
                {curricula.map((c) => (
                  <button
                    key={c.curriculum}
                    type="button"
                    className={chip(curriculum === c.curriculum)}
                    aria-pressed={curriculum === c.curriculum}
                    onClick={() => setCurriculum(c.curriculum)}
                  >
                    {c.curriculum}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-bold">
                Experience <span className="font-normal text-on-surface-variant">(as stated by teachers)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {[null, ...EXPERIENCE].map((e) => (
                  <button
                    key={e ?? 'any'}
                    type="button"
                    className={chip(exp === e)}
                    aria-pressed={exp === e}
                    onClick={() => setExp(e)}
                  >
                    {e ? `${e}+ years` : 'Any'}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="flex gap-2.5 border-t border-card-border px-4 pb-5 pt-3">
            <button
              type="button"
              onClick={() => {
                setGrade(null);
                setCurriculum(null);
                setExp(null);
              }}
              className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-full border-2 border-outline bg-surface-container-lowest text-[15px] font-bold text-on-surface"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => onApply({ grade, curriculum, minExperience: exp })}
              className="flex h-12 flex-[2] cursor-pointer items-center justify-center rounded-full border-2 border-primary bg-primary text-[15px] font-bold text-on-primary"
            >
              {count === null ? 'Show teachers' : `Show ${count} ${count === 1 ? 'teacher' : 'teachers'}`}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
