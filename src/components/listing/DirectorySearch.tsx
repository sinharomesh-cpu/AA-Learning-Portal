'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icons/Icon';
import { SUBJECT_IDS, SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { FilterPopover, GradeGrid } from './TeacherSearch';

/**
 * Parent "Find a teacher" search (OC-106 (4)): the modern search look (OC-105, boards SF0–SF3)
 * on the parent directory's own filters — subject, grade and name only. The directory's rules
 * and permissions are unchanged (server side). A real GET form, so it works without JavaScript.
 */

export interface DirectoryValues {
  subject: string | null;
  grade: number | null;
  name: string;
}

const BASE = '/parent/teachers/find';

/** Address of the parent directory with these values (empty values left out). */
export function directoryHref(v: Partial<DirectoryValues>, hash = ''): string {
  const q = new URLSearchParams();
  if (v.subject) q.set('subject', v.subject);
  if (v.grade) q.set('grade', String(v.grade));
  if (v.name) q.set('name', v.name);
  const s = q.toString();
  return `${BASE}${s ? `?${s}` : ''}${hash}`;
}

const subjectName = (s: string) => SUBJECTS[s as keyof typeof SUBJECTS]?.name ?? s;

export function DirectorySearch({
  values,
  countText,
  nameMax,
}: {
  values: DirectoryValues;
  /** e.g. "3 teachers found" / "No teachers found", worked out by the server. */
  countText: string;
  nameMax: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(values.name);
  const go = (patch: Partial<DirectoryValues>) =>
    startTransition(() => router.push(directoryHref({ ...values, name, ...patch }, '#results'), { scroll: false }));

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

  const chips: Array<[string, string]> = [
    ...(values.subject
      ? [[subjectName(values.subject), directoryHref({ ...values, subject: null })] as [string, string]]
      : []),
    ...(values.name ? [[`“${values.name}”`, directoryHref({ ...values, name: '' })] as [string, string]] : []),
    ...(values.grade ? [[`Grade ${values.grade}`, directoryHref({ ...values, grade: null })] as [string, string]] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-lowest p-3 shadow-[0_1px_2px_rgba(19,27,46,.04),0_12px_32px_-16px_rgba(19,27,46,.18)]">
        <form
          role="search"
          aria-label="Search teachers"
          action={BASE}
          method="get"
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go({ name: name.trim() });
          }}
        >
          {values.subject ? <input type="hidden" name="subject" value={values.subject} /> : null}
          <div className="flex h-[52px] min-w-0 flex-1 basis-[240px] items-center gap-2.5 rounded-full border border-transparent bg-surface-container-low pl-[18px] pr-1.5 text-on-surface-variant focus-within:border-primary focus-within:bg-surface-container-lowest focus-within:ring-4 focus-within:ring-primary/15">
            <Icon name="search" size={20} />
            <label htmlFor="ft-name" className="sr-only">
              Search teachers by name
            </label>
            <input
              id="ft-name"
              name="name"
              type="search"
              maxLength={nameMax}
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
              <button
                type="submit"
                className="h-10 rounded-full border-0 bg-primary px-4 text-sm font-bold text-on-primary"
              >
                Search
              </button>
            </noscript>
          </div>
          {/* Grade: a panel on every screen size (only one filter, so no phone sheet is needed). */}
          <div>
            <FilterPopover
              label="Grade"
              value={values.grade ? `Grade ${values.grade}` : 'All grades'}
              active={!!values.grade}
              align="right"
            >
              <GradeGrid value={values.grade} onPick={(g) => go({ grade: g })} />
            </FilterPopover>
          </div>
          <noscript>
            <select
              name="grade"
              defaultValue={values.grade ?? ''}
              aria-label="Grade"
              className="h-11 rounded-full px-3"
            >
              <option value="">All grades</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </noscript>
        </form>
        <nav aria-label="Subjects" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 md:flex-wrap">
          {[null, ...SUBJECT_IDS].map((s) => {
            const on = values.subject === s;
            return (
              <Link
                key={s ?? 'all'}
                href={directoryHref({ ...values, subject: s }, '#results')}
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5" role="status" aria-busy={pending}>
        <span className="mr-1.5 font-headline text-[20px] font-bold leading-7">
          {countText}
          {pending ? <span className="ml-2 text-sm font-normal text-on-surface-variant">Updating…</span> : null}
        </span>
        {chips.map(([label, href]) => (
          <span
            key={label}
            className="flex h-9 items-center gap-1 rounded-full border border-human-border bg-primary-fixed/50 pl-3.5 pr-1.5 text-sm font-bold text-on-primary-fixed-variant"
          >
            {label}
            <Link
              href={`${href}#results`}
              scroll={false}
              aria-label={`Remove ${label}`}
              className="flex size-7 items-center justify-center rounded-full text-on-primary-fixed-variant hover:bg-primary-fixed"
            >
              <Icon name="close" size={16} />
            </Link>
          </span>
        ))}
        {chips.length ? (
          <Link
            href={`${BASE}#results`}
            scroll={false}
            onClick={() => setName('')}
            className="px-1.5 py-2 text-sm font-bold text-primary underline underline-offset-[3px]"
          >
            Clear all
          </Link>
        ) : null}
      </div>
    </div>
  );
}
