'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import type { HomeStudent } from '@/server/teacherHome';

/**
 * S21 "Assigned student roster": one card per student linked to this teacher. Children are shown
 * by initial only (no photos), and only facts we hold: grade, subject, lessons, next lesson and
 * the last shared file. No rankings, badges or scores (no data for them, and none are approved).
 */
export function StudentRoster({ students, realAccount }: { students: HomeStudent[]; realAccount: boolean }) {
  const [filter, setFilter] = useState('');
  const filterId = useId();
  const q = filter.trim().toLowerCase();
  const shown = q
    ? students.filter((s) => `${s.name} grade ${s.grade} ${s.subject}`.toLowerCase().includes(q))
    : students;
  return (
    <section aria-labelledby="students" className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col">
          <span className="text-label-sm uppercase tracking-wider text-primary">Linked to you</span>
          <h2 id="students" className="font-headline text-headline-sm font-bold sm:text-headline-md">
            My students
          </h2>
        </div>
        {students.length ? (
          <div className="flex min-h-12 items-center gap-2 rounded-full border border-card-border bg-surface-container-lowest px-4 shadow-sm">
            <Icon name="search" size={18} className="text-on-surface-variant" />
            <label htmlFor={filterId} className="sr-only">
              Filter by student or grade
            </label>
            <input
              id={filterId}
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by student or grade"
              className="w-48 bg-transparent text-body-sm text-on-surface placeholder:text-on-surface-variant"
            />
          </div>
        ) : null}
      </div>
      {students.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-card-border bg-surface-container-lowest p-6 sm:rounded-xl">
          <Icon name="groups" size={32} className="text-primary" />
          <h3 className="font-headline text-headline-sm">No students linked yet</h3>
          <p className="text-body-md text-on-surface-variant">
            {realAccount
              ? 'A child appears here once their parent links them to you and you accept the request.'
              : 'Students appear here once families book lessons with you.'}
          </p>
          {realAccount ? (
            <Link href="/teacher/enquiries" className="font-bold">
              See enquiries from families
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => (
              <li
                key={s.id}
                className="flex flex-col justify-between gap-4 rounded-lg border border-card-border bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md sm:rounded-xl"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-fixed font-headline text-[24px] font-bold text-on-primary-fixed-variant"
                    >
                      {[...s.name][0]?.toUpperCase()}
                    </span>
                    <div className="flex flex-col">
                      <h3 className="font-headline text-headline-sm">{s.name}</h3>
                      <span className="text-label-sm text-primary">
                        Grade {s.grade} · {s.subject}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low px-3 py-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Next lesson
                    </span>
                    <span className="text-body-sm text-on-surface">{s.nextLesson ?? 'None booked'}</span>
                  </div>
                  <dl className="m-0 flex flex-col gap-1 text-[13px] leading-5 text-on-surface-variant">
                    <div className="flex items-center justify-between gap-3">
                      <dt>Lessons completed</dt>
                      <dd className="m-0 text-label-md text-on-surface">{s.completed}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Last shared</dt>
                      <dd className="m-0 max-w-[170px] truncate text-label-md text-primary">
                        {s.lastShared ?? 'Nothing yet'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/teacher/students/${s.id}`}
                    className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-full bg-surface-container text-label-sm text-on-surface no-underline hover:bg-surface-container-high hover:text-on-surface"
                  >
                    <Icon name="history_edu" size={16} />
                    View
                    <span className="sr-only">{s.name}</span>
                  </Link>
                  <span
                    aria-disabled="true"
                    title="Sharing opens in a later phase"
                    className="flex min-h-12 flex-1 cursor-not-allowed items-center justify-center gap-1 rounded-full bg-surface-container-low text-label-sm text-on-surface-variant"
                  >
                    <Icon name="upload_file" size={16} />
                    Share (later)
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {shown.length === 0 ? (
            <p role="status" className="text-body-sm text-on-surface-variant">
              No student matches “{filter.trim()}”.
            </p>
          ) : null}
        </>
      )}
      {students.length ? (
        <p className="text-sm leading-5 text-on-surface-variant">
          Only students a parent has linked to you appear here (OC-36).
        </p>
      ) : null}
    </section>
  );
}
