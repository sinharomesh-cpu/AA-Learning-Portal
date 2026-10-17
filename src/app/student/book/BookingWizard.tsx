'use client';

import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/Button';
import { PendingNote } from '@/components/PendingNote';
import { StatusChip } from '@/components/StatusChip';
import { brand } from '@/config/brand';
import type { AiLessonLength, BookingDay, DayPart, SlotStatus } from '@/fixtures/aiBooking';
import type { SubjectId } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';

/**
 * S13 AI booking wizard (board 7 desktop, board 8 phone). DEMO ONLY: choices are sent to
 * /student/book/result, which re-checks them on the server and books nothing.
 * Every choice is a native radio group (arrow keys move, Space selects).
 */

export interface WizardProps {
  subjects: Array<{ id: SubjectId; name: string }>;
  chapters: Partial<Record<SubjectId, string[]>>;
  days: BookingDay[];
  zoneName: string;
  lengths: readonly AiLessonLength[];
  initialSubject?: SubjectId;
}

const PARTS: Array<{ id: DayPart; label: string }> = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

const UNAVAILABLE: Record<Exclude<SlotStatus, 'open'>, string> = {
  lesson: 'You have a lesson',
  quiet: 'Family quiet time',
};

const TILE =
  'relative flex min-h-[72px] cursor-pointer flex-col justify-center gap-1 rounded-[20px] border-2 border-outline bg-surface-container-lowest px-4 py-3 text-[17px] font-bold text-on-surface ' +
  'has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-primary)] ' +
  'has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-solid';
const TILE_OFF =
  'cursor-not-allowed border-dashed bg-surface-container-low text-on-surface-variant has-[:checked]:border-outline';
const HIDDEN_RADIO = 'absolute inset-0 m-0 h-full w-full cursor-[inherit] appearance-none opacity-0';

