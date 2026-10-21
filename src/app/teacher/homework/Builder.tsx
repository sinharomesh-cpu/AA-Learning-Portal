'use client';

import { useActionState, useId, useState, useTransition } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { Icon } from '@/components/icons/Icon';
import { SelectField } from '@/components/ui/SelectField';
import { INPUT, SHELL, TILE, TILE_KEY } from '@/components/ui/styles';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import {
  emptyQuestion,
  isAutoMarked,
  LIMITS,
  planQuestions,
  QUESTION_PROBLEM_TEXT,
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
  type QuestionDraft,
  type QuestionProblem,
  type QuestionType,
  totalPoints,
} from '@/lib/worksheetQuestions';
import type { BuilderOptions, DetailsField, WorksheetForEdit } from '@/server/worksheets';
import { type BuilderState, copyQuestionsAction, saveWorksheetAction } from './actions';

/**
 * Board W2: the worksheet builder (approved HW3 plus the W2 additions). Everything the teacher
 * types is sent as one JSON payload; the server checks it all again. Every question is written by
 * the teacher: the plan only adds empty questions, and nothing is generated or suggested.
 */

type Details = {
  kind: 'exercise' | 'handwritten';
  title: string;
  grade: string;
  board: string;
  subject: string;
  chapter: string;
  topic: string;
  difficulty: string;
  instructions: string;
  sourceResourceId: string;
  sourceFromPage: string;
  sourceToPage: string;
};

const AREA = cx(INPUT, 'min-h-24 py-3');
const FIELD = cx(INPUT, 'min-h-12');
const SMALL = cx(INPUT.replace('w-full', ''), 'min-h-11 w-24');

function detailsOf(w: WorksheetForEdit | null, opts: BuilderOptions): Details {
  return {
    kind: w?.kind ?? 'exercise',
    title: w?.title ?? '',
    grade: w ? String(w.grade) : '',
    board: w?.board ?? '',
    subject: w?.subject ?? (opts.subjects.length === 1 ? opts.subjects[0]! : ''),
    chapter: w?.chapter ?? '',
    topic: w?.topic ?? '',
    difficulty: w?.difficulty ?? '',
    instructions: w?.instructions ?? '',
    sourceResourceId: w?.sourceResourceId ?? '',
    sourceFromPage: w?.sourceFromPage ? String(w.sourceFromPage) : '',
    sourceToPage: w?.sourceToPage ? String(w.sourceToPage) : '',
  };
}

/** The teacher's part-marks switch (D3A-18; owner, 21 Oct: the teacher turns part marks on or off). */
function PartMarks({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Labelled({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold leading-5">
        {label}
      </label>
      {children}
      {hint ? <span className="text-[13px] leading-[18px] text-on-surface-variant">{hint}</span> : null}
    </div>
  );
}

/** One question's editor, by type (HW3). */
function QuestionEditor({
  q,
  index,
  count,
  problems,
  showSourcePage,
  onChange,
  onMove,
  onDelete,
}: {
  q: QuestionDraft;
  index: number;
  count: number;
  problems: QuestionProblem[];
  showSourcePage: boolean;
  onChange: (q: QuestionDraft) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const uid = useId();
  const n = index + 1;
  const empty = q.prompt.trim() === '';
  const set = (patch: Partial<QuestionDraft>) => onChange({ ...q, ...patch });
  const options = q.options ?? [];
  const correct = q.correct ?? [];
  const pairs = q.pairs ?? [];
  const [min, max] =
    q.type === 'single_choice' || q.type === 'multi_select' ? LIMITS.options[q.type] : ([0, 0] as [number, number]);

  return (
    <section
      aria-labelledby={`${uid}-h`}
      className={cx(
        'flex flex-col gap-3 rounded-[24px] border bg-surface-container-lowest p-5',
        problems.length
          ? 'border-2 border-error'
          : empty
            ? 'border-2 border-dashed border-warning-border'
            : 'border-card-border',
      )}
      data-testid="question"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${uid}-h`} className="m-0 text-[17px] font-bold leading-6">
          Question {n} · {QUESTION_TYPE_LABEL[q.type]}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cx(
              'rounded-full border px-3 py-1 text-xs font-bold',
              isAutoMarked(q.type)
                ? 'border-success-border bg-success-container text-on-success-container'
                : 'border-warning-border bg-warning-container text-on-warning-container',
            )}
          >
            {isAutoMarked(q.type) ? 'Marked automatically' : 'You mark this'}
          </span>
          <label htmlFor={`${uid}-pts`} className="text-sm font-bold">
            Marks
          </label>
          <input
            id={`${uid}-pts`}
            className={SMALL}
            inputMode="numeric"
            value={String(q.points)}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/\D/g, '').slice(0, 3) || '0');
              set({ points: Math.min(LIMITS.points, v) });
            }}
          />
        </div>
      </div>
      {empty && problems.length === 0 ? (
        <p className="m-0 text-sm font-bold leading-5 text-on-warning-container">Empty: write this question.</p>
      ) : null}
      {problems.length ? (
        <ul
          className="m-0 flex list-none flex-col gap-1 p-0 text-sm font-bold leading-5 text-on-error-container"
          role="alert"
        >
          {problems.map((p) => (
            <li key={p}>{QUESTION_PROBLEM_TEXT[p]}</li>
          ))}
        </ul>
      ) : null}

      {q.type === 'short_answer' ? (
        <Labelled
          id={`${uid}-p`}
          label={`Question ${n}`}
          hint={`The student writes up to ${LIMITS.shortAnswer} characters. You read it and give marks and a comment.`}
        >
          <textarea
            id={`${uid}-p`}
            className={AREA}
            maxLength={LIMITS.prompt}
            value={q.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
          />
        </Labelled>
      ) : (
        <Labelled
          id={`${uid}-p`}
          label={q.type === 'fill_blank' ? `Question ${n}: the sentence` : `Question ${n}`}
          hint={
            q.type === 'fill_blank'
              ? 'Put each answer in [ ]. Add other accepted answers with |, for example: Plants give out [oxygen|O2].'
              : undefined
          }
        >
          <input
            id={`${uid}-p`}
            className={FIELD}
            maxLength={q.type === 'fill_blank' ? 2 * LIMITS.prompt : LIMITS.prompt}
            value={q.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
          />
        </Labelled>
      )}

      {q.type === 'single_choice' || q.type === 'multi_select' ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-bold leading-5">
            Options · tick {q.type === 'single_choice' ? 'the correct answer' : 'every correct answer'}
          </legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={q.type === 'single_choice' ? 'radio' : 'checkbox'}
                name={`${uid}-correct`}
                aria-label={`Option ${i + 1} is correct`}
                className="size-6 flex-none accent-primary"
                checked={correct.includes(i)}
                onChange={(e) =>
                  set({
                    correct:
                      q.type === 'single_choice'
                        ? [i]
                        : e.target.checked
                          ? [...correct, i]
                          : correct.filter((c) => c !== i),
                  })
                }
              />
              <input
                aria-label={`Option ${i + 1}`}
                className={FIELD}
                maxLength={LIMITS.option}
                value={o}
                onChange={(e) => set({ options: options.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <Button
                variant="secondary"
                className="min-h-11 px-3"
                inactive={options.length <= min}
                aria-label={`Remove option ${i + 1}`}
                onClick={() =>
                  set({
                    options: options.filter((_, j) => j !== i),
                    correct: correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              className="min-h-11"
              inactive={options.length >= max}
              onClick={() => set({ options: [...options, ''] })}
            >
              Add an option
            </Button>
            {q.type === 'multi_select' ? (
              <PartMarks
                checked={q.partialCredit === true}
                onChange={(v) => set({ partialCredit: v })}
                label="Give part marks for each correct tick (a wrong tick takes one away)"
              />
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {q.type === 'fill_blank' ? (
        // D3A-18 (owner, 21 Oct): answers match exactly, ignoring capital letters and extra spaces,
        // plus the alternatives the teacher lists. No setting to change that.
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            Capital letters and extra spaces are ignored. Add other accepted answers with |, for example [oxygen|O2].
          </p>
          <PartMarks
            checked={q.partialCredit !== false}
            onChange={(v) => set({ partialCredit: v })}
            label="Give part marks for each correct blank"
          />
        </div>
      ) : null}

      {q.type === 'true_false' ? (
        <fieldset className="m-0 flex flex-wrap items-center gap-3 border-0 p-0">
          <legend className="mb-2 text-sm font-bold leading-5">Correct answer</legend>
          {([true, false] as const).map((v) => (
            <label
              key={String(v)}
              className="flex min-h-11 items-center gap-2 rounded-full border-2 border-outline px-4 font-bold has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40"
            >
              <input
                type="radio"
                name={`${uid}-tf`}
                className="size-5 accent-primary"
                checked={q.truth === v}
                onChange={() => set({ truth: v })}
              />
              {v ? 'True' : 'False'}
            </label>
          ))}
        </fieldset>
      ) : null}

      {q.type === 'matching' ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-bold leading-5">
            Pairs · the student sees the right-hand side shuffled
          </legend>
          {pairs.map(([l, r], i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <input
                aria-label={`Pair ${i + 1}, left`}
                className={FIELD}
                maxLength={LIMITS.option}
                value={l}
                onChange={(e) => set({ pairs: pairs.map((p, j) => (j === i ? [e.target.value, p[1]] : p)) })}
              />
              <input
                aria-label={`Pair ${i + 1}, right`}
                className={FIELD}
                maxLength={LIMITS.option}
                value={r}
                onChange={(e) => set({ pairs: pairs.map((p, j) => (j === i ? [p[0], e.target.value] : p)) })}
              />
              <Button
                variant="secondary"
                className="min-h-11 px-3"
                inactive={pairs.length <= LIMITS.pairs[0]}
                aria-label={`Remove pair ${i + 1}`}
                onClick={() => set({ pairs: pairs.filter((_, j) => j !== i) })}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              className="min-h-11"
              inactive={pairs.length >= LIMITS.pairs[1]}
              onClick={() => set({ pairs: [...pairs, ['', '']] })}
            >
              Add a pair
            </Button>
            <PartMarks
              checked={q.partialCredit !== false}
              onChange={(v) => set({ partialCredit: v })}
              label="Give part marks for each correct pair"
            />
          </div>
        </fieldset>
      ) : null}

      {showSourcePage ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-dashed border-outline-variant px-3 py-2">
          <label htmlFor={`${uid}-sp`} className="text-sm font-bold">
            Source page (optional)
          </label>
          <input
            id={`${uid}-sp`}
            className={SMALL}
            inputMode="numeric"
            value={q.sourcePage ? String(q.sourcePage) : ''}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4);
              set({ sourcePage: v ? Number(v) : null });
            }}
          />
          <span className="text-sm text-on-surface-variant">Shown to you only.</span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="min-h-11"
          inactive={index === 0}
          onClick={() => onMove(-1)}
          aria-label={`Move question ${n} up`}
        >
          Move up
        </Button>
        <Button
          variant="secondary"
          className="min-h-11"
          inactive={index === count - 1}
          onClick={() => onMove(1)}
          aria-label={`Move question ${n} down`}
        >
          Move down
        </Button>
        <Button variant="danger" className="min-h-11" onClick={onDelete}>
          Delete question {n}
        </Button>
      </div>
    </section>
  );
}

const PLAN_START: Record<QuestionType, { count: string; points: string }> = {
  single_choice: { count: '0', points: '1' },
  multi_select: { count: '0', points: '2' },
  fill_blank: { count: '0', points: '2' },
  true_false: { count: '0', points: '1' },
  matching: { count: '0', points: '3' },
  short_answer: { count: '0', points: '2' },
};

const digits = (s: string, max = 3) => s.replace(/\D/g, '').slice(0, max);

export function WorksheetBuilder({
  worksheet,
  options,
  savedNotice,
}: {
  worksheet: WorksheetForEdit | null;
  options: BuilderOptions;
  savedNotice?: string;
}) {
  const [state, action, pending] = useActionState<BuilderState, FormData>(saveWorksheetAction, {});
  const [d, setD] = useState<Details>(() => detailsOf(worksheet, options));
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => worksheet?.questions ?? []);
  const [plan, setPlan] = useState(PLAN_START);
  const [copyFrom, setCopyFrom] = useState('');
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [copying, startCopy] = useTransition();
  // Problems from the last "Mark ready" stay until the teacher changes a question.
  const [clearedFor, setClearedFor] = useState<BuilderState | null>(null);
  const problems = clearedFor === state ? undefined : state.problems;
  const uid = useId();

  const set = (patch: Partial<Details>) => setD((x) => ({ ...x, ...patch }));
  const bad = (f: DetailsField) => state.fields?.includes(f) ?? false;
  const exercise = d.kind === 'exercise';
  const planned = QUESTION_TYPES.reduce((s, t) => s + Number(plan[t].count || 0), 0);
  const plannedMarks = QUESTION_TYPES.reduce((s, t) => s + Number(plan[t].count || 0) * Number(plan[t].points || 0), 0);
  const emptyCount = questions.filter((q) => q.prompt.trim() === '').length;
  const payload = JSON.stringify({
    id: worksheet?.id,
    details: {
      ...d,
      grade: d.grade ? Number(d.grade) : null,
      sourceResourceId: d.sourceResourceId || null,
      sourceFromPage: d.sourceResourceId && d.sourceFromPage ? Number(d.sourceFromPage) : null,
      sourceToPage: d.sourceResourceId && d.sourceToPage ? Number(d.sourceToPage) : null,
    },
    questions: exercise ? questions : [],
  });
  const problemsFor = (i: number) => problems?.find((p) => p.index === i)?.problems ?? [];
  const change = (next: QuestionDraft[]) => {
    setQuestions(next);
    setClearedFor(state);
  };

  return (
    <form
      action={action}
      className="flex flex-col gap-6"
      onKeyDown={(e) => {
        // Enter in a one-line box must not save the whole worksheet.
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      <input type="hidden" name="payload" value={payload} />
      {savedNotice && !state.error && !state.notice ? <FormMessage tone="success">{savedNotice}</FormMessage> : null}
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}

      <fieldset className={cx(SHELL, 'm-0 flex flex-col gap-3 p-5')}>
        <legend className="sr-only">What kind of worksheet?</legend>
        <span className="text-sm font-bold leading-5" aria-hidden="true">
          What kind of worksheet?
        </span>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['exercise', 'Exercise on screen', 'Questions the child answers in AA Pro'],
              ['handwritten', 'Handwritten work', 'Done on paper; a parent uploads photos or a PDF'],
            ] as const
          ).map(([k, title, hint]) => (
            <label
              key={k}
              className="flex min-h-[72px] cursor-pointer items-start gap-3 rounded-[20px] border-2 border-outline p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/30"
            >
              <input
                type="radio"
                name="kind-choice"
                className="mt-1 size-5 accent-primary"
                checked={d.kind === k}
                onChange={() => set({ kind: k })}
              />
              <span>
                <strong>{title}</strong>
                <br />
                <span className="text-sm text-on-surface-variant">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {!exercise && questions.length ? (
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            Handwritten worksheets have no questions on screen. Your {questions.length} questions are kept here only
            until you save; switch back to keep them.
          </p>
        ) : null}
      </fieldset>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby={`${uid}-details`} className={cx(SHELL, 'flex flex-col gap-4 p-5')}>
            <h2 id={`${uid}-details`} className="m-0 text-[22px] font-bold leading-8">
              Details
            </h2>
            <Labelled
              id={`${uid}-title`}
              label="Title"
              hint="Name the topic, not a student: the same worksheet can be set for anyone."
            >
              <input
                id={`${uid}-title`}
                className={FIELD}
                maxLength={120}
                value={d.title}
                aria-invalid={bad('title') || undefined}
                onChange={(e) => set({ title: e.target.value })}
              />
            </Labelled>
            <div className="flex flex-wrap gap-3">
              <SelectField
                name="b-grade"
                label="Grade"
                value={d.grade}
                onChange={(v) => set({ grade: v })}
                error={bad('grade') ? 'Choose a grade.' : undefined}
                options={[
                  ['', 'Choose a grade'],
                  ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `Grade ${i + 1}`] as const),
                ]}
              />
              <SelectField
                name="b-board"
                label="Board"
                value={d.board}
                onChange={(v) => set({ board: v })}
                error={bad('board') ? 'Choose a board.' : undefined}
                options={[['', 'Choose a board'], ...options.boards.map((b) => [b, b] as const)]}
              />
              <SelectField
                name="b-subject"
                label="Subject"
                value={d.subject}
                onChange={(v) => set({ subject: v })}
                error={bad('subject') ? 'Choose a subject you teach.' : undefined}
                options={[['', 'Choose a subject'], ...options.subjects.map((s) => [s, SUBJECTS[s].name] as const)]}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labelled
                id={`${uid}-ch`}
                label="Chapter (optional)"
                hint="Typed by you, as the student’s book names it."
              >
                <input
                  id={`${uid}-ch`}
                  className={FIELD}
                  maxLength={120}
                  value={d.chapter}
                  onChange={(e) => set({ chapter: e.target.value })}
                />
              </Labelled>
              <Labelled id={`${uid}-tp`} label="Topic (optional)" hint="Helps you find it later.">
                <input
                  id={`${uid}-tp`}
                  className={FIELD}
                  maxLength={120}
                  value={d.topic}
                  onChange={(e) => set({ topic: e.target.value })}
                />
              </Labelled>
            </div>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 text-sm font-bold leading-5">Difficulty (optional)</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['easy', 'Easy'],
                    ['medium', 'Medium'],
                    ['hard', 'Hard'],
                    ['', 'Not set'],
                  ] as const
                ).map(([v, t]) => (
                  <label
                    key={t}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-outline px-4 text-sm font-bold has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40"
                  >
                    <input
                      type="radio"
                      name={`${uid}-diff`}
                      className="size-5 accent-primary"
                      checked={d.difficulty === v}
                      onChange={() => set({ difficulty: v })}
                    />
                    {t}
                  </label>
                ))}
              </div>
              <span className="text-[13px] leading-[18px] text-on-surface-variant">
                A label for you and the family. It doesn’t change marking.
              </span>
            </fieldset>
            <Labelled id={`${uid}-ins`} label="Instructions">
              <textarea
                id={`${uid}-ins`}
                className={AREA}
                maxLength={4000}
                value={d.instructions}
                onChange={(e) => set({ instructions: e.target.value })}
              />
            </Labelled>
          </section>

          {exercise ? (
            <>
              <section aria-labelledby={`${uid}-plan`} className={cx(SHELL, 'flex flex-col gap-4 p-5')}>
                <h2 id={`${uid}-plan`} className="m-0 text-[22px] font-bold leading-8">
                  Question plan (optional)
                </h2>
                <p className="m-0 text-sm leading-5 text-on-surface-variant">
                  Choose how many questions of each type and their marks. AA Pro adds empty questions for you to write.
                  It never writes or suggests questions.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[15px]">
                    <thead>
                      <tr className="text-left text-[13px] text-on-surface-variant">
                        <th scope="col" className="border-b-2 border-card-border p-2">
                          Question type
                        </th>
                        <th scope="col" className="border-b-2 border-card-border p-2">
                          How many
                        </th>
                        <th scope="col" className="border-b-2 border-card-border p-2">
                          Marks each
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {QUESTION_TYPES.map((t) => (
                        <tr key={t}>
                          <th scope="row" className="border-b border-card-border p-2 text-left font-medium">
                            {QUESTION_TYPE_LABEL[t]}
                          </th>
                          <td className="border-b border-card-border p-2">
                            <input
                              aria-label={`How many: ${QUESTION_TYPE_LABEL[t]}`}
                              className={SMALL}
                              inputMode="numeric"
                              value={plan[t].count}
                              onChange={(e) =>
                                setPlan((p) => ({ ...p, [t]: { ...p[t], count: digits(e.target.value) } }))
                              }
                            />
                          </td>
                          <td className="border-b border-card-border p-2">
                            <input
                              aria-label={`Marks each: ${QUESTION_TYPE_LABEL[t]}`}
                              className={SMALL}
                              inputMode="numeric"
                              value={plan[t].points}
                              onChange={(e) =>
                                setPlan((p) => ({ ...p, [t]: { ...p[t], points: digits(e.target.value) } }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    inactive={planned === 0 || questions.length + planned > LIMITS.questions}
                    onClick={() => {
                      const made = planQuestions(
                        QUESTION_TYPES.map((t) => ({
                          type: t,
                          count: Number(plan[t].count || 0),
                          points: Math.min(LIMITS.points, Number(plan[t].points || 0)),
                        })),
                      );
                      if (made && questions.length + made.length <= LIMITS.questions) {
                        change([...questions, ...made]);
                        setPlan(PLAN_START);
                      }
                    }}
                  >
                    {planned
                      ? `Add ${planned} empty ${planned === 1 ? 'question' : 'questions'} (${plannedMarks} marks)`
                      : 'Add empty questions'}
                  </Button>
                  {questions.length + planned > LIMITS.questions ? (
                    <span className="text-sm font-bold text-on-error-container">
                      A worksheet can have up to {LIMITS.questions} questions.
                    </span>
                  ) : null}
                </div>
                {options.worksheets.length ? (
                  <div className="flex flex-wrap items-end gap-3 border-t border-card-border pt-4">
                    <SelectField
                      name="b-copy"
                      label="Copy questions from"
                      value={copyFrom}
                      onChange={setCopyFrom}
                      options={[
                        ['', 'One of my worksheets'],
                        ...options.worksheets.map((w) => [w.id, `${w.title} (${w.questions})`] as const),
                      ]}
                    />
                    <Button
                      variant="secondary"
                      inactive={!copyFrom || copying}
                      onClick={() =>
                        startCopy(async () => {
                          const copied = await copyQuestionsAction(copyFrom);
                          if (!copied) {
                            setCopyNote('That worksheet is no longer available.');
                          } else if (questions.length + copied.length > LIMITS.questions) {
                            setCopyNote(`That would make more than ${LIMITS.questions} questions.`);
                          } else {
                            change([...questions, ...copied]);
                            setCopyNote(
                              `Copied ${copied.length} questions. They are independent: changing them here doesn’t change the other worksheet.`,
                            );
                          }
                        })
                      }
                    >
                      {copying ? 'Copying…' : 'Copy its questions'}
                    </Button>
                    {copyNote ? (
                      <p className="m-0 w-full text-sm leading-5" role="status">
                        {copyNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section aria-labelledby={`${uid}-qs`} className="flex flex-col gap-4">
                <h2 id={`${uid}-qs`} className="m-0 text-[22px] font-bold leading-8">
                  Questions{' '}
                  <span className="font-body text-[15px] font-medium text-on-surface-variant">
                    · {questions.length} · {totalPoints(questions)} marks
                    {emptyCount ? ` · ${emptyCount} still empty` : ''}
                  </span>
                </h2>
                {questions.map((q, i) => (
                  <QuestionEditor
                    key={i}
                    q={q}
                    index={i}
                    count={questions.length}
                    problems={problemsFor(i)}
                    showSourcePage={Boolean(d.sourceResourceId)}
                    onChange={(next) => change(questions.map((x, j) => (j === i ? next : x)))}
                    onMove={(delta) => {
                      const j = i + delta;
                      if (j < 0 || j >= questions.length) return;
                      const next = [...questions];
                      [next[i], next[j]] = [next[j]!, next[i]!];
                      change(next);
                    }}
                    onDelete={() => change(questions.filter((_, j) => j !== i))}
                  />
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">Add a question:</span>
                  {QUESTION_TYPES.map((t) => (
                    <Button
                      key={t}
                      variant="secondary"
                      className="min-h-11"
                      inactive={questions.length >= LIMITS.questions}
                      onClick={() => change([...questions, emptyQuestion(t)])}
                    >
                      <Icon name="add" size={18} />
                      {QUESTION_TYPE_LABEL[t]}
                    </Button>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          <div className="flex flex-wrap gap-3 border-t border-card-border pt-5">
            <Button type="submit" name="intent" value="ready" inactive={pending}>
              {pending ? 'Saving…' : 'Mark ready'}
            </Button>
            <Button type="submit" name="intent" value="draft" variant="secondary" inactive={pending}>
              Save as draft
            </Button>
            <LinkButton href="/teacher/homework" variant="secondary">
              Back to my worksheets
            </LinkButton>
          </div>
        </div>

        <aside className="flex flex-col gap-4" aria-label="Source and preview">
          <section aria-labelledby={`${uid}-src`} className={cx(SHELL, 'flex flex-col gap-3 p-5')}>
            <h2 id={`${uid}-src`} className="m-0 text-[20px] font-bold leading-7">
              Source (optional)
            </h2>
            {options.resources.length ? (
              <>
                <SelectField
                  name="b-source"
                  label="Work from"
                  value={d.sourceResourceId}
                  onChange={(v) => set({ sourceResourceId: v, ...(v ? {} : { sourceFromPage: '', sourceToPage: '' }) })}
                  error={bad('source') ? 'Check the source and its pages.' : undefined}
                  options={[
                    ['', 'No source'],
                    ...options.resources.map(
                      (r) => [r.id, `${r.title} (${SUBJECTS[r.subject as SubjectId].name})`] as const,
                    ),
                  ]}
                />
                {d.sourceResourceId ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Labelled id={`${uid}-from`} label="From page">
                      <input
                        id={`${uid}-from`}
                        className={FIELD}
                        inputMode="numeric"
                        value={d.sourceFromPage}
                        onChange={(e) => set({ sourceFromPage: digits(e.target.value, 4) })}
                      />
                    </Labelled>
                    <Labelled id={`${uid}-to`} label="To page">
                      <input
                        id={`${uid}-to`}
                        className={FIELD}
                        inputMode="numeric"
                        value={d.sourceToPage}
                        onChange={(e) => set({ sourceToPage: digits(e.target.value, 4) })}
                      />
                    </Labelled>
                  </div>
                ) : null}
                <p className="m-0 text-sm leading-5 text-on-surface-variant">
                  One of your own shared files. It is for you to work from; students see it only if you share it with
                  them.
                </p>
              </>
            ) : (
              <p className="m-0 text-sm leading-5 text-on-surface-variant">
                You can work from one of your shared files once you have shared one (Learning resources).
              </p>
            )}
          </section>
          {worksheet && exercise ? (
            <div className={cx(TILE)}>
              <span className={TILE_KEY}>Preview</span>
              <LinkButton href={`/teacher/homework/${worksheet.id}/preview`} variant="secondary">
                <Icon name="visibility" size={18} />
                Preview as a student
              </LinkButton>
              <span className="text-sm leading-5 text-on-surface-variant">Shows the last saved version.</span>
            </div>
          ) : null}
          <div className={TILE}>
            <span className={TILE_KEY}>Saving</span>
            <p className="m-0 text-sm leading-5">
              Saving keeps it in My worksheets only. Students get it only when you assign it, as their own copy. Later
              changes here never change a copy already given.
            </p>
          </div>
          <div className={TILE}>
            <span className={TILE_KEY}>Not included</span>
            <p className="m-0 text-sm leading-5">
              No AI questions and no AI marking. Automatic marking compares answers with the key you wrote.
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}