function Step({ n, title, children, id }: { n: number; title: string; children: ReactNode; id: string }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3.5 rounded-md border border-card-border bg-surface-container-lowest p-4 shadow-[0_4px_12px_-2px_rgba(19,27,46,0.05)] sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-base font-extrabold text-on-primary"
        >
          {n}
        </span>
        <h2 id={id} className="font-headline text-[22px] font-bold leading-7">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export function BookingWizard({ subjects, chapters, days, zoneName, lengths, initialSubject }: WizardProps) {
  const uid = useId();
  const [subject, setSubject] = useState<SubjectId | undefined>(initialSubject);
  const [chapter, setChapter] = useState('');
  const [dayKey, setDayKey] = useState(days[0]?.key ?? '');
  const [length, setLength] = useState<AiLessonLength>(30);
  const [start, setStart] = useState<string | undefined>(undefined);

  const day = days.find((d) => d.key === dayKey) ?? days[0];
  const firstOpenPart = useMemo(
    () => day?.slots.find((s) => s.status[length] === 'open')?.part ?? 'afternoon',
    [day, length],
  );
  const [partChoice, setPartChoice] = useState<{ day: string; part: DayPart } | null>(null);
  const part = partChoice && partChoice.day === dayKey ? partChoice.part : firstOpenPart;
  const visible = day?.slots.filter((s) => s.part === part) ?? [];

  const chosen = day?.slots.find((s) => s.startIso === start);
  const chosenDayLabel = days.find((d) => d.slots.some((s) => s.startIso === start))?.label;
  const subjectName = subjects.find((s) => s.id === subject)?.name;
  const subjectChapters = subject ? (chapters[subject] ?? []) : [];
  const ready = Boolean(subject && start);

  function pickLength(next: AiLessonLength) {
    setLength(next);
    // A 30-minute lesson may clash where a 15-minute one fits: drop a choice that no longer fits.
    const slot = days.flatMap((d) => d.slots).find((s) => s.startIso === start);
    if (slot && slot.status[next] !== 'open') setStart(undefined);
  }

  return (
    <form action="/student/book/result" method="get" className="flex flex-col gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-5">
          <Step n={1} title="Choose a subject" id={`${uid}-s1`}>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="sr-only">Subject</legend>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
                {subjects.map((s) => (
                  <label key={s.id} className={TILE}>
                    <input
                      type="radio"
                      name="subject"
                      value={s.id}
                      checked={subject === s.id}
                      onChange={() => {
                        setSubject(s.id);
                        setChapter('');
                      }}
                      className={HIDDEN_RADIO}
                    />
                    {s.name}
                    {subject === s.id ? (
                      <span className="text-[13px] font-medium text-on-surface-variant">Selected</span>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
          </Step>

          <Step n={2} title="Chapter (optional)" id={`${uid}-s2`}>
            {subjectChapters.length ? (
              <>
                <label htmlFor={`${uid}-chapter`} className="text-[15px] font-bold">
                  Which chapter?
                </label>
                <select
                  id={`${uid}-chapter`}
                  name="chapter"
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  className="min-h-14 w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 text-[17px]"
                >
                  <option value="">Any chapter</option>
                  {subjectChapters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p className="text-[15px] leading-[22px] text-on-surface-variant">
                {subject
                  ? 'No chapters have been shared for this subject yet. You can still book a lesson.'
                  : 'Choose a subject first.'}
              </p>
            )}
            <p className="text-[15px] leading-[22px] text-on-surface-variant">
              Chapters come only from books your parent or teacher shared.
            </p>
          </Step>

          <Step n={3} title="Choose a day and time" id={`${uid}-s3`}>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="sr-only">Day</legend>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
                {days.map((d) => (
                  <label key={d.key} className={cx(TILE, 'min-w-[84px] flex-none items-center text-center')}>
                    <input
                      type="radio"
                      name="day-choice"
                      value={d.key}
                      checked={dayKey === d.key}
                      onChange={() => setDayKey(d.key)}
                      className={HIDDEN_RADIO}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="sr-only">Part of the day</legend>
              <div className="flex flex-wrap gap-2">
                {PARTS.map((p) => (
                  <label
                    key={p.id}
                    className="relative flex min-h-12 cursor-pointer items-center rounded-full border-2 border-outline bg-surface-container-lowest px-5 text-[15px] font-bold has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-on-primary has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-solid"
                  >
                    <input
                      type="radio"
                      name="part-choice"
                      value={p.id}
                      checked={part === p.id}
                      onChange={() => setPartChoice({ day: dayKey, part: p.id })}
                      className={HIDDEN_RADIO}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="sr-only">
                Start time, {day?.label} {PARTS.find((p) => p.id === part)?.label.toLowerCase()}
              </legend>
              {visible.length ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {visible.map((s) => {
                    const status = s.status[length];
                    const open = status === 'open';
                    return (
                      <label key={s.startIso} className={cx(TILE, !open && TILE_OFF)}>
                        <input
                          type="radio"
                          name="start"
                          value={s.startIso}
                          checked={start === s.startIso}
                          disabled={!open}
                          onChange={() => {
                            setStart(s.startIso);
                            // Keep this part of the day in view if the length changes later.
                            setPartChoice({ day: dayKey, part: s.part });
                          }}
                          className={HIDDEN_RADIO}
                        />
                        {s.label}
                        <span className="text-[13px] font-medium">
                          {open ? (start === s.startIso ? 'Selected' : 'Open') : UNAVAILABLE[status]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[15px] leading-[22px] text-on-surface-variant">
                  No more times today in this part of the day. Try another part of the day or another day.
                </p>
              )}
            </fieldset>
            <p className="text-[15px] leading-[22px] text-on-surface-variant">
              Times are in your time zone ({zoneName}). Grey times are not open.
            </p>
            <PendingNote decision="D-05">Any daily limit, or how far ahead a lesson must be booked.</PendingNote>
          </Step>

          <Step n={4} title="How long?" id={`${uid}-s4`}>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="sr-only">Lesson length</legend>
              <div className="flex flex-wrap gap-2.5">
                {lengths.map((l) => (
                  <label key={l} className={cx(TILE, 'min-w-[160px]')}>
                    <input
                      type="radio"
                      name="length"
                      value={l}
                      checked={length === l}
                      onChange={() => pickLength(l)}
                      className={HIDDEN_RADIO}
                    />
                    {l} minutes
                  </label>
                ))}
              </div>
            </fieldset>
          </Step>
        </div>

        <aside
          aria-labelledby={`${uid}-summary`}
          className="flex flex-col gap-3.5 rounded-md border border-card-border bg-surface-container-lowest p-5 shadow-[0_4px_12px_-2px_rgba(19,27,46,0.05)] lg:sticky lg:top-4"
        >
          <h2 id={`${uid}-summary`} className="font-headline text-[22px] font-bold leading-7">
            Your lesson
          </h2>
          <StatusChip kind="ai" className="self-start">
            {brand.tutorNameShort}
          </StatusChip>
          <dl className="m-0 flex flex-col gap-2.5 text-base">
            <div>
              <dt className="text-[15px] text-on-surface-variant">Subject</dt>
              <dd className="m-0 font-bold">
                {subjectName ? `${subjectName}${chapter ? ` · ${chapter}` : ''}` : 'Not chosen yet'}
              </dd>
            </div>
            <div>
              <dt className="text-[15px] text-on-surface-variant">When</dt>
              <dd className="m-0 font-bold">
                {chosen ? `${chosenDayLabel}, ${chosen.label} (${zoneName})` : 'Not chosen yet'}
              </dd>
            </div>
            <div>
              <dt className="text-[15px] text-on-surface-variant">Length</dt>
              <dd className="m-0 font-bold">{length} minutes</dd>
            </div>
            <div>
              <dt className="text-[15px] text-on-surface-variant">Teacher</dt>
              <dd className="m-0 font-bold">{brand.tutorNameFull}</dd>
            </div>
          </dl>
          <Button type="submit" size="child" inactive={!ready} aria-describedby={`${uid}-why`}>
            Book this lesson
          </Button>
          <p id={`${uid}-why`} className="text-[15px] leading-[22px] text-on-surface-variant">
            {ready ? 'We check the time again before booking.' : 'Choose a subject and a time first.'}
          </p>
          <p className="text-[15px] leading-[22px] text-on-surface-variant">
            Want a lesson with a human teacher? Ask your parent — only parents can book teachers.
          </p>
        </aside>
      </div>
    </form>
  );
}
